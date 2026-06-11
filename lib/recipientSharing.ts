/**
 * Multi-recipient encrypted sharing (ECIES key-wrapping over the Phase D DEK).
 *
 * A file is encrypted once with a random data-encryption key (DEK, AES-256-GCM).
 * The DEK is then wrapped SEPARATELY to each recipient's ECDH public key using
 * ephemeral-static ECDH + HKDF-SHA256 + AES-256-GCM (ECIES). To read the file a
 * recipient unwraps the DEK with their private key. The server stores only the
 * ciphertext and the per-recipient wrapped keys — it can never read the file, and
 * no shared secret is ever transmitted.
 *
 * - Add a recipient   → unwrap the DEK (as an existing reader) and re-wrap it to
 *                        the new public key. No re-encryption of the content.
 * - Remove a recipient → drop their wrap entry. (Forward secrecy against a removed
 *                        recipient who cached the DEK requires rotating the DEK on
 *                        the next write — see rotateForRecipients + the note below.)
 *
 * Fail-closed: a non-recipient, wrong key, or tampered wrap throws (GCM auth).
 */
import { toBase64, fromBase64 } from './encryption';

export const SHARE_VERSION = 1;
const EC_PARAMS = { name: 'ECDH', namedCurve: 'P-256' } as const;
const IV_BYTES = 12;
const SALT_BYTES = 16;
const DEK_BYTES = 32;
const HKDF_INFO = 'walt-recipient-wrap-v1';

/** One recipient's wrapped copy of the file DEK. */
export interface RecipientWrap {
  recipientId: string;
  epk: string; // base64 raw ephemeral public point
  salt: string; // base64 HKDF salt
  iv: string; // base64 AES-GCM IV for the wrap
  wrappedKey: string; // base64 AES-GCM( DEK )
}

/** Metadata for a file shared to one or more recipients. Public/safe to store. */
export interface SharedEncryptionMeta {
  v: number;
  alg: 'AES-GCM';
  recipientAlg: 'ECDH-P256+HKDF-SHA256';
  fileIv: string; // base64 IV for the content
  recipients: RecipientWrap[];
  originalName?: string;
  originalType?: string;
  originalSize?: number;
}

export interface RecipientPublicKey {
  id: string;
  publicKey: CryptoKey; // imported ECDH public key (see lib/recipientKeys.importPublicIdentity)
}

function getSubtle(): SubtleCrypto {
  const c: Crypto | undefined = (globalThis as any).crypto;
  if (!c || !c.subtle) throw new Error('Web Crypto API is unavailable; cannot share');
  return c.subtle;
}
function randomBytes(n: number): Uint8Array {
  const c: Crypto = (globalThis as any).crypto;
  if (!c?.getRandomValues) throw new Error('Secure RNG unavailable');
  return c.getRandomValues(new Uint8Array(n));
}

/**
 * AAD binding the wrap's public parameters so epk/salt/recipientId can't be
 * swapped, plus a caller-supplied `context` (e.g. the file id / record id) so a
 * valid wrap for recipient R cannot be replayed onto a DIFFERENT record for R.
 */
function wrapAAD(recipientId: string, epk: string, salt: string, context: string): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify([SHARE_VERSION, 'ECDH-P256+HKDF-SHA256', recipientId, epk, salt, context])
  );
}

/** Content AAD: stable header + context, but NOT the recipient list. */
function contentAAD(
  m: Pick<SharedEncryptionMeta, 'v' | 'alg' | 'recipientAlg' | 'fileIv' | 'originalName' | 'originalType' | 'originalSize'>,
  context: string
): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify([m.v, m.alg, m.recipientAlg, m.fileIv, m.originalName ?? null, m.originalType ?? null, m.originalSize ?? null, context])
  );
}

/** Derive the one-shot AES-GCM key for a wrap from an ECDH shared secret. */
async function deriveWrapKey(secret: ArrayBuffer, salt: Uint8Array, usage: KeyUsage): Promise<CryptoKey> {
  const subtle = getSubtle();
  const hkdf = await subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: salt as unknown as BufferSource, info: new TextEncoder().encode(HKDF_INFO) as unknown as BufferSource },
    hkdf,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage]
  );
}

/** Wrap a raw DEK to a single recipient public key (ECIES). */
export async function wrapKeyForRecipient(
  rawDek: Uint8Array,
  recipient: RecipientPublicKey,
  context = ''
): Promise<RecipientWrap> {
  const subtle = getSubtle();
  const ephemeral = await subtle.generateKey(EC_PARAMS, true, ['deriveBits']);
  const secret = await subtle.deriveBits({ name: 'ECDH', public: recipient.publicKey }, ephemeral.privateKey, 256);
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const epkRaw = new Uint8Array(await subtle.exportKey('raw', ephemeral.publicKey));
  const epk = toBase64(epkRaw);
  const saltB64 = toBase64(salt);
  const key = await deriveWrapKey(secret, salt, 'encrypt');
  const aad = wrapAAD(recipient.id, epk, saltB64, context);
  const wrapped = new Uint8Array(
    await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad as unknown as BufferSource }, key, rawDek as unknown as BufferSource)
  );
  return { recipientId: recipient.id, epk, salt: saltB64, iv: toBase64(iv), wrappedKey: toBase64(wrapped) };
}

