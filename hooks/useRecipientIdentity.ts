/**
 * useRecipientIdentity — the bridge between the cryptographic sharing primitives
 * (lib/recipientKeys + lib/recipientSharing) and the app's users.
 *
 * Responsibilities:
 *   - ensureIdentity: lazily create + publish the user's ECDH identity on first
 *     use (public key to the directory, private key encrypted under the user's
 *     passphrase). Idempotent.
 *   - getMyPrivateKey: decrypt the stored private key with the passphrase (to
 *     unwrap files shared TO this user).
 *   - resolveRecipientByEmail: turn a recipient's email into an importable public
 *     key + their uid (the recipientId used in the share envelope).
 *
 * No fallbacks: a missing recipient identity returns null and the UI must say so
 * — we never share to an unverified or substituted key.
 */
import { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  createStoredIdentity,
  importPrivateKeyEncrypted,
  importPublicIdentity,
} from '../lib/recipientKeys';
import {
  publishIdentity,
  loadOwnIdentity,
  lookupPublicIdentityByEmail,
} from '../lib/recipientDirectory';
import type { RecipientPublicKey } from '../lib/recipientSharing';

export function useRecipientIdentity() {
  const { user } = useAuth();

  /** Create + publish this user's identity if they don't have one yet. Returns their uid. */
  const ensureIdentity = useCallback(
    async (passphrase: string): Promise<string> => {
      if (!user) throw new Error('Sign in to set up cryptographic sharing');
      if (!passphrase) throw new Error('A passphrase is required to set up your sharing identity');
      const existing = await loadOwnIdentity(user.uid);
      if (existing.publicIdentity && existing.encryptedIdentityKey) return user.uid;
      const { publicIdentity, encryptedPrivateKey } = await createStoredIdentity(passphrase);
      await publishIdentity(user.uid, user.email || '', publicIdentity, encryptedPrivateKey);
      return user.uid;
    },
    [user]
  );

  /** Decrypt this user's private key to read files shared to them. */
  const getMyPrivateKey = useCallback(
    async (passphrase: string): Promise<CryptoKey> => {
      if (!user) throw new Error('Sign in first');
      const { encryptedIdentityKey } = await loadOwnIdentity(user.uid);
      if (!encryptedIdentityKey) {
        throw new Error('No sharing identity found — enable encrypted sharing to create one');
      }
      return importPrivateKeyEncrypted(encryptedIdentityKey, passphrase);
    },
    [user]
  );

  /** Resolve a recipient by email into a usable public key (null if they have no identity). */
  const resolveRecipientByEmail = useCallback(
    async (email: string): Promise<RecipientPublicKey | null> => {
      const found = await lookupPublicIdentityByEmail(email);
      if (!found) return null;
      const publicKey = await importPublicIdentity(found.publicIdentity);
      return { id: found.uid, publicKey };
    },
    []
  );

  return {
    myUid: user?.uid ?? null,
    ensureIdentity,
    getMyPrivateKey,
    resolveRecipientByEmail,
  };
}
