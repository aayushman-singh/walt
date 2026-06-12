/**
 * Post-compromise (healing) ratchet for recipient sharing keys (V5).
 *
 * ## What V4 already gives, and the gap this closes
 *
 * V4 (lib/recipientPrekeys + lib/forwardSecretSharing) gives *forward secrecy*: a
 * recipient keeps a bounded RING of session prekeys; evicting the oldest makes
 * shares bound to it unreadable. But the ring keeps MANY prekey privates live at
 * once, so an attacker who captures the recipient's live private key material at
 * time T can read every share wrapped to ANY of those still-resident prekeys, and
 * the ring only heals after a FULL turnover (ring-size rotations) — each rotation
 * evicts just the single oldest key while the others (including ones the attacker
 * holds) stay valid wrap targets. That is why V4 honestly documented "no PCS".
 *
 * ## The V5 property: single-step post-compromise healing
 *
 * This module replaces the ring with a single RATCHETING prekey:
 *
 *   - The recipient publishes exactly ONE current ratchet prekey (an ECDH P-256
 *     public point + a monotonic `epoch`). It is the only wrap target.
 *   - `ratchetForward` generates a brand-new keypair from FRESH CSPRNG entropy,
 *     bumps the epoch, publishes the new public point, and DROPS the prior private.
 *
 * Because the new private is independent fresh randomness and the prior private is
 * destroyed, ONE ratchet step both:
 *   - **heals (PCS):** an attacker who captured the epoch-n ratchet private (and the
 *     long-term identity private) at time T CANNOT read a share wrapped to epoch
 *     n+1 — that key never existed at T and is not derivable from anything that did.
 *   - **expires (FS):** epoch-n shares become unreadable the instant epoch n+1 is
 *     adopted, because epoch-n's private is gone.
 *
 * The confidentiality + identity-binding crypto is UNCHANGED: each wrap still mixes
 * ECDH(EK, IK_identity) ‖ ECDH(EK, PK_ratchet) exactly as lib/forwardSecretSharing.
 * A directory-substituted prekey is denial-of-service unless the attacker also has
 * the recipient identity private key. The ratchet is a *key-lifecycle* change, not
 * a new cipher.
 *
 * ## Honest scope (no overclaiming)
 *
 *   - PCS holds against compromise of the **private key material** (the ratchet and
 *     identity ECDH privates). It heals once the recipient ratchets in a session the
 *     attacker no longer observes.
 *   - PCS does NOT extend to a **passphrase / KEK** compromise: the ratchet private is
 *     stored encrypted under the user's passphrase, so an attacker who learns the
 *     passphrase AND keeps reading storage can decrypt future epochs too. Healing a
 *     passphrase compromise is out of scope (it requires a second factor / device and
 *     is fundamentally impossible against a party who keeps reading passphrase-locked
 *     storage). This is stated plainly in docs/crypto-post-compromise.md.
 *   - PCS does NOT defeat an active malicious directory that serves attacker-chosen
 *     ratchet prekeys while the attacker also holds the recipient identity private.
 *   - Healing is single-step but the heal/expiry window is the SAME interval (see the
 *     FS↔re-download tension in docs/crypto-forward-secrecy.md): once you ratchet,
 *     prior-epoch shares are gone for everyone, including the recipient.
 *
 * No fallbacks: a wrong passphrase, malformed published prekey, or tampered wrap
 * throws loudly. An out-of-epoch prekey id resolves to null (explicit expiry).
 */
import { encryptBytes, decryptBytes, toBase64, fromBase64, type EncryptionMeta } from './encryption';
import { FS_KEY_LIFECYCLE_RATCHET, type FSRecipientPublicKey, type PrekeyResolver } from './forwardSecretSharing';

export const RATCHET_VERSION = 1;
const EC_PARAMS = { name: 'ECDH', namedCurve: 'P-256' } as const;
const P256_RAW_POINT_BYTES = 65; // uncompressed: 0x04 ‖ X(32) ‖ Y(32)

/** The recipient's single CURRENT ratchet prekey, published to the directory. */
export interface PublishedRatchetPrekey {
  v: number;
  alg: 'ECDH-P256';
  /** Monotonic generation counter; bumped by every ratchet step. */
  epoch: number;
  /** Stable id for this epoch's prekey (bound into wrap AAD by the sender). */
  prekeyId: string;
  /** base64 raw (uncompressed) public EC point. */
  publicKey: string;
}

