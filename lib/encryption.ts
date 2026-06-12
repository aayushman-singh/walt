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
export const ARGON_TIME_COST = 3;
export const ARGON_MEMORY_COST_KIB = 64 * 1024; // 64 MiB
export const ARGON_PARALLELISM = 1;

/**
 * Minimum acceptable KDF cost on DECRYPT. A hostile party that controls the
 * stored metadata could otherwise set trivial Argon2 params and try to weaken a
 * future re-derivation; we refuse to derive a key with cost below these floors.
 */
export const ARGON_MIN_TIME_COST = 2;
export const ARGON_MIN_MEMORY_COST_KIB = 16 * 1024; // 16 MiB
export const ARGON_MIN_PARALLELISM = 1;

export const SALT_BYTES = 16;
export const IV_BYTES = 12; // 96-bit nonce, recommended for AES-GCM
export const DEK_BYTES = 32; // AES-256

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

export interface ArgonParams {
  timeCost: number;
  memoryCost: number; // KiB
  parallelism: number;
}

/**
 * Reject KDF cost params below the floors (tamper / downgrade guard). Shared by
 * every module that re-derives a KEK from stored, untrusted Argon parameters, so
 * the floor is enforced in exactly one place. Throws loudly on a sub-minimum param.
 */
export function assertArgonFloor(params: ArgonParams): void {
  if (
    !(params.timeCost >= ARGON_MIN_TIME_COST) ||
    !(params.memoryCost >= ARGON_MIN_MEMORY_COST_KIB) ||
    !(params.parallelism >= ARGON_MIN_PARALLELISM)
  ) {
    throw new Error('Refusing to derive a key with sub-minimum Argon2 parameters');
  }
}

/** Derive the key-encryption key from a passphrase via Argon2id. */
export async function deriveKEK(passphrase: string, salt: Uint8Array, params: ArgonParams): Promise<CryptoKey> {
  const raw = await argon2id({
    password: passphrase,
    salt,
    iterations: params.timeCost,
    memorySize: params.memoryCost,
    parallelism: params.parallelism,
    hashLength: DEK_BYTES,
    outputType: 'binary',
  });
  return getSubtle().importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/**
 * Additional Authenticated Data for the AES-GCM operations. Binding the format
 * version, cipher, KDF params and display metadata into the GCM tag means a
 * hostile store cannot tamper with any of those fields (or swap whole envelopes
 * between records) without the authentication check failing on decrypt.
 */
function buildAAD(meta: Pick<EncryptionMeta,
  'v' | 'alg' | 'kdf' | 'salt' | 'argonTimeCost' | 'argonMemoryCost' | 'argonParallelism'
  | 'originalName' | 'originalType' | 'originalSize'>): Uint8Array {
  const canonical = JSON.stringify([
    meta.v, meta.alg, meta.kdf, meta.salt,
    meta.argonTimeCost, meta.argonMemoryCost, meta.argonParallelism,
    meta.originalName ?? null, meta.originalType ?? null, meta.originalSize ?? null,
  ]);
  return new TextEncoder().encode(canonical);
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
  const kek = await deriveKEK(passphrase, salt, {
    timeCost: ARGON_TIME_COST,
    memoryCost: ARGON_MEMORY_COST_KIB,
    parallelism: ARGON_PARALLELISM,
  });

  // The authenticated (but unencrypted) header. Computed before encryption so it
  // can be bound into both GCM tags as AAD.
  const header = {
    v: ENCRYPTION_VERSION,
    alg: 'AES-GCM' as const,
    kdf: 'argon2id' as const,
    salt: toBase64(salt),
    argonTimeCost: ARGON_TIME_COST,
    argonMemoryCost: ARGON_MEMORY_COST_KIB,
    argonParallelism: ARGON_PARALLELISM,
    originalName: fileInfo?.name,
    originalType: fileInfo?.type,
    originalSize: fileInfo?.size,
  };
  const aad = buildAAD(header);

  // Random per-file DEK encrypts the actual content (content bound to the header).
  const dek = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const iv = randomBytes(IV_BYTES);
  const ciphertext = new Uint8Array(
    await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad as unknown as BufferSource }, dek, data as unknown as BufferSource)
  );

  // Wrap (encrypt) the DEK under the passphrase-derived KEK (also header-bound).
  const rawDek = new Uint8Array(await subtle.exportKey('raw', dek));
  const wrapIv = randomBytes(IV_BYTES);
  const wrappedKey = new Uint8Array(
    await subtle.encrypt({ name: 'AES-GCM', iv: wrapIv, additionalData: aad as unknown as BufferSource }, kek, rawDek as unknown as BufferSource)
  );
  rawDek.fill(0); // best-effort: don't leave the raw DEK lingering

  const meta: EncryptionMeta = {
    ...header,
    iv: toBase64(iv),
    wrapIv: toBase64(wrapIv),
    wrappedKey: toBase64(wrappedKey),
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
  if (meta.alg !== 'AES-GCM' || meta.kdf !== 'argon2id') {
    throw new Error(`Unsupported cipher/KDF: ${meta.alg}/${meta.kdf}`);
  }
  // Refuse cost params below the floor (tamper / downgrade guard).
  assertArgonFloor({ timeCost: meta.argonTimeCost, memoryCost: meta.argonMemoryCost, parallelism: meta.argonParallelism });

  const subtle = getSubtle();
  const kek = await deriveKEK(passphrase, fromBase64(meta.salt), {
    timeCost: meta.argonTimeCost,
    memoryCost: meta.argonMemoryCost,
    parallelism: meta.argonParallelism,
  });
  const aad = buildAAD(meta);

  let rawDek: ArrayBuffer;
  try {
    rawDek = await subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(meta.wrapIv), additionalData: aad as unknown as BufferSource },
      kek,
      fromBase64(meta.wrappedKey) as unknown as BufferSource
    );
  } catch (cause) {
    // GCM auth failure here == wrong passphrase OR a tampered header (AAD mismatch).
    throw new Error('Incorrect passphrase or tampered metadata (could not unwrap the file key)', { cause });
  }

  const dek = await subtle.importKey('raw', rawDek, { name: 'AES-GCM' }, false, ['decrypt']);

  let plain: ArrayBuffer;
  try {
    plain = await subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(meta.iv), additionalData: aad as unknown as BufferSource },
      dek,
      ciphertext as unknown as BufferSource
    );
  } catch (cause) {
    throw new Error('Decryption failed — the ciphertext is corrupted, truncated, or tampered', { cause });
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
