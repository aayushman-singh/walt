/**
 * Recipient session prekeys for forward-secret sharing (V4).
 *
 * Forward secrecy (lib/forwardSecretSharing) needs a SECOND recipient key whose
 * private half can be deleted independently of the long-term identity key. This
 * module manages that key's lifecycle:
 *
 *   - A recipient keeps a bounded RING of session prekeys (ECDH P-256).
 *   - PUBLIC halves are published in the directory (PrekeyBundle). Senders wrap to
 *     the NEWEST published prekey.
 *   - PRIVATE halves are PKCS#8 → Argon2id+AES-GCM encrypted under the user's
 *     passphrase (reusing lib/encryption), stored owner-only (EncryptedPrekeyRing).
 *   - On rotation, a fresh prekey is added and the OLDEST private is EVICTED. Any
 *     share bound to an evicted prekey is now forward-secret (its DH term cannot be
 *     reconstructed from the identity key) — and consequently no longer decryptable.
 *
 * Per-session forward secrecy, NOT a double ratchet. See docs/crypto-forward-secrecy.md.
 *
 * No fallbacks: a wrong passphrase, malformed ring, or empty bundle throws loudly.
 * An evicted prekey resolves to null (an explicit "expired", not a silent default).
 */
import { encryptBytes, decryptBytes, toBase64, fromBase64, type EncryptionMeta } from './encryption';

export const PREKEY_VERSION = 1;
export const DEFAULT_RING_SIZE = 5;
const EC_PARAMS = { name: 'ECDH', namedCurve: 'P-256' } as const;

/** One published session prekey. Safe to store in the public directory. */
export interface PublicPrekey {
  id: string;
  alg: 'ECDH-P256';
  /** Monotonic sequence; higher = newer. Senders pick the highest. */
  seq: number;
  /** base64 raw (uncompressed) public EC point. */
  publicKey: string;
}

/** The public prekey ring published alongside a user's identity. */
export interface PrekeyBundle {
  v: number;
  prekeys: PublicPrekey[];
}

/** One prekey's passphrase-encrypted private half (owner-only). */
export interface EncryptedPrekeyEntry {
  id: string;
  seq: number;
  ciphertext: string; // base64 PKCS#8 ciphertext
  meta: EncryptionMeta;
}

/** The owner-only encrypted prekey ring. */
export interface EncryptedPrekeyRing {
  v: number;
  /** Next sequence number to assign (monotonic; never reused). */
  nextSeq: number;
  entries: EncryptedPrekeyEntry[];
}

function getSubtle(): SubtleCrypto {
  const c: Crypto | undefined = (globalThis as any).crypto;
  if (!c || !c.subtle) throw new Error('Web Crypto API is unavailable; cannot manage prekeys');
  return c.subtle;
}
function newId(): string {
  const c: Crypto | undefined = (globalThis as any).crypto;
  if (!c?.randomUUID) throw new Error('crypto.randomUUID is unavailable; cannot mint a prekey id');
  return c.randomUUID();
}

async function generatePrekeyPair(): Promise<CryptoKeyPair> {
  return getSubtle().generateKey(EC_PARAMS, true, ['deriveBits']);
}

async function exportPublicPrekey(id: string, seq: number, publicKey: CryptoKey): Promise<PublicPrekey> {
  const raw = new Uint8Array(await getSubtle().exportKey('raw', publicKey));
  return { id, alg: 'ECDH-P256', seq, publicKey: toBase64(raw) };
}

async function encryptPrekeyPrivate(id: string, seq: number, privateKey: CryptoKey, passphrase: string): Promise<EncryptedPrekeyEntry> {
  const pkcs8 = new Uint8Array(await getSubtle().exportKey('pkcs8', privateKey));
  const { ciphertext, meta } = await encryptBytes(pkcs8, passphrase, {
    name: `prekey-${id}.pkcs8`,
    type: 'application/pkcs8',
    size: pkcs8.byteLength,
  });
  pkcs8.fill(0);
  return { id, seq, ciphertext: toBase64(ciphertext), meta };
}

/** Create a fresh prekey ring of `count` prekeys. */
export async function createPrekeyRing(
  passphrase: string,
  count = DEFAULT_RING_SIZE
): Promise<{ bundle: PrekeyBundle; encryptedRing: EncryptedPrekeyRing }> {
  if (!passphrase) throw new Error('A passphrase is required to protect prekeys');
  if (count < 1) throw new Error('A prekey ring needs at least one prekey');
  const prekeys: PublicPrekey[] = [];
  const entries: EncryptedPrekeyEntry[] = [];
  for (let seq = 0; seq < count; seq++) {
    const id = newId();
    const pair = await generatePrekeyPair();
    prekeys.push(await exportPublicPrekey(id, seq, pair.publicKey));
    entries.push(await encryptPrekeyPrivate(id, seq, pair.privateKey, passphrase));
  }
  return {
    bundle: { v: PREKEY_VERSION, prekeys },
    encryptedRing: { v: PREKEY_VERSION, nextSeq: count, entries },
  };
}

