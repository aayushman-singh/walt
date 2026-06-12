import { describe, it, expect, beforeAll } from 'vitest';
import {
  createRatchet,
  ratchetForward,
  toRatchetRecipient,
  ratchetResolver,
  pickRatchetForWrap,
  RATCHET_VERSION,
  type EncryptedRatchetState,
  type PublishedRatchetPrekey,
} from '../../lib/postCompromiseRatchet';
import { encryptForRecipientsFS, decryptForRecipientFS, type PrekeyResolver } from '../../lib/forwardSecretSharing';
import { generateIdentityKeyPair, exportPublicIdentity, importPublicIdentity } from '../../lib/recipientKeys';

const enc = new TextEncoder();
const dec = new TextDecoder();
const PW = 'bob-passphrase-123';
const CTX = 'file-xyz';

async function makeIdentity() {
  const pair = await generateIdentityKeyPair();
  const pub = await importPublicIdentity(await exportPublicIdentity(pair.publicKey));
  return { pub, priv: pair.privateKey };
}

let bobId: { pub: CryptoKey; priv: CryptoKey };
beforeAll(async () => {
  bobId = await makeIdentity();
});

/** Wrap `plaintext` to bob's CURRENT published ratchet prekey. */
async function shareTo(published: PublishedRatchetPrekey, plaintext: string) {
  const recipient = await toRatchetRecipient('bob', bobId.pub, published);
  return encryptForRecipientsFS(enc.encode(plaintext), [recipient], { name: 'm.txt' }, CTX);
}