/** Unwrap a DEK as the holder of the recipient private key. */
export async function unwrapKeyForRecipient(
  wrap: RecipientWrap,
  recipientPrivateKey: CryptoKey,
  context = ''
): Promise<Uint8Array> {
  const subtle = getSubtle();
  const epk = await subtle.importKey('raw', fromBase64(wrap.epk), EC_PARAMS, true, []);
  const secret = await subtle.deriveBits({ name: 'ECDH', public: epk }, recipientPrivateKey, 256);
  const key = await deriveWrapKey(secret, fromBase64(wrap.salt), 'decrypt');
  const aad = wrapAAD(wrap.recipientId, wrap.epk, wrap.salt, context);
  try {
    const raw = await subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(wrap.iv), additionalData: aad as unknown as BufferSource },
      key,
      fromBase64(wrap.wrappedKey) as unknown as BufferSource
    );
    return new Uint8Array(raw);
  } catch (cause) {
    throw new Error('Could not unwrap the file key — wrong recipient key or tampered wrap', { cause });
  }
}

/** Encrypt content once and wrap its DEK to every recipient. */
export async function encryptForRecipients(
  data: Uint8Array,
  recipients: RecipientPublicKey[],
  fileInfo?: { name?: string; type?: string; size?: number },
  context = ''
): Promise<{ ciphertext: Uint8Array; meta: SharedEncryptionMeta }> {
  if (recipients.length === 0) throw new Error('At least one recipient is required');
  const subtle = getSubtle();
  const dek = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const fileIv = randomBytes(IV_BYTES);

  const header = {
    v: SHARE_VERSION,
    alg: 'AES-GCM' as const,
    recipientAlg: 'ECDH-P256+HKDF-SHA256' as const,
    fileIv: toBase64(fileIv),
    originalName: fileInfo?.name,
    originalType: fileInfo?.type,
    originalSize: fileInfo?.size,
  };
  // Content AAD binds the stable header + caller context, but NOT the recipient
  // list, so adding or removing a recipient never invalidates the ciphertext.
  const aad = contentAAD(header, context);
  const ciphertext = new Uint8Array(
    await subtle.encrypt({ name: 'AES-GCM', iv: fileIv, additionalData: aad as unknown as BufferSource }, dek, data as unknown as BufferSource)
  );

  const rawDek = new Uint8Array(await subtle.exportKey('raw', dek));
  // Wrap to every recipient CONCURRENTLY (independent ECDH+HKDF+AES-GCM over the
  // same read-only rawDek). Promise.all preserves order, so meta.recipients still
  // mirrors `recipients`; rawDek is zeroed only after every wrap resolves.
  let wraps: RecipientWrap[];
  try {
    wraps = await Promise.all(recipients.map((r) => wrapKeyForRecipient(rawDek, r, context)));
  } finally {
    rawDek.fill(0);
  }

  return { ciphertext, meta: { ...header, recipients: wraps } };
}

/** Decrypt a shared file as a given recipient. `context` MUST match encryption. */
export async function decryptForRecipient(
  ciphertext: Uint8Array,
  meta: SharedEncryptionMeta,
  recipientId: string,
  recipientPrivateKey: CryptoKey,
  context = ''
): Promise<Uint8Array> {
  if (meta.v !== SHARE_VERSION) throw new Error(`Unsupported share format version: ${meta.v}`);
  if (meta.alg !== 'AES-GCM' || meta.recipientAlg !== 'ECDH-P256+HKDF-SHA256') {
    throw new Error(`Unsupported share cipher/KDF: ${meta.alg}/${meta.recipientAlg}`);
  }
  const wrap = meta.recipients.find((w) => w.recipientId === recipientId);
  if (!wrap) throw new Error('You are not a recipient of this file');

  const subtle = getSubtle();
  const rawDek = await unwrapKeyForRecipient(wrap, recipientPrivateKey, context);
  const dek = await subtle.importKey('raw', rawDek, { name: 'AES-GCM' }, false, ['decrypt']);
  rawDek.fill(0);
  try {
    const plain = await subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(meta.fileIv), additionalData: contentAAD(meta, context) as unknown as BufferSource },
      dek,
      ciphertext as unknown as BufferSource
    );
    return new Uint8Array(plain);
  } catch (cause) {
    throw new Error('Decryption failed — corrupted, truncated, or tampered ciphertext', { cause });
  }
}

/**
 * Grant access to an additional recipient without re-encrypting the content:
 * unwrap the DEK as an existing reader, then wrap it to the new recipient.
 */
export async function addRecipient(
  meta: SharedEncryptionMeta,
  asRecipientId: string,
  asRecipientPrivateKey: CryptoKey,
  newRecipient: RecipientPublicKey,
  context = ''
): Promise<SharedEncryptionMeta> {
  const mine = meta.recipients.find((w) => w.recipientId === asRecipientId);
  if (!mine) throw new Error('Only an existing recipient can add another recipient');
  if (meta.recipients.some((w) => w.recipientId === newRecipient.id)) return meta; // already shared
  const rawDek = await unwrapKeyForRecipient(mine, asRecipientPrivateKey, context);
  try {
    const wrap = await wrapKeyForRecipient(rawDek, newRecipient, context);
    return { ...meta, recipients: [...meta.recipients, wrap] };
  } finally {
    rawDek.fill(0);
  }
}

/**
 * Revoke a recipient by dropping their wrap entry. NOTE: this is forward-only —
 * a removed recipient who already cached the DEK can still read THIS ciphertext.
 * True revocation requires rotating the DEK (re-encrypt) on the next write; do
 * that with encryptForRecipients over the remaining recipients.
 */
export function removeRecipient(meta: SharedEncryptionMeta, recipientId: string): SharedEncryptionMeta {
  return { ...meta, recipients: meta.recipients.filter((w) => w.recipientId !== recipientId) };
}

/** Whether a record carries multi-recipient share metadata. */
export function isSharedEncrypted(meta: unknown): meta is SharedEncryptionMeta {
  return !!meta && typeof meta === 'object' && (meta as any).recipientAlg === 'ECDH-P256+HKDF-SHA256' && Array.isArray((meta as any).recipients);
}