/** The recipient's owner-only ratchet state: the current epoch's private, at rest. */
export interface EncryptedRatchetState {
  v: number;
  epoch: number;
  prekeyId: string;
  /** base64 raw public EC point matching the encrypted private key. */
  publicKey: string;
  /** base64 PKCS#8 ciphertext of the current ratchet private key. */
  ciphertext: string;
  meta: EncryptionMeta;
}

function getSubtle(): SubtleCrypto {
  const c: Crypto | undefined = (globalThis as any).crypto;
  if (!c || !c.subtle) throw new Error('Web Crypto API is unavailable; cannot manage the ratchet');
  return c.subtle;
}
function newId(): string {
  const c: Crypto | undefined = (globalThis as any).crypto;
  if (!c?.randomUUID) throw new Error('crypto.randomUUID is unavailable; cannot mint a ratchet prekey id');
  return c.randomUUID();
}

async function generateRatchetPair(): Promise<CryptoKeyPair> {
  // Private extractable so it can be PKCS#8-exported for at-rest passphrase wrapping.
  return getSubtle().generateKey(EC_PARAMS, true, ['deriveBits']);
}

async function exportPublished(epoch: number, prekeyId: string, publicKey: CryptoKey): Promise<PublishedRatchetPrekey> {
  const raw = new Uint8Array(await getSubtle().exportKey('raw', publicKey));
  return { v: RATCHET_VERSION, alg: 'ECDH-P256', epoch, prekeyId, publicKey: toBase64(raw) };
}

async function encryptRatchetPrivate(
  epoch: number,
  prekeyId: string,
  privateKey: CryptoKey,
  publicKey: CryptoKey,
  passphrase: string
): Promise<EncryptedRatchetState> {
  const pkcs8 = new Uint8Array(await getSubtle().exportKey('pkcs8', privateKey));
  const publicRaw = new Uint8Array(await getSubtle().exportKey('raw', publicKey));
  const { ciphertext, meta } = await encryptBytes(pkcs8, passphrase, {
    name: `ratchet-epoch-${epoch}.pkcs8`,
    type: 'application/pkcs8',
    size: pkcs8.byteLength,
  });
  pkcs8.fill(0);
  return { v: RATCHET_VERSION, epoch, prekeyId, publicKey: toBase64(publicRaw), ciphertext: toBase64(ciphertext), meta };
}

/**
 * Decrypt and import the current epoch's ratchet private (non-extractable: it is
 * only ever used for ECDH deriveBits). Throws loudly on a wrong passphrase.
 */
async function unlockRatchetPrivate(state: EncryptedRatchetState, passphrase: string): Promise<CryptoKey> {
  const pkcs8 = await decryptBytes(fromBase64(state.ciphertext), state.meta, passphrase);
  const key = await getSubtle().importKey('pkcs8', pkcs8, EC_PARAMS, false, ['deriveBits']);
  pkcs8.fill(0);
  return key;
}

/** Create a fresh ratchet at epoch 0. Persist BOTH the published prekey and the state. */
export async function createRatchet(
  passphrase: string
): Promise<{ published: PublishedRatchetPrekey; state: EncryptedRatchetState }> {
  if (!passphrase) throw new Error('A passphrase is required to protect the ratchet private key');
  const epoch = 0;
  const prekeyId = newId();
  const pair = await generateRatchetPair();
  return {
    published: await exportPublished(epoch, prekeyId, pair.publicKey),
    state: await encryptRatchetPrivate(epoch, prekeyId, pair.privateKey, pair.publicKey, passphrase),
  };
}

/**
 * Advance the ratchet one step: mint a fresh keypair from new CSPRNG entropy, bump
 * the epoch, and DROP the prior private (it is simply not carried into the returned
 * state). The prior epoch is thereby evicted — its shares expire (FS) and any
 * attacker holding the prior private is healed out (PCS).
 *
 * Proves `passphrase` against the existing state first (decrypts the current private)
 * so a wrong passphrase fails loudly BEFORE we publish a new epoch — never stranding
 * the recipient with a published prekey whose private is locked under a typo.
 */
