/**
 * Client-side envelope encryption (AES-256-GCM + Argon2id).
 *
 * This is the module that turns "uncensorable Drive" into "uncensorable AND
 * private Drive". Files are encrypted in the browser BEFORE they ever reach the
 * backend or IPFS, so neither the server, the IPFS network, nor anyone who
 * learns a file's CID can read its contents without the user's passphrase.
 *
 * Scheme (envelope / zero-knowledge):
 *   1. A random 256-bit data-encryption key (DEK) encrypts the file bytes
 *      (AES-256-GCM, random 96-bit IV).
 *   2. A key-encryption key (KEK) is derived from the user's passphrase with
 *      Argon2id (memory-hard; resists brute force) over a random salt.
 *   3. The DEK is wrapped (encrypted) with the KEK.
 *   4. Only the ciphertext + the wrapped DEK + the PUBLIC KDF params (salt, iv,
 *      argon cost) ever leave the browser. All of that is safe to store on IPFS
 *      or in SQLite: without the passphrase the wrapped DEK is useless.
 *
 * Failure is loud by design (per project policy): a wrong passphrase or a
 * corrupted ciphertext throws — there is no silent "return the encrypted bytes"
 * fallback.
 */
import { argon2id } from 'hash-wasm';

export const ENCRYPTION_VERSION = 1;

/** Argon2id cost parameters. Interactive-grade: ~64 MiB, 3 passes. */
const ARGON_TIME_COST = 3;
const ARGON_MEMORY_COST_KIB = 64 * 1024; // 64 MiB
const ARGON_PARALLELISM = 1;

const SALT_BYTES = 16;
const IV_BYTES = 12; // 96-bit nonce, recommended for AES-GCM
const DEK_BYTES = 32; // AES-256

/**
 * Encryption metadata stored alongside a file (in the IPFS file-list + Firestore
 * record). Every field here is public — it reveals nothing without the passphrase.
 */
export interface EncryptionMeta {
  v: number; // format version
  alg: 'AES-GCM';
  kdf: 'argon2id';
  salt: string; // base64
  argonTimeCost: number;
  argonMemoryCost: number; // KiB
  argonParallelism: number;
  iv: string; // base64 — IV for the file ciphertext
  wrapIv: string; // base64 — IV used to wrap the DEK
  wrappedKey: string; // base64 — DEK encrypted under the KEK
  originalName?: string;
  originalType?: string;
  originalSize?: number;
}

function getSubtle(): SubtleCrypto {
  const c: Crypto | undefined = (globalThis as any).crypto;
  if (!c || !c.subtle) {
    throw new Error('Web Crypto API is unavailable in this environment; cannot encrypt/decrypt');
  }
  return c.subtle;
}

function randomBytes(n: number): Uint8Array {
  const c: Crypto = (globalThis as any).crypto;
  if (!c || !c.getRandomValues) {
    throw new Error('Secure RNG (crypto.getRandomValues) is unavailable');
  }
  return c.getRandomValues(new Uint8Array(n));
}

// Cross-environment base64 (browser + node, no Buffer dependency required).
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  if (typeof btoa !== 'undefined') return btoa(binary);
  return Buffer.from(bytes).toString('base64');
}

