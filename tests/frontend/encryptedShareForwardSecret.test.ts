/**
 * Orchestration wiring for FORWARD-SECRET (v2) sharing. Real crypto, mocked I/O —
 * proves the version dispatch: forwardSecret=on emits a v2 envelope and the round
 * trip goes through prekey resolution; a v1 record still reads back via the legacy
 * path (back-compat).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  shareWithRecipients,
  downloadShared,
  type EncryptedShareDeps,
  type ShareableFile,
  type SharedRecord,
} from '../../lib/encryptedShareOrchestration';
import { encryptForRecipients, type RecipientPublicKey } from '../../lib/recipientSharing';
import { generateIdentityKeyPair, exportPublicIdentity, importPublicIdentity } from '../../lib/recipientKeys';
import { createRatchet, ratchetForward, ratchetResolver, toRatchetRecipient } from '../../lib/postCompromiseRatchet';
import type { FSRecipientPublicKey } from '../../lib/forwardSecretSharing';

const PASS = 'pw';
const file: ShareableFile = { id: 'file-1', name: 'm.txt', type: 'text/plain', size: 3, gatewayUrl: 'https://gw/m' };

async function realIdentity(uid: string) {
  const pair = await generateIdentityKeyPair();
  const pub = await importPublicIdentity(await exportPublicIdentity(pair.publicKey));
  const ratchet = await createRatchet(PASS);
  return { uid, pub, priv: pair.privateKey, published: ratchet.published, state: ratchet.state };
}

describe('encryptedShareOrchestration — forward-secret (v2) wiring', () => {
  it('forwardSecret=on emits a v2 envelope and round-trips via prekey resolution', async () => {
    const me = await realIdentity('me-uid');
    const bob = await realIdentity('bob-uid');

    const stored: Record<string, SharedRecord> = {};
    const recipients: RecipientPublicKey[] = [{ id: bob.uid, publicKey: bob.pub }];

    const getRecipientFS = async (r: RecipientPublicKey): Promise<FSRecipientPublicKey> => {
      const who = r.id === me.uid ? me : bob;
      return toRatchetRecipient(r.id, r.publicKey, who.published);
    };

    const deps: EncryptedShareDeps = {
      self: { uid: me.uid, email: 'me@walt.dev' },
      resolveRecipientByEmail: vi.fn(),
      getMyPublicKey: async () => ({ id: me.uid, publicKey: me.pub }),
      getMyPrivateKey: async () => me.priv,
      forwardSecret: true,
      getRecipientFS,
      getMyPrekeyResolver: async (pass: string) => ratchetResolver(me.state, pass),
      fetchBytes: async () => new TextEncoder().encode('hey'),
      fetchByCid: vi.fn(),
      uploadCiphertext: vi.fn(async () => ({ cid: 'cid-1' })),
      writeSharedRecord: async (uid, rec) => {
        stored[uid] = rec;
      },
      readSharedWithMe: async () => [],
      triggerDownload: vi.fn(),
      newShareId: (() => {
        let n = 0;
        return () => `s-${++n}`;
      })(),
    };

    const records = await shareWithRecipients(file, recipients, deps);
    // self + bob each get a record; the envelope is v2.
    expect(records).toHaveLength(2);
    expect(records[0].meta.v).toBe(2);
    expect((records[0].meta as any).recipientAlg).toBe('ECDH-P256-2DH+HKDF-SHA256');
    expect((records[0].meta as any).keyLifecycle).toBe('ratchet-v1');
    const ciphertext = (deps.uploadCiphertext as any).mock.calls[0][0] as File;
    const ctBytes = await new Promise<Uint8Array>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(new Uint8Array(fr.result as ArrayBuffer));
      fr.onerror = () => reject(fr.error);
      fr.readAsArrayBuffer(ciphertext);
    });

    // Bob downloads his record: dispatch must take the v2 path and decrypt.
    const triggered: Uint8Array[] = [];
    const bobDeps: EncryptedShareDeps = {
      ...deps,
      self: { uid: bob.uid, email: 'bob@walt.dev' },
      getMyPrivateKey: async () => bob.priv,
      getMyPrekeyResolver: async (pass: string) => ratchetResolver(bob.state, pass),
      fetchByCid: async () => ctBytes,
      triggerDownload: (bytes) => triggered.push(bytes),
    };
    await downloadShared(stored[bob.uid], PASS, bobDeps);
    expect(new TextDecoder().decode(triggered[0])).toBe('hey');
  });

  it('ratchet-backed v2 inbox records expire after the recipient advances one epoch', async () => {
    const me = await realIdentity('me-uid');
    const bob = await realIdentity('bob-uid');

    const stored: Record<string, SharedRecord> = {};
    const getRecipientFS = async (r: RecipientPublicKey): Promise<FSRecipientPublicKey> => {
      const who = r.id === me.uid ? me : bob;
      return toRatchetRecipient(r.id, r.publicKey, who.published);
    };
    const deps: EncryptedShareDeps = {
      self: { uid: me.uid, email: 'me@walt.dev' },
      resolveRecipientByEmail: vi.fn(),
      getMyPublicKey: async () => ({ id: me.uid, publicKey: me.pub }),
      getMyPrivateKey: async () => me.priv,
      forwardSecret: true,
      getRecipientFS,
      getMyPrekeyResolver: async (pass: string) => ratchetResolver(me.state, pass),
      fetchBytes: async () => new TextEncoder().encode('expires'),
      fetchByCid: vi.fn(),
      uploadCiphertext: vi.fn(async () => ({ cid: 'cid-1' })),
      writeSharedRecord: async (uid, rec) => {
        stored[uid] = rec;
      },
      readSharedWithMe: async () => [],
      triggerDownload: vi.fn(),
    };

    await shareWithRecipients(file, [{ id: bob.uid, publicKey: bob.pub }], deps);
    const ciphertext = (deps.uploadCiphertext as any).mock.calls[0][0] as File;
    const ctBytes = await new Promise<Uint8Array>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(new Uint8Array(fr.result as ArrayBuffer));
      fr.onerror = () => reject(fr.error);
      fr.readAsArrayBuffer(ciphertext);
    });
    const { state: bobNext } = await ratchetForward(bob.state, PASS);

    await expect(
      downloadShared(stored[bob.uid], PASS, {
        ...deps,
        self: { uid: bob.uid, email: 'bob@walt.dev' },
        getMyPrivateKey: async () => bob.priv,
        getMyPrekeyResolver: async (pass: string) => ratchetResolver(bobNext, pass),
        fetchByCid: async () => ctBytes,
      })
    ).rejects.toThrow(/rotated out|forward-secret|ratcheted out|expired/i);
  });

  it('back-compat: a v1 record still downloads via the legacy path', async () => {
    const me = await realIdentity('me-uid');
    const bobPair = await generateIdentityKeyPair();
    const bobPub = await importPublicIdentity(await exportPublicIdentity(bobPair.publicKey));

    const { ciphertext, meta } = await encryptForRecipients(
      new TextEncoder().encode('legacy'),
      [{ id: 'bob-uid', publicKey: bobPub }],
      { name: 'm.txt', type: 'text/plain', size: 6 },
      'file-1'
    );
    const record: SharedRecord = {
      shareId: 's-1',
      from: 'me-uid',
      fromEmail: 'me@walt.dev',
      name: 'm.txt',
      type: 'text/plain',
      size: 6,
      cid: 'cid-1',
      meta,
      context: 'file-1',
      createdAt: 0,
    };

    const triggered: Uint8Array[] = [];
    const deps: EncryptedShareDeps = {
      self: { uid: 'bob-uid', email: 'bob@walt.dev' },
      resolveRecipientByEmail: vi.fn(),
      getMyPublicKey: vi.fn(),
      getMyPrivateKey: async () => bobPair.privateKey,
      // No FS deps wired — a v1 record must NOT need them.
      fetchBytes: vi.fn(),
      fetchByCid: async () => ciphertext,
      uploadCiphertext: vi.fn(),
      writeSharedRecord: vi.fn(),
      readSharedWithMe: async () => [],
      triggerDownload: (bytes) => triggered.push(bytes),
    };
    await downloadShared(record, 'unused', deps);
    expect(new TextDecoder().decode(triggered[0])).toBe('legacy');
  });
});
