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
  publishPrekeys,
  loadOwnPrekeyRing,
  lookupPrekeyBundleByUid,
} from '../lib/recipientDirectory';
import {
  createPrekeyRing,
  rotatePrekeyRing,
  pickPrekeyForWrap,
  prekeyResolver,
} from '../lib/recipientPrekeys';
import type { RecipientPublicKey } from '../lib/recipientSharing';
import type { FSRecipientPublicKey, PrekeyResolver } from '../lib/forwardSecretSharing';

export function useRecipientIdentity() {
  const { user } = useAuth();

  /** Create + publish this user's identity if they don't have one yet. Returns their uid. */
  const ensureIdentity = useCallback(
    async (passphrase: string): Promise<string> => {
      if (!user) throw new Error('Sign in to set up cryptographic sharing');
      if (!passphrase) throw new Error('A passphrase is required to set up your sharing identity');
      const existing = await loadOwnIdentity(user.uid);
      if (!existing.publicIdentity || !existing.encryptedIdentityKey) {
        const { publicIdentity, encryptedPrivateKey } = await createStoredIdentity(passphrase);
        await publishIdentity(user.uid, user.email || '', publicIdentity, encryptedPrivateKey);
      }
      // Forward-secret sharing also needs a published session-prekey ring. Create
      // one on first use; idempotent thereafter.
      const ring = await loadOwnPrekeyRing(user.uid);
      if (!ring) {
        const fresh = await createPrekeyRing(passphrase);
        await publishPrekeys(user.uid, user.email || '', fresh.bundle, fresh.encryptedRing);
      }
      return user.uid;
    },
    [user]
  );

  /** Rotate this user's prekey ring: add a fresh prekey, evict the oldest private. */
  const rotatePrekeys = useCallback(
    async (passphrase: string): Promise<string[]> => {
      if (!user) throw new Error('Sign in first');
      const ring = await loadOwnPrekeyRing(user.uid);
      if (!ring) throw new Error('No prekey ring found — enable encrypted sharing first');
      // The bundle (public halves) lives on the directory doc; rebuild it from the
      // ring's public projection is not possible (no public points stored locally),
      // so fetch the published bundle to rotate against it.
      const bundle = await lookupPrekeyBundleByUid(user.uid);
      if (!bundle) throw new Error('No published prekey bundle found to rotate');
      const rot = await rotatePrekeyRing(bundle, ring, passphrase);
      await publishPrekeys(user.uid, user.email || '', rot.bundle, rot.encryptedRing);
      return rot.evicted;
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

  /**
   * Upgrade an already-resolved recipient (id + identity key) to forward-secret
   * material by fetching their published prekey bundle and binding the newest
   * prekey. Throws if the recipient has not published any prekeys.
   */
  const getRecipientFS = useCallback(
    async (recipient: RecipientPublicKey): Promise<FSRecipientPublicKey> => {
      const bundle = await lookupPrekeyBundleByUid(recipient.id);
      if (!bundle) {
        throw new Error(
          `Recipient ${recipient.id} has not published session prekeys — they must re-open walt to enable forward-secret sharing`
        );
      }
      const prekey = await pickPrekeyForWrap(bundle);
      return { id: recipient.id, identityKey: recipient.publicKey, prekey };
    },
    []
  );

  /** Build a prekey resolver from this user's encrypted ring + passphrase (to read v2 inbox items). */
  const getMyPrekeyResolver = useCallback(
    async (passphrase: string): Promise<PrekeyResolver> => {
      if (!user) throw new Error('Sign in first');
      const ring = await loadOwnPrekeyRing(user.uid);
      if (!ring) throw new Error('No prekey ring found — enable encrypted sharing to create one');
      return prekeyResolver(ring, passphrase);
    },
    [user]
  );

  return {
    myUid: user?.uid ?? null,
    ensureIdentity,
    rotatePrekeys,
    getMyPrivateKey,
    resolveRecipientByEmail,
    getRecipientFS,
    getMyPrekeyResolver,
  };
}
