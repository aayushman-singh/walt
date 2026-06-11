/**
 * Forward-secret multi-recipient sharing (V4, envelope version 2).
 *
 * V1 (lib/recipientSharing) wraps a file's DEK with ECIES: a fresh *sender*
 * ephemeral ECDH key against the recipient's *long-term* identity key. That has
 * NO forward secrecy — the shared secret is ECDH(EK_sender, IK_recipient), and
 * IK_recipient is long-term, so one compromise of that private key recovers the
 * secret for every wrap ever made to the recipient.
 *
 * V2 mixes TWO Diffie–Hellman outputs into each wrap:
 *
 *     wrapSecret = HKDF( ECDH(EK, IK) ‖ ECDH(EK, PK), salt, info )
 *
 *   - ECDH(EK, IK): EK = fresh sender ephemeral, IK = recipient LONG-TERM identity
 *                   key. Binds the wrap to the published identity — an attacker who
 *                   swaps a prekey into the directory still needs IK_priv, so
 *                   substitution is denial-of-service, never disclosure.
 *   - ECDH(EK, PK): PK = recipient SESSION PREKEY whose private half is EVICTED on
 *                   rotation. This is the forward-secret term: once PK_priv is
 *                   deleted, no holder of IK_priv can reconstruct the secret for an
 *                   already-evicted share.
 *
 * Forward-secrecy granularity is per session prekey (the rotation interval), NOT a
 * double ratchet and NOT post-compromise security. See docs/crypto-forward-secrecy.md.
 *
 * Fail-closed: a non-recipient, missing/wrong prekey, or tampered wrap throws
 * (AES-GCM authentication). No fallbacks.
 */
import { toBase64, fromBase64 } from './encryption';

export const FS_SHARE_VERSION = 2;
export const FS_RECIPIENT_ALG = 'ECDH-P256-2DH+HKDF-SHA256' as const;
const EC_PARAMS = { name: 'ECDH', namedCurve: 'P-256' } as const;
const IV_BYTES = 12;
const SALT_BYTES = 16;
const HKDF_INFO = 'walt-fs-recipient-wrap-v2';

/** One recipient's forward-secret wrapped copy of the file DEK. */
export interface FSRecipientWrap {
  recipientId: string;
  /** Which recipient session prekey (PK) this wrap was bound to. */
  prekeyId: string;
  epk: string; // base64 raw sender ephemeral public point
  salt: string; // base64 HKDF salt
  iv: string; // base64 AES-GCM IV for the wrap
  wrappedKey: string; // base64 AES-GCM( DEK )
}

/** Metadata for a forward-secret shared file. Public/safe to store. */
export interface FSSharedEncryptionMeta {
  v: number; // 2
  alg: 'AES-GCM';
  recipientAlg: typeof FS_RECIPIENT_ALG;
  fileIv: string; // base64 IV for the content
  recipients: FSRecipientWrap[];
  originalName?: string;
  originalType?: string;
  originalSize?: number;
}

/** A recipient's public material for a forward-secret wrap. */
export interface FSRecipientPublicKey {
  id: string;
  /** Long-term identity ECDH public key (lib/recipientKeys.importPublicIdentity). */
  identityKey: CryptoKey;
  /** One session prekey to bind this wrap to. */
  prekey: { id: string; key: CryptoKey };
}

/** Resolve a recipient prekey id → its private CryptoKey (or null if evicted/unknown). */
export type PrekeyResolver = (prekeyId: string) => Promise<CryptoKey | null>;

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
 * AAD binding the wrap's public parameters (so recipientId/prekeyId/epk/salt cannot
 * be swapped) plus a caller `context` (the file id) so a valid wrap cannot be
 * replayed onto a DIFFERENT record for the same recipient.
 */
function wrapAAD(recipientId: string, prekeyId: string, epk: string, salt: string, context: string): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify([FS_SHARE_VERSION, FS_RECIPIENT_ALG, recipientId, prekeyId, epk, salt, context])
  );
}

