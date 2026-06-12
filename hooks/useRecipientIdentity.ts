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
  loadOwnPrekeyRing,
  publishRatchet,
  publishRatchetRotation,
  loadOwnRatchetState,
  lookupRatchetPrekeyByUid,
} from '../lib/recipientDirectory';
import { prekeyResolver } from '../lib/recipientPrekeys';
import { createRatchet, ratchetForward, toRatchetRecipient, ratchetResolver } from '../lib/postCompromiseRatchet';
import type { EncryptedRatchetState, PublishedRatchetPrekey } from '../lib/postCompromiseRatchet';
import type { RecipientPublicKey } from '../lib/recipientSharing';
import {
  FS_KEY_LIFECYCLE_PREKEY_RING,
  FS_KEY_LIFECYCLE_RATCHET,
  type FSRecipientPublicKey,
  type FSSharedEncryptionMeta,
  type PrekeyResolver,
} from '../lib/forwardSecretSharing';

// Forward-secret (v2) ratchet material is only needed by a build that EMITS v2
// shares. Gate provisioning behind the same flag useEncryptedShare uses, so an
// FS-off build's v1 identity setup can never break on Firestore writes. Reading
// v2 is always on; this only gates whether we CREATE new ratchet material.
const FS_SHARING_ON = process.env.NEXT_PUBLIC_FS_SHARING === 'on';

function assertRatchetParity(published: PublishedRatchetPrekey | null, state: EncryptedRatchetState): PublishedRatchetPrekey {
  if (!published) {
    throw new Error('Ratchet state exists but no public ratchet prekey is published; refusing to guess a repair');
  }
  if (published.epoch !== state.epoch || published.prekeyId !== state.prekeyId || published.publicKey !== state.publicKey) {
    throw new Error(
      `Ratchet directory drift: public epoch ${published.epoch}/${published.prekeyId} != private epoch ${state.epoch}/${state.prekeyId}`
    );
  }
  return published;
}

async function verifyRatchetPassphrase(state: EncryptedRatchetState, passphrase: string): Promise<void> {
  const resolve = ratchetResolver(state, passphrase);
  const key = await resolve(state.prekeyId);
  if (!key) throw new Error(`Ratchet state could not resolve its own current prekey ${state.prekeyId}`);
}

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
      } else {
        // Identity already exists: PROVE the passphrase unlocks it before we encrypt any
        // new ratchet material under it. A typo'd passphrase would otherwise publish a
        // ratchet private no single passphrase can decrypt -> undecryptable v2 shares. This
        // binds the ratchet passphrase to the identity passphrase the recipient unlocks
        // with at decrypt time. Throws loudly on a mismatch.
        await importPrivateKeyEncrypted(existing.encryptedIdentityKey, passphrase);
      }
      // Forward-secret sharing also needs a published current ratchet prekey. Only
      // provision when this build emits v2 (FS flag on); create on first use,
      // idempotent thereafter. Existing ratchet state is verified against the public
      // directory and passphrase before use, so drift fails loudly.
      if (FS_SHARING_ON) {
        const state = await loadOwnRatchetState(user.uid);
        if (!state) {
          const published = await lookupRatchetPrekeyByUid(user.uid);
          if (published) {
            throw new Error('Public ratchet prekey exists but owner-only ratchet state is missing; refusing to overwrite');
          }
          const fresh = await createRatchet(passphrase);
          await publishRatchet(user.uid, user.email || '', fresh.published, fresh.state);
        } else {
          const published = await lookupRatchetPrekeyByUid(user.uid);
          assertRatchetParity(published, state);
          await verifyRatchetPassphrase(state, passphrase);
        }
      }
      return user.uid;
    },
    [user]
  );

  /**
   * Ratchet this user's sharing key one epoch forward. This emits a new current
   * public prekey and drops the prior private, so old ratchet-epoch shares expire
   * immediately. Kept under the historical name for the existing hook API.
   */
  const rotatePrekeys = useCallback(
    async (passphrase: string): Promise<string[]> => {
      if (!user) throw new Error('Sign in first');
      // Prove the passphrase against the existing identity first, so rotation can never
      // encrypt a fresh ratchet state under a passphrase that diverges from the one
      // the recipient unlocks with (ratchetForward also checks the current state).
      const { encryptedIdentityKey } = await loadOwnIdentity(user.uid);
      if (!encryptedIdentityKey) throw new Error('No sharing identity found — enable encrypted sharing first');
      await importPrivateKeyEncrypted(encryptedIdentityKey, passphrase);
      const state = await loadOwnRatchetState(user.uid);
      if (!state) throw new Error('No ratchet state found — enable encrypted sharing first');
      const published = await lookupRatchetPrekeyByUid(user.uid);
      assertRatchetParity(published, state);
      const rot = await ratchetForward(state, passphrase);
      await publishRatchetRotation(user.uid, user.email || '', state, rot.published, rot.state);
      return [rot.evicted.prekeyId];
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
   * material by fetching their CURRENT ratchet prekey. Throws if the recipient has
   * not published a ratchet prekey.
   */
  const getRecipientFS = useCallback(
    async (recipient: RecipientPublicKey): Promise<FSRecipientPublicKey> => {
      const published = await lookupRatchetPrekeyByUid(recipient.id);
      if (!published) {
        throw new Error(
          `Recipient ${recipient.id} has not published a ratchet prekey — they must re-open walt to enable forward-secret sharing`
        );
      }
      return toRatchetRecipient(recipient.id, recipient.publicKey, published);
    },
    []
  );

  /**
   * Build a resolver for v2 inbox items. New V5 shares resolve through the current
   * ratchet state. Legacy V4 ring shares remain readable only when the requested
   * prekey id is still present in the old ring; this is explicit compatibility,
   * not a substitute for missing ratchet state.
   */
  const getMyPrekeyResolver = useCallback(
    async (passphrase: string, meta?: FSSharedEncryptionMeta): Promise<PrekeyResolver> => {
      if (!user) throw new Error('Sign in first');
      const lifecycle = meta?.keyLifecycle ?? FS_KEY_LIFECYCLE_PREKEY_RING;
      if (lifecycle === FS_KEY_LIFECYCLE_RATCHET) {
        const ratchetState = await loadOwnRatchetState(user.uid);
        if (!ratchetState) throw new Error('No ratchet state found — enable encrypted sharing to create one');
        return ratchetResolver(ratchetState, passphrase);
      }
      if (lifecycle !== FS_KEY_LIFECYCLE_PREKEY_RING) {
        throw new Error(`Unsupported forward-secret key lifecycle: ${lifecycle}`);
      }
      const legacyRing = await loadOwnPrekeyRing(user.uid);
      if (!legacyRing) throw new Error('No legacy prekey ring found to read this prekey-ring v2 share');
      return prekeyResolver(legacyRing, passphrase);
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
