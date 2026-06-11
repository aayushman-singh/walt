/**
 * Pure orchestration for multi-recipient encrypted sharing.
 *
 * This module wires the EXISTING crypto/directory/upload primitives together
 * without any React. Keeping it framework-free makes the orchestration directly
 * unit-testable (see tests/frontend/encryptedShare.test.ts) and keeps the hook
 * (components/dashboard/hooks/useEncryptedShare.ts) a thin adapter.
 *
 * Flow:
 *   share    → get the file's PLAINTEXT bytes → encryptForRecipients (self +
 *              recipients, context = fileId) → upload ciphertext → write one
 *              inbox record per recipient at sharedWithMe/{uid}/items/{shareId}.
 *   download → fetch ciphertext by cid → unwrap+decrypt as the recipient →
 *              browser download under the original filename.
 *
 * No fallbacks (per project policy): a missing recipient identity, a wrong
 * decryption key, or a failed fetch throws loudly with context — we never
 * substitute a default or silently skip.
 */
import {
  encryptForRecipients,
  decryptForRecipient,
  type RecipientPublicKey,
  type SharedEncryptionMeta,
} from './recipientSharing';
import {
  encryptForRecipientsFS,
  decryptForRecipientFS,
  isForwardSecretShare,
  type FSRecipientPublicKey,
  type FSSharedEncryptionMeta,
  type PrekeyResolver,
} from './forwardSecretSharing';
import { decryptBytes, type EncryptionMeta } from './encryption';

/** Either share-envelope version. Decryption dispatches on `meta.v`. */
export type AnyShareMeta = SharedEncryptionMeta | FSSharedEncryptionMeta;

/** The minimal file shape the orchestration needs (subset of UploadedFile). */
export interface ShareableFile {
  id: string;
  name: string;
  type: string;
  size?: number;
  gatewayUrl: string;
  /** Present iff the stored bytes are a V1 (passphrase) ciphertext. */
  encryption?: EncryptionMeta;
}

/** One inbox record written to sharedWithMe/{recipientUid}/items/{shareId}. */
export interface SharedRecord {
  shareId: string;
  from: string;
  fromEmail: string;
  name: string;
  type: string;
  size: number;
  cid: string;
  meta: AnyShareMeta;
  /**
   * The AES-GCM context (the original file id) the envelope was encrypted under.
   * It MUST be replayed verbatim into decryptForRecipient — the meta does not
   * carry it, so we persist it on the record. It is not secret (it's a file id).
   */
  context: string;
  createdAt: number;
}

/** Result of an upload — the only field we depend on is the content id. */
export interface UploadResult {
  cid: string;
}

/**
 * The side-effecting collaborators the orchestration calls. Injected so tests
 * can mock them and the hook can supply the real implementations.
 */
export interface EncryptedShareDeps {
  /** Current signed-in user (the sender), who is always added as a recipient. */
  self: { uid: string; email: string };
  /** Resolve a recipient email → {id, publicKey}, or null if they have no identity. */
  resolveRecipientByEmail: (email: string) => Promise<RecipientPublicKey | null>;
  /** This user's own public key (so the sender can also read what they shared). */
  getMyPublicKey: () => Promise<RecipientPublicKey>;
  /** Decrypt this user's private key with their passphrase (to read inbox items). */
  getMyPrivateKey: (passphrase: string) => Promise<CryptoKey>;

  // ── Forward-secret (v2) collaborators. Required only when `forwardSecret` is on
  //    for sending, and whenever a v2 record must be read. ────────────────────
  /** Emit forward-secret (v2) envelopes for NEW shares. Reading v1+v2 is always on. */
  forwardSecret?: boolean;
  /**
   * Upgrade an already-resolved recipient (id + identity key) to forward-secret
   * material by fetching their published prekey bundle and binding the newest
   * prekey. Used for BOTH the sender (self) and every recipient.
   */
  getRecipientFS?: (recipient: RecipientPublicKey) => Promise<FSRecipientPublicKey>;
  /** Build a prekey resolver from this user's encrypted ring + passphrase (to read v2 inbox items). */
  getMyPrekeyResolver?: (passphrase: string) => Promise<PrekeyResolver>;
  /** Fetch raw bytes for a URL (gateway) — used to read the file to be shared. */
  fetchBytes: (url: string) => Promise<Uint8Array>;
  /** Fetch ciphertext bytes by content id (authed backend download). */
  fetchByCid: (cid: string) => Promise<Uint8Array>;
  /** Upload ciphertext bytes as a file; returns its content id. */
  uploadCiphertext: (file: File) => Promise<UploadResult>;
  /** Persist one inbox record at sharedWithMe/{recipientUid}/items/{shareId}. */
  writeSharedRecord: (recipientUid: string, record: SharedRecord) => Promise<void>;
  /** Read all inbox records for the current user. */
  readSharedWithMe: (uid: string) => Promise<SharedRecord[]>;
  /** Optional passphrase needed to read a V1-encrypted source file before re-sharing. */
  getSourcePassphrase?: () => Promise<string | null>;
  /** Trigger a browser download of decrypted bytes under a name. */
  triggerDownload: (bytes: Uint8Array, name: string, type: string) => void;
  /** Generate a unique share id (defaults to crypto.randomUUID). */
  newShareId?: () => string;
}