/** Content AAD: stable header + context, but NOT the recipient list. */
function contentAAD(
  m: Pick<FSSharedEncryptionMeta, 'v' | 'alg' | 'recipientAlg' | 'fileIv' | 'originalName' | 'originalType' | 'originalSize'>,
  context: string
): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify([m.v, m.alg, m.recipientAlg, m.fileIv, m.originalName ?? null, m.originalType ?? null, m.originalSize ?? null, context])
  );
}

/** Concatenate two equal-curve ECDH outputs into one HKDF input keying material. */
function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/**
 * Derive the one-shot AES-GCM wrap key from the TWO-DH input keying material.
 * `ikm` = ECDH(EK,IK) ‖ ECDH(EK,PK). Both DH outputs are required, so neither the
 * identity key alone nor the prekey alone can reconstruct it.
 */
async function deriveWrapKey(ikm: Uint8Array, salt: Uint8Array, usage: KeyUsage): Promise<CryptoKey> {
  const subtle = getSubtle();
  const hkdf = await subtle.importKey('raw', ikm as unknown as BufferSource, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: salt as unknown as BufferSource, info: new TextEncoder().encode(HKDF_INFO) as unknown as BufferSource },
    hkdf,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage]
  );
}

/** Wrap a raw DEK to a single recipient (forward-secret, two-DH). */
export async function wrapKeyForRecipientFS(
  rawDek: Uint8Array,
  recipient: FSRecipientPublicKey,
  context = ''
): Promise<FSRecipientWrap> {
  const subtle = getSubtle();
  const ephemeral = await subtle.generateKey(EC_PARAMS, true, ['deriveBits']);
  const dhIdentity = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: recipient.identityKey }, ephemeral.privateKey, 256));
  const dhPrekey = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: recipient.prekey.key }, ephemeral.privateKey, 256));
  const ikm = concatBytes(dhIdentity, dhPrekey);
  dhIdentity.fill(0);
  dhPrekey.fill(0);

  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const epkRaw = new Uint8Array(await subtle.exportKey('raw', ephemeral.publicKey));
  const epk = toBase64(epkRaw);
  const saltB64 = toBase64(salt);
  const key = await deriveWrapKey(ikm, salt, 'encrypt');
  ikm.fill(0);
  const aad = wrapAAD(recipient.id, recipient.prekey.id, epk, saltB64, context);
  const wrapped = new Uint8Array(
    await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad as unknown as BufferSource }, key, rawDek as unknown as BufferSource)
  );
  return { recipientId: recipient.id, prekeyId: recipient.prekey.id, epk, salt: saltB64, iv: toBase64(iv), wrappedKey: toBase64(wrapped) };
}

/**
 * Unwrap a DEK as the recipient. Requires BOTH the long-term identity private key
 * AND the session prekey private key the wrap was bound to. Once the prekey private
 * is evicted, this is unrecoverable from the identity key alone — that is the
 * forward-secrecy guarantee.
 */
export async function unwrapKeyForRecipientFS(
  wrap: FSRecipientWrap,
  identityPrivateKey: CryptoKey,
  prekeyPrivateKey: CryptoKey,
  context = ''
): Promise<Uint8Array> {
  const subtle = getSubtle();
  const epk = await subtle.importKey('raw', fromBase64(wrap.epk), EC_PARAMS, true, []);
  const dhIdentity = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: epk }, identityPrivateKey, 256));
  const dhPrekey = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: epk }, prekeyPrivateKey, 256));
  const ikm = concatBytes(dhIdentity, dhPrekey);
  dhIdentity.fill(0);
  dhPrekey.fill(0);

  const key = await deriveWrapKey(ikm, fromBase64(wrap.salt), 'decrypt');
  ikm.fill(0);
  const aad = wrapAAD(wrap.recipientId, wrap.prekeyId, wrap.epk, wrap.salt, context);
  try {
    const raw = await subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(wrap.iv), additionalData: aad as unknown as BufferSource },
      key,
      fromBase64(wrap.wrappedKey) as unknown as BufferSource
    );
    return new Uint8Array(raw);
  } catch (cause) {
    throw new Error('Could not unwrap the file key — wrong identity/prekey or tampered wrap', { cause });
  }
}