export async function ratchetForward(
  state: EncryptedRatchetState,
  passphrase: string
): Promise<{ published: PublishedRatchetPrekey; state: EncryptedRatchetState; evicted: { epoch: number; prekeyId: string } }> {
  if (!passphrase) throw new Error('A passphrase is required to ratchet forward');
  if (state.v !== RATCHET_VERSION) throw new Error(`Unsupported ratchet state version: v${state.v}`);
  if (!Number.isInteger(state.epoch) || state.epoch < 0) throw new Error('Malformed ratchet state: epoch must be a non-negative integer');
  // Prove the passphrase matches the current state before advancing (decrypt throws
  // "Incorrect passphrase ..." on a mismatch — surfaced as-is). Then discard it.
  const current = await unlockRatchetPrivate(state, passphrase);
  void current; // only needed to prove the passphrase; the key itself is not reused

  const epoch = state.epoch + 1;
  if (!Number.isSafeInteger(epoch)) throw new Error('Ratchet epoch overflow');
  const prekeyId = newId();
  const pair = await generateRatchetPair();
  return {
    published: await exportPublished(epoch, prekeyId, pair.publicKey),
    state: await encryptRatchetPrivate(epoch, prekeyId, pair.privateKey, pair.publicKey, passphrase),
    evicted: { epoch: state.epoch, prekeyId: state.prekeyId },
  };
}

/** Validate one untrusted PublishedRatchetPrekey pulled from the directory. */
function requireWellFormedPublished(p: unknown): PublishedRatchetPrekey {
  if (!p || typeof p !== 'object') throw new Error('Malformed ratchet prekey: not an object');
  const pk = p as Partial<PublishedRatchetPrekey>;
  if (pk.v !== RATCHET_VERSION) throw new Error(`Unsupported ratchet prekey version: v${pk.v}`);
  if (pk.alg !== 'ECDH-P256') throw new Error(`Malformed ratchet prekey: unsupported alg ${pk.alg}`);
  if (typeof pk.epoch !== 'number' || !Number.isInteger(pk.epoch) || pk.epoch < 0) {
    throw new Error('Malformed ratchet prekey: epoch must be a non-negative integer');
  }
  if (typeof pk.prekeyId !== 'string' || !pk.prekeyId) throw new Error('Malformed ratchet prekey: missing prekeyId');
  if (typeof pk.publicKey !== 'string' || !pk.publicKey) throw new Error('Malformed ratchet prekey: missing publicKey');
  const raw = fromBase64(pk.publicKey);
  if (raw.length !== P256_RAW_POINT_BYTES || raw[0] !== 0x04) {
    throw new Error('Malformed ratchet prekey: not a 65-byte uncompressed P-256 point');
  }
  return pk as PublishedRatchetPrekey;
}

/** Import the current published ratchet prekey as the wrap target {id, key}. */
export async function pickRatchetForWrap(published: PublishedRatchetPrekey): Promise<{ id: string; key: CryptoKey }> {
  const valid = requireWellFormedPublished(published);
  const key = await getSubtle().importKey('raw', fromBase64(valid.publicKey) as unknown as BufferSource, EC_PARAMS, true, []);
  return { id: valid.prekeyId, key };
}

/**
 * Build the sender-facing recipient material for a forward-secret wrap, binding the
 * recipient's current ratchet prekey. Pass the result straight to
 * encryptForRecipientsFS — the wrap is identical to V4's two-DH envelope.
 */
export async function toRatchetRecipient(
  recipientId: string,
  identityKey: CryptoKey,
  published: PublishedRatchetPrekey
): Promise<FSRecipientPublicKey> {
  const prekey = await pickRatchetForWrap(published);
  return { id: recipientId, identityKey, prekey: { ...prekey, keyLifecycle: FS_KEY_LIFECYCLE_RATCHET } };
}

/**
 * A PrekeyResolver over the recipient's CURRENT ratchet state. Resolves ONLY the
 * current epoch's prekeyId; any other id (a prior, evicted epoch) returns null, so
 * decryptForRecipientFS reports a clear "ratcheted out / expired" error instead of
 * an opaque crypto failure. That null is the post-compromise/forward-secret boundary.
 */
export function ratchetResolver(state: EncryptedRatchetState, passphrase: string): PrekeyResolver {
  if (state.v !== RATCHET_VERSION) throw new Error(`Unsupported ratchet state version: v${state.v}`);
  return async (prekeyId: string) => {
    if (prekeyId !== state.prekeyId) return null; // a prior epoch — ratcheted out
    return unlockRatchetPrivate(state, passphrase);
  };
}
