/**
 * Recipient directory — the public-key registry that makes cryptographic sharing
 * usable across users.
 *
 * Three distinct trust zones, deliberately separated (Firestore rules are
 * document-level, so confidentiality must be enforced by WHERE data lives):
 *   - `publicKeys/{uid}`            — PUBLIC: {emailLower, publicIdentity}.
 *                                     Readable by any authenticated user (the
 *                                     directory). Contains nothing secret.
 *   - `users/{uid}`                 — OWNER-ONLY: file-list pointer, prefs, etc.
 *                                     Never exposed to other users.
 *   - `users/{uid}/secrets/identityKey` — OWNER-ONLY: the passphrase-encrypted
 *                                     private key. Kept out of the directory so a
 *                                     peer's lookup can never hand them an
 *                                     offline cracking target.
 *
 * No fallbacks: a lookup miss returns null and the caller must decide; we never
 * silently substitute a different key (that would be a confused-deputy hole).
 *
 * TRUST NOTE: this directory is trust-on-first-use. It binds an email→public-key
 * mapping that the server (Firestore) asserts; a malicious directory could serve
 * an attacker's key (see DECISIONS #11). Out-of-band fingerprint verification is
 * the planned mitigation; until then the guarantee is "no PASSIVE server read",
 * not "defeats an actively malicious directory".
 */
import { doc, getDoc, setDoc, writeBatch, collection, query, where, limit, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import type { PublicIdentity, EncryptedPrivateKey } from './recipientKeys';
import type { PrekeyBundle, EncryptedPrekeyRing } from './recipientPrekeys';

const publicKeyDoc = (uid: string) => doc(db, 'publicKeys', uid);
const secretKeyDoc = (uid: string) => doc(db, 'users', uid, 'secrets', 'identityKey');
const prekeyRingDoc = (uid: string) => doc(db, 'users', uid, 'secrets', 'prekeys');

/** Publish the user's PUBLIC identity to the directory + store their encrypted private key owner-only. */
export async function publishIdentity(
  uid: string,
  email: string,
  publicIdentity: PublicIdentity,
  encryptedIdentityKey: EncryptedPrivateKey
): Promise<void> {
  if (!uid) throw new Error('uid is required to publish an identity');
  await setDoc(
    publicKeyDoc(uid),
    { uid, emailLower: (email || '').trim().toLowerCase() || null, publicIdentity },
    { merge: true }
  );
  await setDoc(secretKeyDoc(uid), { encryptedIdentityKey }, { merge: true });
}

/** Load the current user's stored identity material, if any. */
export async function loadOwnIdentity(uid: string): Promise<{
  publicIdentity: PublicIdentity | null;
  encryptedIdentityKey: EncryptedPrivateKey | null;
}> {
  if (!uid) throw new Error('uid is required');
  const [pubSnap, secretSnap] = await Promise.all([getDoc(publicKeyDoc(uid)), getDoc(secretKeyDoc(uid))]);
  return {
    publicIdentity: (pubSnap.exists() ? (pubSnap.data()?.publicIdentity as PublicIdentity) : null) ?? null,
    encryptedIdentityKey:
      (secretSnap.exists() ? (secretSnap.data()?.encryptedIdentityKey as EncryptedPrivateKey) : null) ?? null,
  };
}

/**
 * Publish the user's PUBLIC session-prekey bundle (forward-secret sharing) and
 * store their owner-only encrypted prekey ring. The bundle lives ON the public
 * directory doc (it is public by design); the ring's private halves stay in the
 * owner-only secrets subcollection. `email` is re-asserted so the directory write
 * rule (emailLower == token email) still holds on merge.
 */
export async function publishPrekeys(
  uid: string,
  email: string,
  bundle: PrekeyBundle,
  encryptedRing: EncryptedPrekeyRing
): Promise<void> {
  if (!uid) throw new Error('uid is required to publish prekeys');
  // Atomic: the PUBLIC bundle and the owner-only PRIVATE ring commit together, so a
  // partial failure can never publish a public prekey whose private half is missing
  // (or evict a private half while the stale public key remains live).
  const batch = writeBatch(db);
  batch.set(
    publicKeyDoc(uid),
    { uid, emailLower: (email || '').trim().toLowerCase() || null, prekeyBundle: bundle },
    { merge: true }
  );
  batch.set(prekeyRingDoc(uid), { encryptedPrekeyRing: encryptedRing }, { merge: true });
  await batch.commit();
}

/** Load the current user's owner-only encrypted prekey ring, if any. */
export async function loadOwnPrekeyRing(uid: string): Promise<EncryptedPrekeyRing | null> {
  if (!uid) throw new Error('uid is required');
  const snap = await getDoc(prekeyRingDoc(uid));
  return (snap.exists() ? (snap.data()?.encryptedPrekeyRing as EncryptedPrekeyRing) : null) ?? null;
}

/** Look up another user's PUBLIC prekey bundle by uid. Returns null if they have none. */
export async function lookupPrekeyBundleByUid(uid: string): Promise<PrekeyBundle | null> {
  if (!uid) throw new Error('uid is required');
  const snap = await getDoc(publicKeyDoc(uid));
  return (snap.exists() ? (snap.data()?.prekeyBundle as PrekeyBundle) : null) ?? null;
}

/** Look up another user's PUBLIC identity by uid. Returns null if they have none. */
export async function lookupPublicIdentityByUid(uid: string): Promise<PublicIdentity | null> {
  if (!uid) throw new Error('uid is required');
  const snap = await getDoc(publicKeyDoc(uid));
  return (snap.exists() ? (snap.data()?.publicIdentity as PublicIdentity) : null) ?? null;
}

/**
 * Look up another user's PUBLIC identity by email. Returns null if no user with
 * that email has published an identity (the caller must surface that — there is
 * no fallback to an unverified key).
 */
export async function lookupPublicIdentityByEmail(
  email: string
): Promise<{ uid: string; publicIdentity: PublicIdentity } | null> {
  const emailLower = (email || '').trim().toLowerCase();
  if (!emailLower) throw new Error('email is required');
  const q = query(collection(db, 'publicKeys'), where('emailLower', '==', emailLower), limit(1));
  const results = await getDocs(q);
  if (results.empty) return null;
  const docSnap = results.docs[0];
  const identity = docSnap.data()?.publicIdentity as PublicIdentity | undefined;
  if (!identity) return null;
  return { uid: docSnap.id, publicIdentity: identity };
}