describe('lib/postCompromiseRatchet — single-step healing ratchet', () => {
  it('round-trips a share wrapped to the current epoch', async () => {
    const { published, state } = await createRatchet(PW);
    expect(published.epoch).toBe(0);
    expect(state.v).toBe(RATCHET_VERSION);
    const { ciphertext, meta } = await shareTo(published, 'hello epoch 0');
    const out = await decryptForRecipientFS(ciphertext, meta, 'bob', bobId.priv, ratchetResolver(state, PW), CTX);
    expect(dec.decode(out)).toBe('hello epoch 0');
  });

  it('ratchetForward bumps the epoch and mints a fresh prekey id', async () => {
    const { published: p0, state: s0 } = await createRatchet(PW);
    const { published: p1, state: s1, evicted } = await ratchetForward(s0, PW);
    expect(p1.epoch).toBe(1);
    expect(s1.epoch).toBe(1);
    expect(p1.prekeyId).not.toBe(p0.prekeyId);
    expect(p1.publicKey).not.toBe(p0.publicKey);
    expect(evicted).toEqual({ epoch: 0, prekeyId: p0.prekeyId });
  });

  // ── THE SUCCESS CRITERION: post-compromise security ───────────────────────
  it('PCS: pre-ratchet key material CANNOT read a share created AFTER one ratchet step', async () => {
    const { published: p0, state: s0 } = await createRatchet(PW);

    // ATTACKER COMPROMISE at time T: captures bob's long-term identity private AND
    // the epoch-0 ratchet private (the full live private key material).
    const capturedEpoch0Priv = await ratchetResolver(s0, PW)(p0.prekeyId);
    expect(capturedEpoch0Priv).not.toBeNull();
    const capturedIdentityPriv = bobId.priv;

    // Bob RATCHETS FORWARD once (fresh entropy the attacker never saw).
    const { published: p1, state: s1 } = await ratchetForward(s0, PW);

    // A FUTURE share is created, wrapped to the new epoch-1 prekey.
    const future = await shareTo(p1, 'POST-COMPROMISE-SECRET');

    // The attacker holds ONLY epoch-0 material. Model the strongest attacker: a
    // resolver that returns the captured epoch-0 private for ANY prekey id.
    const attackerResolver: PrekeyResolver = async () => capturedEpoch0Priv;
    await expect(
      decryptForRecipientFS(future.ciphertext, future.meta, 'bob', capturedIdentityPriv, attackerResolver, CTX)
    ).rejects.toThrow(/could not unwrap|wrong identity/i);

    // HEALED: bob, holding the post-ratchet epoch-1 state, still reads it fine.
    const out = await decryptForRecipientFS(future.ciphertext, future.meta, 'bob', bobId.priv, ratchetResolver(s1, PW), CTX);
    expect(dec.decode(out)).toBe('POST-COMPROMISE-SECRET');
  });

  it('FORWARD SECRECY: a prior-epoch share EXPIRES the instant the ratchet advances', async () => {
    const { published: p0, state: s0 } = await createRatchet(PW);
    const prior = await shareTo(p0, 'PRIOR');
    // Live: decrypts while epoch 0 is current.
    expect(dec.decode(await decryptForRecipientFS(prior.ciphertext, prior.meta, 'bob', bobId.priv, ratchetResolver(s0, PW), CTX))).toBe('PRIOR');

    // Ratchet to epoch 1: the new state resolves ONLY epoch 1, so epoch-0 shares are gone.
    const { state: s1 } = await ratchetForward(s0, PW);
    await expect(
      decryptForRecipientFS(prior.ciphertext, prior.meta, 'bob', bobId.priv, ratchetResolver(s1, PW), CTX)
    ).rejects.toThrow(/ratcheted out|rotated out|forward-secret|evicted|expired/i);
  });

  it('the ratchet prekey DH term genuinely contributes: epoch-0 private cannot unwrap an epoch-1 wrap', async () => {
    const { published: p0, state: s0 } = await createRatchet(PW);
    const { published: p1 } = await ratchetForward(s0, PW);
    const future = await shareTo(p1, 'needs epoch-1 key');
    // Force the epoch-0 private against the epoch-1 wrap → must fail in the GCM tag.
    const epoch0Priv = await ratchetResolver(s0, PW)(p0.prekeyId);
    const wrongResolver: PrekeyResolver = async () => epoch0Priv;
    await expect(
      decryptForRecipientFS(future.ciphertext, future.meta, 'bob', bobId.priv, wrongResolver, CTX)
    ).rejects.toThrow(/could not unwrap|wrong identity/i);
  });

  it('survives MANY consecutive ratchets — only the current epoch reads, all priors expire', async () => {
    let { published, state } = await createRatchet(PW);
    const shares: { published: PublishedRatchetPrekey; ct: Awaited<ReturnType<typeof shareTo>> }[] = [];
    for (let i = 0; i < 4; i++) {
      const ct = await shareTo(published, `epoch-${published.epoch}`);
      shares.push({ published, ct });
      ({ published, state } = await ratchetForward(state, PW));
    }
    // Final state resolves only the current epoch; the just-created current share reads.
    const current = await shareTo(published, 'current');
    expect(dec.decode(await decryptForRecipientFS(current.ciphertext, current.meta, 'bob', bobId.priv, ratchetResolver(state, PW), CTX))).toBe('current');
    // Every earlier epoch's share is now expired under the final state.
    for (const s of shares) {
      await expect(
        decryptForRecipientFS(s.ct.ciphertext, s.ct.meta, 'bob', bobId.priv, ratchetResolver(state, PW), CTX)
      ).rejects.toThrow(/ratcheted out|rotated out|forward-secret|evicted|expired/i);
    }
  });

  it('ratchetForward under a WRONG passphrase throws before publishing a new epoch', async () => {
    const { state } = await createRatchet(PW);
    await expect(ratchetForward(state, 'wrong-pass')).rejects.toThrow(/incorrect passphrase|could not unwrap/i);
  });

  it('ratchetResolver with a WRONG passphrase fails loudly when unlocking the current private', async () => {
    const { published, state } = await createRatchet(PW);
    const resolver = ratchetResolver(state, 'wrong-pass');
    await expect(resolver(published.prekeyId)).rejects.toThrow(/incorrect passphrase|could not unwrap/i);
  });

  it('rejects a malformed published ratchet prekey from the directory', async () => {
    await expect(pickRatchetForWrap({ v: 1, alg: 'ECDH-P256', epoch: 0, prekeyId: 'x', publicKey: 'AAAA' } as PublishedRatchetPrekey)).rejects.toThrow(
      /not a 65-byte uncompressed P-256 point/i
    );
    await expect(pickRatchetForWrap({ v: 99, alg: 'ECDH-P256', epoch: 0, prekeyId: 'x', publicKey: 'AAAA' } as unknown as PublishedRatchetPrekey)).rejects.toThrow(
      /unsupported ratchet prekey version/i
    );
  });
});
