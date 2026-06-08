/**
 * Recipient identity keys (ECDH P-256) for cryptographic sharing.
 *
 * Phase D made a file private to its owner (passphrase → AES-256-GCM envelope).
 * This module adds an ASYMMETRIC identity so a file's data key can be wrapped to
 * *another walt user* without the server ever seeing it — sharing becomes
 * cryptography, not a server-trusted permission.
 *
 * Model:
 *   - Every user holds an ECDH P-256 key pair.
 *   - The PUBLIC key is published to a directory (safe to share; it's public).
 *   - The PRIVATE key is encrypted at rest with the user's existing passphrase
 *     (reusing lib/encryption's envelope), so the server only ever stores
 *     ciphertext. The passphrase that already unlocks a user's files is the same
 *     secret that unlocks their identity key — one secret, zero new trust.
 *
 * Public keys are exported as the 65-byte uncompressed EC point (base64). Private
 * keys are exported as PKCS#8 and then passphrase-encrypted.
 */
import { encryptBytes, decryptBytes, toBase64, fromBase64, type EncryptionMeta } from './encryption';

export const RECIPIENT_KEY_VERSION = 1;
const EC_PARAMS = { name: 'ECDH', namedCurve: 'P-256' } as const;

/** A user's published identity. Safe to store in a public directory. */
export interface PublicIdentity {
  v: number;
  alg: 'ECDH-P256';
  /** base64 of the raw (uncompressed) public EC point. */
  publicKey: string;
}

/** A user's private key, encrypted at rest under their passphrase. */
export interface EncryptedPrivateKey {
  v: number;
  alg: 'ECDH-P256';
  /** base64 PKCS#8 ciphertext + the envelope metadata needed to decrypt it. */
  ciphertext: string;
  meta: EncryptionMeta;
}

function getSubtle(): SubtleCrypto {
  const c: Crypto | undefined = (globalThis as any).crypto;
  if (!c || !c.subtle) throw new Error('Web Crypto API is unavailable; cannot manage identity keys');
  return c.subtle;
}

/** Generate a fresh ECDH P-256 identity key pair (private key extractable for at-rest wrapping). */
export async function generateIdentityKeyPair(): Promise<CryptoKeyPair> {
  return getSubtle().generateKey(EC_PARAMS, true, ['deriveBits']);
}

/** Export a public key to a directory-safe `PublicIdentity`. */
export async function exportPublicIdentity(publicKey: CryptoKey): Promise<PublicIdentity> {
  const raw = new Uint8Array(await getSubtle().exportKey('raw', publicKey));
  return { v: RECIPIENT_KEY_VERSION, alg: 'ECDH-P256', publicKey: toBase64(raw) };
}

/** Import a peer's `PublicIdentity` back into a usable ECDH public key. */
export async function importPublicIdentity(identity: PublicIdentity): Promise<CryptoKey> {
  if (identity.v !== RECIPIENT_KEY_VERSION || identity.alg !== 'ECDH-P256') {
    throw new Error(`Unsupported public identity: v${identity.v}/${identity.alg}`);
  }
  // Public ECDH keys carry no key usages in Web Crypto.
  return getSubtle().importKey('raw', fromBase64(identity.publicKey), EC_PARAMS, true, []);
}

/** Encrypt a private key at rest under the user's passphrase (PKCS#8 → envelope). */
export async function exportPrivateKeyEncrypted(
  privateKey: CryptoKey,
  passphrase: string
): Promise<EncryptedPrivateKey> {
  if (!passphrase) throw new Error('A passphrase is required to protect the identity key');
  const pkcs8 = new Uint8Array(await getSubtle().exportKey('pkcs8', privateKey));
  const { ciphertext, meta } = await encryptBytes(pkcs8, passphrase, {
    name: 'identity-key.pkcs8',
    type: 'application/pkcs8',
    size: pkcs8.byteLength,
  });
  pkcs8.fill(0); // best-effort: drop the plaintext private key bytes
  return { v: RECIPIENT_KEY_VERSION, alg: 'ECDH-P256', ciphertext: toBase64(ciphertext), meta };
}

/** Decrypt and import the private key (throws loudly on a wrong passphrase). */
export async function importPrivateKeyEncrypted(
  stored: EncryptedPrivateKey,
  passphrase: string
): Promise<CryptoKey> {
  if (stored.v !== RECIPIENT_KEY_VERSION || stored.alg !== 'ECDH-P256') {
    throw new Error(`Unsupported encrypted private key: v${stored.v}/${stored.alg}`);
  }
  const pkcs8 = await decryptBytes(fromBase64(stored.ciphertext), stored.meta, passphrase);
  return getSubtle().importKey('pkcs8', pkcs8, EC_PARAMS, true, ['deriveBits']);
}

/** Convenience: a fresh identity ready to publish + store. */
export async function createStoredIdentity(passphrase: string): Promise<{
  publicIdentity: PublicIdentity;
  encryptedPrivateKey: EncryptedPrivateKey;
}> {
  const pair = await generateIdentityKeyPair();
  return {
    publicIdentity: await exportPublicIdentity(pair.publicKey),
    encryptedPrivateKey: await exportPrivateKeyEncrypted(pair.privateKey, passphrase),
  };
}