/**
 * Decrypt the newest ring entry to PROVE `passphrase` matches the ring's existing
 * private halves. This is the guard against publishing undecryptable prekeys: a
 * fresh prekey added under a passphrase that differs from the rest of the ring would
 * publish a public point whose private half no single passphrase can unlock. Senders
 * wrap to the newest published prekey, so that one typo strands every future v2 share.
 * Throws loudly (the underlying AES-GCM auth fails) on a wrong passphrase.
 */
export async function verifyRingPassphrase(encryptedRing: EncryptedPrekeyRing, passphrase: string): Promise<void> {
  if (encryptedRing.v !== PREKEY_VERSION) throw new Error(`Unsupported prekey ring version: v${encryptedRing.v}`);
  if (!Array.isArray(encryptedRing.entries) || encryptedRing.entries.length === 0) {
    throw new Error('Prekey ring is empty; there is no private half to verify the passphrase against');
  }
  const newest = encryptedRing.entries.reduce((a, b) => (b.seq > a.seq ? b : a));
  // decryptBytes throws "Incorrect passphrase ..." on a mismatch — surfaced as-is.
  const pkcs8 = await decryptBytes(fromBase64(newest.ciphertext), newest.meta, passphrase);
  pkcs8.fill(0);
}

/**
 * Assert the public bundle and the private ring describe the SAME set of prekeys —
 * same ids, same seqs, one-to-one. Drift (a public prekey with no matching private,
 * or vice versa) would publish a wrap target nobody can decrypt. Untrusted Firestore
 * data can drift, so this runs before AND after a rotation.
 */
function assertBundleRingParity(bundle: PrekeyBundle, ring: EncryptedPrekeyRing): void {
  if (!Array.isArray(bundle.prekeys) || !Array.isArray(ring.entries)) {
    throw new Error('Malformed prekey bundle/ring: prekeys and entries must be arrays');
  }
  if (bundle.prekeys.length !== ring.entries.length) {
    throw new Error(
      `Prekey bundle/ring drift: ${bundle.prekeys.length} public prekeys vs ${ring.entries.length} private entries`
    );
  }
  const ringById = new Map(ring.entries.map((e) => [e.id, e]));
  for (const p of bundle.prekeys) {
    const e = ringById.get(p.id);
    if (!e) throw new Error(`Prekey bundle/ring drift: public prekey ${p.id} has no matching private entry`);
    if (e.seq !== p.seq) {
      throw new Error(`Prekey bundle/ring drift: prekey ${p.id} seq ${p.seq} (public) != ${e.seq} (private)`);
    }
  }
}

/**
 * Rotate the ring: add ONE fresh prekey and evict the oldest so the ring stays at
 * most `ringSize`. Evicting the oldest private makes any share bound to it
 * forward-secret. Returns the new public bundle + encrypted ring; persist BOTH.
 *
 * Before rotating it (a) rejects a drifted bundle/ring and (b) proves `passphrase`
 * against the existing ring, so the fresh prekey is encrypted under the SAME passphrase
 * as the rest — never publishing an undecryptable wrap target. The kept private set is
 * derived from the kept PUBLIC set (not sliced independently) so the two cannot diverge.
 */
export async function rotatePrekeyRing(
  bundle: PrekeyBundle,
  encryptedRing: EncryptedPrekeyRing,
  passphrase: string,
  ringSize = DEFAULT_RING_SIZE
): Promise<{ bundle: PrekeyBundle; encryptedRing: EncryptedPrekeyRing; evicted: string[] }> {
  if (!passphrase) throw new Error('A passphrase is required to rotate prekeys');
  if (encryptedRing.v !== PREKEY_VERSION || bundle.v !== PREKEY_VERSION) {
    throw new Error(`Unsupported prekey version: bundle v${bundle.v} / ring v${encryptedRing.v}`);
  }
  if (!Number.isInteger(ringSize) || ringSize < 1) throw new Error('ringSize must be a positive integer');
  // Reject drifted directory data, then prove the passphrase matches the ring BEFORE
  // we encrypt a new prekey under it. Either failure aborts loudly — no mixed-passphrase
  // ring, no public-without-private prekey ever gets published.
  assertBundleRingParity(bundle, encryptedRing);
  await verifyRingPassphrase(encryptedRing, passphrase);

  const seq = encryptedRing.nextSeq;
  const id = newId();
  const pair = await generatePrekeyPair();
  const newPublic = await exportPublicPrekey(id, seq, pair.publicKey);
  const newEntry = await encryptPrekeyPrivate(id, seq, pair.privateKey, passphrase);

  const byNewestPublic = [...bundle.prekeys, newPublic].sort((a, b) => b.seq - a.seq).slice(0, ringSize);
  const keptIds = new Set(byNewestPublic.map((p) => p.id));
  // Derive the kept PRIVATE set from the kept PUBLIC set so the two are identical by
  // construction — never sliced on two separately-sorted lists that could disagree.
  const byNewestEntries = [...encryptedRing.entries, newEntry]
    .filter((e) => keptIds.has(e.id))
    .sort((a, b) => b.seq - a.seq);
  const evicted = [...encryptedRing.entries, newEntry].filter((e) => !keptIds.has(e.id)).map((e) => e.id);

  const rotatedBundle: PrekeyBundle = { v: PREKEY_VERSION, prekeys: byNewestPublic };
  const rotatedRing: EncryptedPrekeyRing = { v: PREKEY_VERSION, nextSeq: seq + 1, entries: byNewestEntries };
  // Belt-and-suspenders: what we are about to publish MUST be in parity.
  assertBundleRingParity(rotatedBundle, rotatedRing);

  return { bundle: rotatedBundle, encryptedRing: rotatedRing, evicted };
}