function defaultShareId(): string {
  const c: Crypto | undefined = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID();
  throw new Error('crypto.randomUUID is unavailable; cannot mint a share id');
}

/**
 * Obtain the PLAINTEXT bytes for a file to be re-encrypted to recipients.
 * V1-encrypted files are decrypted with the user's passphrase first; plaintext
 * files are fetched as-is. Throws loudly if a passphrase is required but absent.
 */
export async function getPlaintextBytes(
  file: ShareableFile,
  deps: Pick<EncryptedShareDeps, 'fetchBytes' | 'getSourcePassphrase'>
): Promise<Uint8Array> {
  const raw = await deps.fetchBytes(file.gatewayUrl);
  if (!file.encryption) return raw;
  if (!deps.getSourcePassphrase) {
    throw new Error('This file is encrypted; a passphrase is required to share it but none was provided');
  }
  const passphrase = await deps.getSourcePassphrase();
  if (!passphrase) {
    throw new Error('Sharing cancelled — no passphrase provided to decrypt the source file');
  }
  return decryptBytes(raw, file.encryption, passphrase);
}

/**
 * Encrypt a file to (self + recipients), upload the ciphertext, and write one
 * inbox record per recipient (including self, so the owner can still read it).
 * Returns the records that were written.
 */
export async function shareWithRecipients(
  file: ShareableFile,
  recipients: RecipientPublicKey[],
  deps: EncryptedShareDeps
): Promise<SharedRecord[]> {
  if (recipients.length === 0) throw new Error('Add at least one recipient to share');

  // The sender is always a recipient so they can still read their own file.
  const self = await deps.getMyPublicKey();
  const all: RecipientPublicKey[] = [self];
  for (const r of recipients) {
    if (!all.some((x) => x.id === r.id)) all.push(r);
  }

  const bytes = await getPlaintextBytes(file, deps);
  const fileInfo = { name: file.name, type: file.type, size: file.size };

  // context = file id binds each wrap/content to THIS file (replay protection).
  // Version dispatch: forward-secret (v2) when enabled, else legacy ECIES (v1).
  let ciphertext: Uint8Array;
  let meta: AnyShareMeta;
  if (deps.forwardSecret) {
    if (!deps.getRecipientFS) {
      throw new Error('Forward-secret sharing is enabled but no prekey resolver was supplied');
    }
    const fsRecipients: FSRecipientPublicKey[] = [];
    for (const r of all) fsRecipients.push(await deps.getRecipientFS(r));
    ({ ciphertext, meta } = await encryptForRecipientsFS(bytes, fsRecipients, fileInfo, file.id));
  } else {
    ({ ciphertext, meta } = await encryptForRecipients(bytes, all, fileInfo, file.id));
  }

  const ctFile = new File([ciphertext.slice()], `${file.name}.enc`, { type: 'application/octet-stream' });
  const { cid } = await deps.uploadCiphertext(ctFile);

  const mintId = deps.newShareId ?? defaultShareId;
  const createdAt = Date.now();
  const records: SharedRecord[] = [];
  for (const r of all) {
    const record: SharedRecord = {
      shareId: mintId(),
      from: deps.self.uid,
      fromEmail: deps.self.email,
      name: file.name,
      type: file.type,
      size: file.size ?? bytes.length,
      cid,
      meta,
      context: file.id,
      createdAt,
    };
    await deps.writeSharedRecord(r.id, record);
    records.push(record);
  }
  return records;
}

/** List all files shared TO the current user. */
export async function listSharedWithMe(deps: EncryptedShareDeps): Promise<SharedRecord[]> {
  return deps.readSharedWithMe(deps.self.uid);
}

/**
 * Decrypt and download a shared file as the current recipient. Fails loudly on a
 * wrong key or tampered ciphertext (AES-GCM authentication).
 */
export async function downloadShared(
  record: SharedRecord,
  passphrase: string,
  deps: EncryptedShareDeps
): Promise<void> {
  const ciphertext = await deps.fetchByCid(record.cid);
  const privateKey = await deps.getMyPrivateKey(passphrase);
  // context MUST match encryption verbatim — it was the original file id, bound
  // into every wrap and the content AAD. We persisted it on the record.
  // Version dispatch: read both v1 (legacy ECIES) and v2 (forward-secret) records.
  let bytes: Uint8Array;
  if (isForwardSecretShare(record.meta)) {
    if (!deps.getMyPrekeyResolver) {
      throw new Error('This is a forward-secret (v2) share but no prekey resolver is available to read it');
    }
    const resolvePrekey = await deps.getMyPrekeyResolver(passphrase);
    bytes = await decryptForRecipientFS(ciphertext, record.meta, deps.self.uid, privateKey, resolvePrekey, record.context);
  } else {
    bytes = await decryptForRecipient(ciphertext, record.meta, deps.self.uid, privateKey, record.context);
  }
  deps.triggerDownload(bytes, record.meta.originalName || record.name, record.meta.originalType || record.type);
}