export function fromBase64(b64: string): Uint8Array {
  if (typeof atob !== 'undefined') {
    const binary = atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

/** Derive the key-encryption key from a passphrase via Argon2id. */
async function deriveKEK(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const raw = await argon2id({
    password: passphrase,
    salt,
    iterations: ARGON_TIME_COST,
    memorySize: ARGON_MEMORY_COST_KIB,
    parallelism: ARGON_PARALLELISM,
    hashLength: DEK_BYTES,
    outputType: 'binary',
  });
  return getSubtle().importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/**
 * Encrypt raw bytes. Returns the ciphertext and the public metadata needed to
 * decrypt it later (given the same passphrase).
 */
export async function encryptBytes(
  data: Uint8Array,
  passphrase: string,
  fileInfo?: { name?: string; type?: string; size?: number }
): Promise<{ ciphertext: Uint8Array; meta: EncryptionMeta }> {
  if (!passphrase) throw new Error('A passphrase is required to encrypt');
  const subtle = getSubtle();

  const salt = randomBytes(SALT_BYTES);
  const kek = await deriveKEK(passphrase, salt);

  // Random per-file DEK encrypts the actual content.
  const dek = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const iv = randomBytes(IV_BYTES);
  const ciphertext = new Uint8Array(
    await subtle.encrypt({ name: 'AES-GCM', iv }, dek, data as unknown as BufferSource)
  );

  // Wrap (encrypt) the DEK under the passphrase-derived KEK.
  const rawDek = new Uint8Array(await subtle.exportKey('raw', dek));
  const wrapIv = randomBytes(IV_BYTES);
  const wrappedKey = new Uint8Array(
    await subtle.encrypt({ name: 'AES-GCM', iv: wrapIv }, kek, rawDek as unknown as BufferSource)
  );

  const meta: EncryptionMeta = {
    v: ENCRYPTION_VERSION,
    alg: 'AES-GCM',
    kdf: 'argon2id',
    salt: toBase64(salt),
    argonTimeCost: ARGON_TIME_COST,
    argonMemoryCost: ARGON_MEMORY_COST_KIB,
    argonParallelism: ARGON_PARALLELISM,
    iv: toBase64(iv),
    wrapIv: toBase64(wrapIv),
    wrappedKey: toBase64(wrappedKey),
    originalName: fileInfo?.name,
    originalType: fileInfo?.type,
    originalSize: fileInfo?.size,
  };

  return { ciphertext, meta };
}

/**
 * Decrypt bytes produced by {@link encryptBytes}. Throws loudly on a wrong
 * passphrase or corrupted input (AES-GCM authentication failure).
 */
export async function decryptBytes(
  ciphertext: Uint8Array,
  meta: EncryptionMeta,
  passphrase: string
): Promise<Uint8Array> {
  if (!passphrase) throw new Error('A passphrase is required to decrypt');
  if (meta.v !== ENCRYPTION_VERSION) {
    throw new Error(`Unsupported encryption format version: ${meta.v}`);
  }
  const subtle = getSubtle();
  const kek = await deriveKEK(passphrase, fromBase64(meta.salt));

  let rawDek: ArrayBuffer;
  try {
    rawDek = await subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(meta.wrapIv) },
      kek,
      fromBase64(meta.wrappedKey) as unknown as BufferSource
    );
  } catch {
    // GCM auth tag mismatch on the wrapped key == wrong passphrase.
    throw new Error('Incorrect passphrase (could not unwrap the file key)');
  }

  const dek = await subtle.importKey('raw', rawDek, { name: 'AES-GCM' }, false, ['decrypt']);

  let plain: ArrayBuffer;
  try {
    plain = await subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(meta.iv) },
      dek,
      ciphertext as unknown as BufferSource
    );
  } catch {
    throw new Error('Decryption failed — the ciphertext is corrupted or truncated');
  }

  return new Uint8Array(plain);
}

/** Convenience: encrypt a File, returning an upload-ready Blob + metadata. */
export async function encryptFile(
  file: File,
  passphrase: string
): Promise<{ blob: Blob; meta: EncryptionMeta }> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const { ciphertext, meta } = await encryptBytes(buf, passphrase, {
    name: file.name,
    type: file.type,
    size: file.size,
  });
  // Copy into a fresh ArrayBuffer-backed Uint8Array for Blob construction.
  return { blob: new Blob([ciphertext.slice()], { type: 'application/octet-stream' }), meta };
}

/** Convenience: decrypt downloaded ciphertext back into a Blob with its original type. */
export async function decryptToBlob(
  ciphertext: Uint8Array,
  meta: EncryptionMeta,
  passphrase: string
): Promise<Blob> {
  const plain = await decryptBytes(ciphertext, meta, passphrase);
  return new Blob([plain.slice()], { type: meta.originalType || 'application/octet-stream' });
}

/** Whether a stored file record carries encryption metadata. */
export function isEncrypted(meta: unknown): meta is EncryptionMeta {
  return !!meta && typeof meta === 'object' && (meta as any).v === ENCRYPTION_VERSION && (meta as any).alg === 'AES-GCM';
}
