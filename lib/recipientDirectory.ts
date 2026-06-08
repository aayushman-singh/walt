/**
 * Recipient directory — the public-key registry that makes cryptographic sharing
 * usable across users.
 *
 * Each user's ECDH PUBLIC identity (safe to expose) is published to their
 * Firestore user document under `publicIdentity`, keyed by email for lookup. The
 * encrypted PRIVATE key (passphrase-protected; see lib/recipientKeys) lives under
 * `encryptedIdentityKey` on the same doc — the server stores only ciphertext.
 *
 * No fallbacks: a lookup miss returns null and the caller must decide; we never
 * silently substitute a different key (that would be a confused-deputy hole).
 */
import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  limit,
  getDocs,
} from 'firebase/firestore';
import { db } from './firebase';
import type { PublicIdentity, EncryptedPrivateKey } from './recipientKeys';

/** Publish the current user's identity (public id + encrypted private key) to their doc. */
export async function publishIdentity(
  uid: string,
  email: string,
  publicIdentity: PublicIdentity,
  encryptedIdentityKey: EncryptedPrivateKey
): Promise<void> {
  if (!uid) throw new Error('uid is required to publish an identity');
  await setDoc(
    doc(db, 'users', uid),
    {
      // lower-cased for case-insensitive lookup by email
      emailLower: (email || '').toLowerCase() || null,
      publicIdentity,
      encryptedIdentityKey,
    },
    { merge: true }
  );
}

/** Load the current user's stored identity material, if any. */
export async function loadOwnIdentity(uid: string): Promise<{
  publicIdentity: PublicIdentity | null;
  encryptedIdentityKey: EncryptedPrivateKey | null;
}> {
  if (!uid) throw new Error('uid is required');
  const snap = await getDoc(doc(db, 'users', uid));
  const data = snap.exists() ? snap.data() : null;
  return {
    publicIdentity: (data?.publicIdentity as PublicIdentity) ?? null,
    encryptedIdentityKey: (data?.encryptedIdentityKey as EncryptedPrivateKey) ?? null,
  };
}

/** Look up another user's PUBLIC identity by uid. Returns null if they have none. */
export async function lookupPublicIdentityByUid(uid: string): Promise<PublicIdentity | null> {
  if (!uid) throw new Error('uid is required');
  const snap = await getDoc(doc(db, 'users', uid));
  return (snap.exists() ? (snap.data()?.publicIdentity as PublicIdentity) : null) ?? null;
}

/**
 * Look up another user's PUBLIC identity by email. Returns null if no user with
 * that email has published an identity (the caller must surface that — there is
 * no fallback to an unverified key).
 */
export async function lookupPublicIdentityByEmail(email: string): Promise<{ uid: string; publicIdentity: PublicIdentity } | null> {
  const emailLower = (email || '').trim().toLowerCase();
  if (!emailLower) throw new Error('email is required');
  const q = query(collection(db, 'users'), where('emailLower', '==', emailLower), limit(1));
  const results = await getDocs(q);
  if (results.empty) return null;
  const docSnap = results.docs[0];
  const identity = docSnap.data()?.publicIdentity as PublicIdentity | undefined;
  if (!identity) return null;
  return { uid: docSnap.id, publicIdentity: identity };
}
