import { describe, it, expect } from 'vitest';
import {
  createPrekeyRing,
  rotatePrekeyRing,
  pickPrekeyForWrap,
  resolvePrekeyPrivate,
  prekeyResolver,
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
  });
});
