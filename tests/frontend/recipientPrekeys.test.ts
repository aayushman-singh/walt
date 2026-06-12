import { describe, it, expect } from 'vitest';
import {
  createPrekeyRing,
  rotatePrekeyRing,
  pickPrekeyForWrap,
  resolvePrekeyPrivate,
  prekeyResolver,
  verifyRingPassphrase,
  DEFAULT_RING_SIZE,
} from '../../lib/recipientPrekeys';
import { encryptForRecipientsFS, decryptForRecipientFS } from '../../lib/forwardSecretSharing';
import { generateIdentityKeyPair, exportPublicIdentity, importPublicIdentity } from '../../lib/recipientKeys';

const enc = new TextEncoder();
const dec = new TextDecoder();
const PASS = 'correct horse battery staple';

describe('lib/recipientPrekeys — lifecycle', () => {
  it('creates a full ring with monotonic sequences', async () => {
    const { bundle, encryptedRing } = await createPrekeyRing(PASS, 3);
    expect(bundle.prekeys).toHaveLength(3);
    expect(encryptedRing.entries).toHaveLength(3);
    expect(encryptedRing.nextSeq).toBe(3);
    expect(bundle.prekeys.map((p) => p.seq).sort()).toEqual([0, 1, 2]);
    // private halves are ciphertext, never plaintext PKCS#8
    expect(encryptedRing.entries[0].ciphertext).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it('pickPrekeyForWrap returns the NEWEST prekey', async () => {
    const { bundle } = await createPrekeyRing(PASS, 4);
    const picked = await pickPrekeyForWrap(bundle);
    const newest = bundle.prekeys.reduce((a, b) => (b.seq > a.seq ? b : a));
    expect(picked.id).toBe(newest.id);
  });

  it('resolves a live prekey private and rejects a wrong passphrase', async () => {
    const { bundle, encryptedRing } = await createPrekeyRing(PASS, 2);
    const id = bundle.prekeys[0].id;
    const key = await resolvePrekeyPrivate(encryptedRing, id, PASS);
    expect(key).not.toBeNull();
    await expect(resolvePrekeyPrivate(encryptedRing, id, 'wrong')).rejects.toThrow();
  });

  it('returns null for an unknown/evicted prekey id (explicit expiry, not a throw)', async () => {
    const { encryptedRing } = await createPrekeyRing(PASS, 1);
    expect(await resolvePrekeyPrivate(encryptedRing, 'does-not-exist', PASS)).toBeNull();
  });

  it('rotation evicts the oldest private and keeps the ring bounded', async () => {
    let { bundle, encryptedRing } = await createPrekeyRing(PASS, 2);
    const oldestId = bundle.prekeys.reduce((a, b) => (a.seq < b.seq ? a : b)).id;
    const rot = await rotatePrekeyRing(bundle, encryptedRing, PASS, 2);
    expect(rot.encryptedRing.entries).toHaveLength(2);
    expect(rot.bundle.prekeys).toHaveLength(2);
    expect(rot.evicted).toContain(oldestId);
    // evicted private is gone → resolves to null
    expect(await resolvePrekeyPrivate(rot.encryptedRing, oldestId, PASS)).toBeNull();
  });

  it('rejects malformed/untrusted prekey bundles from the directory', async () => {
    const { bundle } = await createPrekeyRing(PASS, 2);
    await expect(pickPrekeyForWrap({ v: 1, prekeys: [] })).rejects.toThrow(/no session prekeys/i);
    await expect(pickPrekeyForWrap({ v: 99, prekeys: bundle.prekeys } as any)).rejects.toThrow(/version/i);
    // duplicate ids
    const dup = { v: 1, prekeys: [bundle.prekeys[0], { ...bundle.prekeys[1], id: bundle.prekeys[0].id }] };
    await expect(pickPrekeyForWrap(dup as any)).rejects.toThrow(/duplicate/i);
    // bad point
    const badPoint = { v: 1, prekeys: [{ ...bundle.prekeys[0], publicKey: 'AAAA' }] };
    await expect(pickPrekeyForWrap(badPoint as any)).rejects.toThrow(/uncompressed P-256/i);
    // non-integer seq
    const badSeq = { v: 1, prekeys: [{ ...bundle.prekeys[0], seq: 1.5 }] };
    await expect(pickPrekeyForWrap(badSeq as any)).rejects.toThrow(/integer/i);
  });

  // ── REGRESSION: undecryptable-prekey guards (codex v4 merge-gate BLOCK) ──────
  it('verifyRingPassphrase accepts the correct passphrase and rejects a wrong one', async () => {
    const { encryptedRing } = await createPrekeyRing(PASS, 2);
    await expect(verifyRingPassphrase(encryptedRing, PASS)).resolves.toBeUndefined();
    await expect(verifyRingPassphrase(encryptedRing, 'WRONG-passphrase')).rejects.toThrow();
  });

  it('rotation under a WRONG passphrase throws — never publishes a mixed-passphrase ring', async () => {
    const { bundle, encryptedRing } = await createPrekeyRing(PASS, 3);
    // A typo at rotation must abort, not strand future v2 shares under a divergent key.
    await expect(rotatePrekeyRing(bundle, encryptedRing, 'typo-passphrase', 3)).rejects.toThrow(
      /passphrase|unwrap|incorrect/i
    );
  });

  it('rotation rejects a drifted bundle/ring (public prekey with no matching private)', async () => {
    const { bundle, encryptedRing } = await createPrekeyRing(PASS, 3);
    // Drop one private entry → 3 public vs 2 private. Rotating this must fail loudly,
    // not publish a newest public prekey whose private half is missing.
    const drifted = { ...encryptedRing, entries: encryptedRing.entries.slice(1) };
    await expect(rotatePrekeyRing(bundle, drifted, PASS, 3)).rejects.toThrow(/drift|parity|matching/i);
  });

  it('rotation rejects a non-positive ringSize', async () => {
    const { bundle, encryptedRing } = await createPrekeyRing(PASS, 2);
    await expect(rotatePrekeyRing(bundle, encryptedRing, PASS, 0)).rejects.toThrow(/ringSize|positive/i);
  });

  it('rotation keeps the published bundle and private ring in perfect parity', async () => {
    let { bundle, encryptedRing } = await createPrekeyRing(PASS, 3);
    for (let i = 0; i < 4; i++) {
      const rot = await rotatePrekeyRing(bundle, encryptedRing, PASS, 3);
      bundle = rot.bundle;
      encryptedRing = rot.encryptedRing;
      const pubIds = bundle.prekeys.map((p) => p.id).sort();
      const privIds = encryptedRing.entries.map((e) => e.id).sort();
      expect(pubIds).toEqual(privIds); // every public has its private half, and vice versa
      // the NEWEST published prekey (the one senders wrap to) is always resolvable
      const newest = bundle.prekeys.reduce((a, b) => (b.seq > a.seq ? b : a));
      expect(await resolvePrekeyPrivate(encryptedRing, newest.id, PASS)).not.toBeNull();
    }
  }, 20000);

  it('PROVISION → ROTATE → WRAP → UNWRAP: a wrap to the current newest prekey stays decryptable across rotation', async () => {
    // The mission invariant: a recipient must NEVER receive a share whose DEK they
    // cannot unwrap. Provision, rotate, THEN wrap to the live newest prekey, then rotate
    // again — the share must still decrypt while its prekey is within the ring window.
    const idPair = await generateIdentityKeyPair();
    const identityPub = await importPublicIdentity(await exportPublicIdentity(idPair.publicKey));
    const identityPriv = idPair.privateKey;

    let { bundle, encryptedRing } = await createPrekeyRing(PASS, DEFAULT_RING_SIZE);
    // rotate once before wrapping (simulates an already-rotated live user)
    let rot = await rotatePrekeyRing(bundle, encryptedRing, PASS, DEFAULT_RING_SIZE);
    bundle = rot.bundle;
    encryptedRing = rot.encryptedRing;

    // sender wraps to the CURRENT newest published prekey
    const pk = await pickPrekeyForWrap(bundle);
    const share = await encryptForRecipientsFS(enc.encode('LIVE-SECRET'), [
      { id: 'rcpt', identityKey: identityPub, prekey: pk },
    ]);

    // recipient can decrypt immediately
    expect(
      dec.decode(await decryptForRecipientFS(share.ciphertext, share.meta, 'rcpt', identityPriv, prekeyResolver(encryptedRing, PASS)))
    ).toBe('LIVE-SECRET');

    // one more rotation: the wrapped prekey is still inside the ring window → still decryptable
    rot = await rotatePrekeyRing(bundle, encryptedRing, PASS, DEFAULT_RING_SIZE);
    encryptedRing = rot.encryptedRing;
    expect(await resolvePrekeyPrivate(encryptedRing, pk.id, PASS)).not.toBeNull();
    expect(
      dec.decode(await decryptForRecipientFS(share.ciphertext, share.meta, 'rcpt', identityPriv, prekeyResolver(encryptedRing, PASS)))
    ).toBe('LIVE-SECRET');
  });

  it('END-TO-END forward secrecy through the real lifecycle', async () => {
    // recipient identity
    const idPair = await generateIdentityKeyPair();
    const identityPub = await importPublicIdentity(await exportPublicIdentity(idPair.publicKey));
    const identityPriv = idPair.privateKey;

    // recipient prekey ring
    let { bundle, encryptedRing } = await createPrekeyRing(PASS, DEFAULT_RING_SIZE);

    // sender wraps to the newest prekey
    const pk = await pickPrekeyForWrap(bundle);
    const prior = await encryptForRecipientsFS(enc.encode('PRIOR'), [
      { id: 'rcpt', identityKey: identityPub, prekey: pk },
    ]);
    const priorPrekeyId = pk.id;

    // recipient can read it now
    expect(
      dec.decode(
        await decryptForRecipientFS(prior.ciphertext, prior.meta, 'rcpt', identityPriv, prekeyResolver(encryptedRing, PASS))
      )
    ).toBe('PRIOR');

    // rotate the ring RING_SIZE times so the prior prekey is fully evicted
    for (let i = 0; i < DEFAULT_RING_SIZE; i++) {
      const rot = await rotatePrekeyRing(bundle, encryptedRing, PASS, DEFAULT_RING_SIZE);
      bundle = rot.bundle;
      encryptedRing = rot.encryptedRing;
    }

    // now even with the identity private key, the prior share is unrecoverable
    expect(await resolvePrekeyPrivate(encryptedRing, priorPrekeyId, PASS)).toBeNull();
    await expect(
      decryptForRecipientFS(prior.ciphertext, prior.meta, 'rcpt', identityPriv, prekeyResolver(encryptedRing, PASS))
    ).rejects.toThrow(/forward-secret|rotated out|evicted/i);
  }, 20000);
});