const P256_RAW_POINT_BYTES = 65; // uncompressed: 0x04 ‖ X(32) ‖ Y(32)

/** Validate one untrusted PublicPrekey pulled from the directory. */
function requireWellFormedPrekey(p: unknown): PublicPrekey {
  if (!p || typeof p !== 'object') throw new Error('Malformed prekey: not an object');
  const pk = p as Partial<PublicPrekey>;
  if (typeof pk.id !== 'string' || !pk.id) throw new Error('Malformed prekey: missing id');
  if (pk.alg !== 'ECDH-P256') throw new Error(`Malformed prekey ${pk.id}: unsupported alg ${pk.alg}`);
  if (typeof pk.seq !== 'number' || !Number.isInteger(pk.seq) || pk.seq < 0) {
    throw new Error(`Malformed prekey ${pk.id}: seq must be a non-negative integer`);
  }
  if (typeof pk.publicKey !== 'string' || !pk.publicKey) throw new Error(`Malformed prekey ${pk.id}: missing publicKey`);
  const raw = fromBase64(pk.publicKey);
  if (raw.length !== P256_RAW_POINT_BYTES || raw[0] !== 0x04) {
    throw new Error(`Malformed prekey ${pk.id}: not a 65-byte uncompressed P-256 point`);
  }
  return pk as PublicPrekey;
}

/** Pick the newest published prekey to wrap to, imported as a CryptoKey. */
export async function pickPrekeyForWrap(bundle: PrekeyBundle): Promise<{ id: string; key: CryptoKey }> {
  if (!bundle || typeof bundle !== 'object') throw new Error('Malformed prekey bundle');
  if (bundle.v !== PREKEY_VERSION) throw new Error(`Unsupported prekey bundle version: v${bundle.v}`);
  if (!Array.isArray(bundle.prekeys) || !bundle.prekeys.length) {
    throw new Error('Recipient has published no session prekeys; cannot share forward-secretly');
  }
  const valid = bundle.prekeys.map(requireWellFormedPrekey);
  const seen = new Set<string>();
  for (const p of valid) {
    if (seen.has(p.id)) throw new Error(`Malformed prekey bundle: duplicate prekey id ${p.id}`);
    seen.add(p.id);
  }
  const newest = valid.reduce((a, b) => (b.seq > a.seq ? b : a));
  const key = await getSubtle().importKey('raw', fromBase64(newest.publicKey) as unknown as BufferSource, EC_PARAMS, true, []);
  return { id: newest.id, key };
}

/**
 * Resolve a prekey id → its private CryptoKey, or null if it has been evicted
 * (rotated out of the ring). Returning null — not throwing — lets the caller report
 * a clear "this share is now forward-secret / expired" error.
 */
export async function resolvePrekeyPrivate(
  encryptedRing: EncryptedPrekeyRing,
  prekeyId: string,
  passphrase: string
): Promise<CryptoKey | null> {
  if (encryptedRing.v !== PREKEY_VERSION) throw new Error(`Unsupported prekey ring version: v${encryptedRing.v}`);
  const entry = encryptedRing.entries.find((e) => e.id === prekeyId);
  if (!entry) return null; // evicted — forward secrecy in effect
  const pkcs8 = await decryptBytes(fromBase64(entry.ciphertext), entry.meta, passphrase);
  // Non-extractable: the unlocked prekey private is only ever used for ECDH deriveBits.
  const key = await getSubtle().importKey('pkcs8', pkcs8, EC_PARAMS, false, ['deriveBits']);
  pkcs8.fill(0);
  return key;
}

/** A resolver bound to a ring + passphrase, for decryptForRecipientFS. */
export function prekeyResolver(encryptedRing: EncryptedPrekeyRing, passphrase: string): (id: string) => Promise<CryptoKey | null> {
  return (id: string) => resolvePrekeyPrivate(encryptedRing, id, passphrase);
}
