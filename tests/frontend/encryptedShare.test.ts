/**
 * Unit tests for the framework-free encrypted-share orchestration
 * (lib/encryptedShareOrchestration). All side-effecting collaborators are
 * injected, so no React, backend, or Firestore is touched — we assert the WIRING:
 *   - self is included as a recipient,
 *   - encryptForRecipients is called with self + recipients and context=fileId,
 *   - the ciphertext is uploaded,
 *   - one inbox record is written per recipient,
 *   - download decrypts via decryptForRecipient and triggers a download.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the existing crypto libraries — we are testing orchestration, not crypto.
vi.mock('../../lib/recipientSharing', () => ({
  encryptForRecipients: vi.fn(),
  decryptForRecipient: vi.fn(),
}));
vi.mock('../../lib/encryption', () => ({
  decryptBytes: vi.fn(),
}));

import {
  shareWithRecipients,
  listSharedWithMe,
  downloadShared,
  getPlaintextBytes,
  type EncryptedShareDeps,
  type ShareableFile,
  type SharedRecord,
} from '../../lib/encryptedShareOrchestration';
import { encryptForRecipients, decryptForRecipient } from '../../lib/recipientSharing';
import { decryptBytes } from '../../lib/encryption';

const fakeKey = { type: 'public' } as unknown as CryptoKey;
const privKey = { type: 'private' } as unknown as CryptoKey;

function makeDeps(overrides: Partial<EncryptedShareDeps> = {}): EncryptedShareDeps {
  return {
    self: { uid: 'me-uid', email: 'me@walt.dev' },
    resolveRecipientByEmail: vi.fn(),
    getMyPublicKey: vi.fn(async () => ({ id: 'me-uid', publicKey: fakeKey })),
    getMyPrivateKey: vi.fn(async () => privKey),
    fetchBytes: vi.fn(async () => new Uint8Array([1, 2, 3])),
    fetchByCid: vi.fn(async () => new Uint8Array([9, 9, 9])),
    uploadCiphertext: vi.fn(async () => ({ cid: 'cid-123' })),
    writeSharedRecord: vi.fn(async () => undefined),
    readSharedWithMe: vi.fn(async () => []),
    triggerDownload: vi.fn(),
    newShareId: (() => {
      let n = 0;
      return () => `share-${++n}`;
    })(),
    ...overrides,
  };
}

const plaintextFile: ShareableFile = {
  id: 'file-abc',
  name: 'memo.txt',
  type: 'text/plain',
  size: 3,
  gatewayUrl: 'https://gw/ipfs/cidsrc',
};

beforeEach(() => {
  vi.clearAllMocks();
  (encryptForRecipients as any).mockResolvedValue({
    ciphertext: new Uint8Array([7, 7, 7]),
    meta: { v: 1, recipients: [{ recipientId: 'me-uid' }, { recipientId: 'bob-uid' }] },
  });
});

describe('shareWithRecipients', () => {
  it('encrypts to self + recipients with context = file id and uploads the ciphertext', async () => {
    const deps = makeDeps();
    const recipients = [{ id: 'bob-uid', publicKey: fakeKey }];

    await shareWithRecipients(plaintextFile, recipients, deps);

    expect(encryptForRecipients).toHaveBeenCalledTimes(1);
    const [bytes, allRecipients, fileInfo, context] = (encryptForRecipients as any).mock.calls[0];
    expect(bytes).toBeInstanceOf(Uint8Array);
    // self first, then bob — self is always a recipient.
    expect(allRecipients.map((r: any) => r.id)).toEqual(['me-uid', 'bob-uid']);
    expect(fileInfo).toMatchObject({ name: 'memo.txt', type: 'text/plain', size: 3 });
    expect(context).toBe('file-abc');

    expect(deps.uploadCiphertext).toHaveBeenCalledTimes(1);
  });

  it('writes one inbox record per recipient (self + each recipient)', async () => {
    const deps = makeDeps();
    const recipients = [{ id: 'bob-uid', publicKey: fakeKey }];

    const records = await shareWithRecipients(plaintextFile, recipients, deps);

    expect(deps.writeSharedRecord).toHaveBeenCalledTimes(2);
    const targets = (deps.writeSharedRecord as any).mock.calls.map((c: any[]) => c[0]);
    expect(targets).toEqual(['me-uid', 'bob-uid']);

    expect(records).toHaveLength(2);
    for (const r of records) {
      expect(r.cid).toBe('cid-123');
      expect(r.from).toBe('me-uid');
      expect(r.fromEmail).toBe('me@walt.dev');
      expect(r.context).toBe('file-abc'); // context persisted for decrypt
    }
  });

  it('does not duplicate self when self is also passed as a recipient', async () => {
    const deps = makeDeps();
    const recipients = [{ id: 'me-uid', publicKey: fakeKey }];

    await shareWithRecipients(plaintextFile, recipients, deps);

    const [, allRecipients] = (encryptForRecipients as any).mock.calls[0];
    expect(allRecipients.map((r: any) => r.id)).toEqual(['me-uid']);
    expect(deps.writeSharedRecord).toHaveBeenCalledTimes(1);
  });

  it('throws (no fallback) when there are no recipients', async () => {
    const deps = makeDeps();
    await expect(shareWithRecipients(plaintextFile, [], deps)).rejects.toThrow(/at least one recipient/i);
    expect(encryptForRecipients).not.toHaveBeenCalled();
  });
});

describe('getPlaintextBytes', () => {
  it('returns fetched bytes verbatim for a plaintext file', async () => {
    const deps = makeDeps();
    const bytes = await getPlaintextBytes(plaintextFile, deps);
    expect(Array.from(bytes)).toEqual([1, 2, 3]);
    expect(decryptBytes).not.toHaveBeenCalled();
  });

  it('decrypts a V1-encrypted source file with the passphrase before re-sharing', async () => {
    (decryptBytes as any).mockResolvedValue(new Uint8Array([4, 5, 6]));
    const deps = makeDeps({ getSourcePassphrase: vi.fn(async () => 'pw12345678') });
    const encFile: ShareableFile = { ...plaintextFile, encryption: { v: 1 } as any };

    const bytes = await getPlaintextBytes(encFile, deps);

    expect(decryptBytes).toHaveBeenCalledTimes(1);
    expect(Array.from(bytes)).toEqual([4, 5, 6]);
  });

  it('throws loudly when a V1 file needs a passphrase but none is provided', async () => {
    const deps = makeDeps({ getSourcePassphrase: vi.fn(async () => null) });
    const encFile: ShareableFile = { ...plaintextFile, encryption: { v: 1 } as any };
    await expect(getPlaintextBytes(encFile, deps)).rejects.toThrow(/passphrase/i);
  });
});

describe('listSharedWithMe', () => {
  it('reads the current user\'s inbox', async () => {
    const recs = [{ shareId: 's1' } as SharedRecord];
    const deps = makeDeps({ readSharedWithMe: vi.fn(async () => recs) });
    const out = await listSharedWithMe(deps);
    expect(deps.readSharedWithMe).toHaveBeenCalledWith('me-uid');
    expect(out).toBe(recs);
  });
});

describe('downloadShared', () => {
  const record: SharedRecord = {
    shareId: 's1',
    from: 'bob-uid',
    fromEmail: 'bob@walt.dev',
    name: 'memo.txt',
    type: 'text/plain',
    size: 3,
    cid: 'cid-123',
    meta: { originalName: 'memo.txt', originalType: 'text/plain', recipients: [] } as any,
    context: 'file-abc',
    createdAt: 1,
  };

  it('fetches ciphertext, decrypts as the recipient with the persisted context, and downloads', async () => {
    (decryptForRecipient as any).mockResolvedValue(new Uint8Array([1, 1, 1]));
    const deps = makeDeps();

    await downloadShared(record, 'pw12345678', deps);

    expect(deps.fetchByCid).toHaveBeenCalledWith('cid-123');
    expect(deps.getMyPrivateKey).toHaveBeenCalledWith('pw12345678');
    const [ct, meta, recipientId, key, context] = (decryptForRecipient as any).mock.calls[0];
    expect(ct).toBeInstanceOf(Uint8Array);
    expect(meta).toBe(record.meta);
    expect(recipientId).toBe('me-uid');
    expect(key).toBe(privKey);
    expect(context).toBe('file-abc'); // must match the encryption context
    expect(deps.triggerDownload).toHaveBeenCalledTimes(1);
    const [bytes, name] = (deps.triggerDownload as any).mock.calls[0];
    expect(Array.from(bytes)).toEqual([1, 1, 1]);
    expect(name).toBe('memo.txt');
  });

  it('propagates a wrong-key failure (no silent fallback)', async () => {
    (decryptForRecipient as any).mockRejectedValue(new Error('wrong recipient key'));
    const deps = makeDeps();
    await expect(downloadShared(record, 'badpass12', deps)).rejects.toThrow(/wrong recipient key/i);
    expect(deps.triggerDownload).not.toHaveBeenCalled();
  });
});
