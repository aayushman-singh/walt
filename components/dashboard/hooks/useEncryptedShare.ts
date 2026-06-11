/**
 * useEncryptedShare — dashboard adapter for multi-recipient encrypted sharing.
 *
 * Thin React wrapper that supplies the real collaborators (auth, identity hook,
 * backend upload/download, Firestore inbox) to the framework-free orchestration
 * in lib/encryptedShareOrchestration. All crypto and directory logic lives in the
 * existing V2 libraries; this only wires them to the app.
 *
 * No fallbacks: a missing recipient identity, wrong decryption key, or failed
 * fetch propagates as a thrown error for the caller to surface loudly.
 */
import { useCallback } from 'react';
import {
  collection,
  doc,
  getDocs,
  setDoc,
} from 'firebase/firestore';
import { useAuth } from '../../../contexts/AuthContext';
import { useRecipientIdentity } from '../../../hooks/useRecipientIdentity';
import { db } from '../../../lib/firebase';
import { BackendFileAPI } from '../../../lib/backendClient';
import type { RecipientPublicKey } from '../../../lib/recipientSharing';
import {
  shareWithRecipients as shareImpl,
  listSharedWithMe as listImpl,
  downloadShared as downloadImpl,
  type EncryptedShareDeps,
  type ShareableFile,
  type SharedRecord,
} from '../../../lib/encryptedShareOrchestration';

export type { SharedRecord } from '../../../lib/encryptedShareOrchestration';

export function useEncryptedShare() {
  const { user } = useAuth();
  const {
    resolveRecipientByEmail,
    getMyPrivateKey,
    ensureIdentity,
    getRecipientFS,
    getMyPrekeyResolver,
    rotatePrekeys,
  } = useRecipientIdentity();

  // Forward-secret (v2) envelopes for NEW shares. Reading v1+v2 is ALWAYS on.
  // Defaults OFF: emitting v2 requires every participant to have a published prekey
  // ring AND a rotation driver in place (see docs/crypto-forward-secrecy.md, "Rollout").
  // Until that wiring ships, the live site keeps emitting v1 so sharing never breaks.
  // Set NEXT_PUBLIC_FS_SHARING=on to opt a build into emitting forward-secret shares.
  const forwardSecret = process.env.NEXT_PUBLIC_FS_SHARING === 'on';

  /** Build the dependency bundle for the current session. Throws if signed out. */
  const buildDeps = useCallback(async (): Promise<EncryptedShareDeps> => {
    if (!user) throw new Error('Sign in to share files end-to-end encrypted');
    const token = await user.getIdToken();
    const self = { uid: user.uid, email: user.email || '' };

    return {
      self,
      resolveRecipientByEmail,
      getMyPrivateKey,
      forwardSecret,
      getRecipientFS,
      getMyPrekeyResolver,
      getMyPublicKey: async () => {
        // The sender's own public key, resolved from the directory by email.
        const me = self.email ? await resolveRecipientByEmail(self.email) : null;
        if (!me) {
          throw new Error('You have no sharing identity yet — enable encrypted sharing to create one');
        }
        return me;
      },
      fetchBytes: async (url: string) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Could not fetch the file to share (HTTP ${res.status})`);
        return new Uint8Array(await res.arrayBuffer());
      },
      fetchByCid: async (cid: string) => {
        const blob = await BackendFileAPI.download(cid, token);
        return new Uint8Array(await blob.arrayBuffer());
      },
      uploadCiphertext: async (file: File) => {
        // Encrypted shares are pinned so the recipient can always retrieve them.
        const uploaded = await BackendFileAPI.upload(file, token, { isPinned: true });
        return { cid: uploaded.cid };
      },
      writeSharedRecord: async (recipientUid: string, record: SharedRecord) => {
        const ref = doc(db, 'sharedWithMe', recipientUid, 'items', record.shareId);
        await setDoc(ref, record);
      },
      readSharedWithMe: async (uid: string) => {
        const snap = await getDocs(collection(db, 'sharedWithMe', uid, 'items'));
        return snap.docs.map((d) => d.data() as SharedRecord);
      },
      triggerDownload: (bytes, name, type) => {
        const blob = new Blob([bytes.slice()], { type: type || 'application/octet-stream' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      },
    };
  }, [user, resolveRecipientByEmail, getMyPrivateKey, forwardSecret, getRecipientFS, getMyPrekeyResolver]);

  const shareWithRecipients = useCallback(
    async (file: ShareableFile, recipients: RecipientPublicKey[]) => {
      const deps = await buildDeps();
      return shareImpl(file, recipients, deps);
    },
    [buildDeps]
  );

  const listSharedWithMe = useCallback(async () => {
    const deps = await buildDeps();
    return listImpl(deps);
  }, [buildDeps]);

  const downloadShared = useCallback(
    async (record: SharedRecord, passphrase: string) => {
      const deps = await buildDeps();
      return downloadImpl(record, passphrase, deps);
    },
    [buildDeps]
  );

  return {
    myUid: user?.uid ?? null,
    /** Resolve an email to a recipient identity (null when they have none). */
    resolveRecipientByEmail,
    /** Lazily create + publish the current user's sharing identity + prekey ring. */
    ensureIdentity,
    /** Rotate the user's session prekeys (evicts the oldest → strengthens forward secrecy). */
    rotatePrekeys,
    shareWithRecipients,
    listSharedWithMe,
    downloadShared,
  };
}