/** Encrypt content once and forward-secretly wrap its DEK to every recipient. */
export async function encryptForRecipientsFS(
  data: Uint8Array,
  recipients: FSRecipientPublicKey[],
  fileInfo?: { name?: string; type?: string; size?: number },
  context = ''
): Promise<{ ciphertext: Uint8Array; meta: FSSharedEncryptionMeta }> {
  if (recipients.length === 0) throw new Error('At least one recipient is required');
  const subtle = getSubtle();
  const dek = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const fileIv = randomBytes(IV_BYTES);

  const header = {
    v: FS_SHARE_VERSION,
    alg: 'AES-GCM' as const,
    recipientAlg: FS_RECIPIENT_ALG,
    fileIv: toBase64(fileIv),
    originalName: fileInfo?.name,
    originalType: fileInfo?.type,
    originalSize: fileInfo?.size,
  };
  const aad = contentAAD(header, context);
  const ciphertext = new Uint8Array(
    await subtle.encrypt({ name: 'AES-GCM', iv: fileIv, additionalData: aad as unknown as BufferSource }, dek, data as unknown as BufferSource)
  );

  const rawDek = new Uint8Array(await subtle.exportKey('raw', dek));
  const wraps: FSRecipientWrap[] = [];
  try {
    for (const r of recipients) wraps.push(await wrapKeyForRecipientFS(rawDek, r, context));
  } finally {
    rawDek.fill(0);
  }

  return { ciphertext, meta: { ...header, recipients: wraps } };
}

/**
 * Decrypt a forward-secret shared file as a given recipient. `resolvePrekey` maps
 * the wrap's prekeyId to the private prekey; it MUST return null (not throw) when
 * the prekey has been evicted, so the caller gets a clear "forward-secret / expired"
 * error rather than an opaque crypto failure.
 */
export async function decryptForRecipientFS(
  ciphertext: Uint8Array,
  meta: FSSharedEncryptionMeta,
  recipientId: string,
  identityPrivateKey: CryptoKey,
  resolvePrekey: PrekeyResolver,
  context = ''
): Promise<Uint8Array> {
  if (meta.v !== FS_SHARE_VERSION) throw new Error(`Unsupported forward-secret share version: ${meta.v}`);
  if (meta.alg !== 'AES-GCM' || meta.recipientAlg !== FS_RECIPIENT_ALG) {
    throw new Error(`Unsupported forward-secret cipher/KDF: ${meta.alg}/${meta.recipientAlg}`);
  }
  const wrap = meta.recipients.find((w) => w.recipientId === recipientId);
  if (!wrap) throw new Error('You are not a recipient of this file');

  const prekeyPriv = await resolvePrekey(wrap.prekeyId);
  if (!prekeyPriv) {
    throw new Error(
      `The session prekey (${wrap.prekeyId}) for this share has been rotated out and its private key evicted — ` +
        'the share is now forward-secret and can no longer be decrypted. Re-share to grant access again.'
    );
  }

  const subtle = getSubtle();
  const rawDek = await unwrapKeyForRecipientFS(wrap, identityPrivateKey, prekeyPriv, context);
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

/** Whether a record carries forward-secret (v2) share metadata. */
export function isForwardSecretShare(meta: unknown): meta is FSSharedEncryptionMeta {
  return (
    !!meta &&
    typeof meta === 'object' &&
    (meta as any).recipientAlg === FS_RECIPIENT_ALG &&
    Array.isArray((meta as any).recipients)
  );
}
