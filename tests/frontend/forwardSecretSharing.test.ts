import { describe, it, expect, beforeAll } from 'vitest';
import {
  encryptForRecipientsFS,
  decryptForRecipientFS,
  isForwardSecretShare,
  FS_RECIPIENT_ALG,
  type FSRecipientPublicKey,
  type PrekeyResolver,
} from '../../lib/forwardSecretSharing';
import { generateIdentityKeyPair, exportPublicIdentity, importPublicIdentity } from '../../lib/recipientKeys';

const enc = new TextEncoder();
const dec = new TextDecoder();

/** A recipient with a long-term identity AND a ring of session prekeys. */
interface FSRecipient {
  id: string;
  identityPub: CryptoKey;
  identityPriv: CryptoKey;
  /** id → {pub, priv}. A real recipient EVICTS priv on rotation; here tests delete to simulate. */
  prekeys: Map<string, { pub: CryptoKey; priv: CryptoKey }>;
}

async function makeIdentityKey() {
  const pair = await generateIdentityKeyPair();
  const pub = await importPublicIdentity(await exportPublicIdentity(pair.publicKey));
  return { pub, priv: pair.privateKey };
}

async function makeRecipient(id: string, prekeyIds: string[]): Promise<FSRecipient> {
  const idk = await makeIdentityKey();
  const prekeys = new Map<string, { pub: CryptoKey; priv: CryptoKey }>();
  for (const pkid of prekeyIds) {
    const pair = await generateIdentityKeyPair(); // same P-256 ECDH params
    prekeys.set(pkid, { pub: pair.publicKey, priv: pair.privateKey });
  }
  return { id, identityPub: idk.pub, identityPriv: idk.priv, prekeys };
}

/** Build the sender-facing public material binding a specific prekey id. */
function pubFor(r: FSRecipient, prekeyId: string): FSRecipientPublicKey {
  const pk = r.prekeys.get(prekeyId);
  if (!pk) throw new Error(`test bug: no prekey ${prekeyId}`);
  return { id: r.id, identityKey: r.identityPub, prekey: { id: prekeyId, key: pk.pub } };
}

/** A resolver over the recipient's CURRENT (post-eviction) prekey ring. */
function resolverFor(r: FSRecipient): PrekeyResolver {
  return async (prekeyId: string) => r.prekeys.get(prekeyId)?.priv ?? null;
}

let bob: FSRecipient, carol: FSRecipient, mallory: FSRecipient;
beforeAll(async () => {
  [bob, carol, mallory] = await Promise.all([
    makeRecipient('bob', ['pk-old', 'pk-new']),
    makeRecipient('carol', ['pk-c1']),
    makeRecipient('mallory', ['pk-m1']),
  ]);
});

describe('lib/forwardSecretSharing — V2 two-DH envelope', () => {
  it('round-trips and is tagged as a forward-secret share', async () => {
    const { ciphertext, meta } = await encryptForRecipientsFS(enc.encode('fs hello'), [pubFor(bob, 'pk-new')], {
      name: 'm.txt',
      type: 'text/plain',
      size: 8,
    });
    expect(meta.v).toBe(2);
    expect(meta.recipientAlg).toBe(FS_RECIPIENT_ALG);
    expect(isForwardSecretShare(meta)).toBe(true);
    expect(meta.recipients[0].prekeyId).toBe('pk-new');
    expect(dec.decode(ciphertext)).not.toContain('fs hello');

    const out = await decryptForRecipientFS(ciphertext, meta, 'bob', bob.identityPriv, resolverFor(bob));
    expect(dec.decode(out)).toBe('fs hello');
  });

  it('multi-recipient: each listed recipient decrypts, others are excluded', async () => {
    const { ciphertext, meta } = await encryptForRecipientsFS(enc.encode('team fs'), [
      pubFor(bob, 'pk-new'),
      pubFor(carol, 'pk-c1'),
    ]);
    expect(dec.decode(await decryptForRecipientFS(ciphertext, meta, 'bob', bob.identityPriv, resolverFor(bob)))).toBe('team fs');
    expect(dec.decode(await decryptForRecipientFS(ciphertext, meta, 'carol', carol.identityPriv, resolverFor(carol)))).toBe('team fs');
    await expect(
      decryptForRecipientFS(ciphertext, meta, 'mallory', mallory.identityPriv, resolverFor(mallory))
    ).rejects.toThrow(/not a recipient/i);
  });

  // ── THE SUCCESS CRITERION ────────────────────────────────────────────────
  it('FORWARD SECRECY: long-term identity key + ciphertext cannot derive a PRIOR share once its prekey is evicted', async () => {
    // A prior share, wrapped to bob's OLD session prekey.
    const prior = await encryptForRecipientsFS(enc.encode('PRIOR-SECRET'), [pubFor(bob, 'pk-old')]);
    // Sanity: while the old prekey is live, it decrypts.
    expect(dec.decode(await decryptForRecipientFS(prior.ciphertext, prior.meta, 'bob', bob.identityPriv, resolverFor(bob)))).toBe(
      'PRIOR-SECRET'
    );

    // ROTATION: bob evicts the old prekey's PRIVATE half (deletes it).
    bob.prekeys.delete('pk-old');

    // The attacker now holds bob's LONG-TERM identity private key AND the captured
    // ciphertext+meta. A resolver that has the identity key but NO evicted prekey
    // must NOT be able to derive the prior DEK.
    const attackerResolver: PrekeyResolver = async () => null; // evicted everywhere
    await expect(
      decryptForRecipientFS(prior.ciphertext, prior.meta, 'bob', bob.identityPriv, attackerResolver)
    ).rejects.toThrow(/forward-secret|rotated out|evicted/i);

    // And a CURRENT share (new prekey) still decrypts correctly — FS didn't break liveness.
    const current = await encryptForRecipientsFS(enc.encode('CURRENT-OK'), [pubFor(bob, 'pk-new')]);
    expect(dec.decode(await decryptForRecipientFS(current.ciphertext, current.meta, 'bob', bob.identityPriv, resolverFor(bob)))).toBe(
      'CURRENT-OK'
    );
  });

  it('the PREKEY DH term genuinely contributes: correct identity key + WRONG live prekey fails', async () => {
    // This is the test that makes the forward-secrecy claim meaningful: if the KDF
    // silently ignored ECDH(EK,PK), a holder of the identity key + any prekey would
    // decrypt. Wrap to bob's pk-new, then attempt unwrap with bob's identity priv
    // but a DIFFERENT, still-live prekey private (carol's). Must fail in the GCM tag.
    const { ciphertext, meta } = await encryptForRecipientsFS(enc.encode('needs both DH'), [pubFor(bob, 'pk-new')]);
    const wrongPrekeyResolver: PrekeyResolver = async () => carol.prekeys.get('pk-c1')!.priv; // live, but wrong key
    await expect(
      decryptForRecipientFS(ciphertext, meta, 'bob', bob.identityPriv, wrongPrekeyResolver)
    ).rejects.toThrow(/could not unwrap|wrong identity/i);
  });

  it('identity binding: a swapped/forged prekey cannot unwrap without the identity key', async () => {
    // Mallory substitutes HER prekey but uses bob's id (directory-substitution attack).
    const forgedRecipient: FSRecipientPublicKey = {
      id: 'bob',
      identityKey: bob.identityPub,
      prekey: { id: 'pk-forged', key: mallory.prekeys.get('pk-m1')!.pub },
    };
    const { ciphertext, meta } = await encryptForRecipientsFS(enc.encode('x'), [forgedRecipient]);
    // Mallory has her prekey private but NOT bob's identity private → cannot derive.
    const malloryResolver: PrekeyResolver = async () => mallory.prekeys.get('pk-m1')!.priv;
    await expect(
      decryptForRecipientFS(ciphertext, meta, 'bob', mallory.identityPriv, malloryResolver)
    ).rejects.toThrow(/could not unwrap|wrong identity/i);
  });

  it('rejects a wrong identity private key (no key confusion)', async () => {
    const { ciphertext, meta } = await encryptForRecipientsFS(enc.encode('y'), [pubFor(bob, 'pk-new')]);
    await expect(
      decryptForRecipientFS(ciphertext, meta, 'bob', mallory.identityPriv, resolverFor(bob))
    ).rejects.toThrow(/could not unwrap|wrong identity/i);
  });

  it('detects tampered ciphertext (content GCM auth)', async () => {
    const { ciphertext, meta } = await encryptForRecipientsFS(enc.encode('integrity'), [pubFor(bob, 'pk-new')]);
    const bad = ciphertext.slice();
    bad[bad.length - 1] ^= 0xff;
    await expect(decryptForRecipientFS(bad, meta, 'bob', bob.identityPriv, resolverFor(bob))).rejects.toThrow(
      /corrupted|truncated|tampered/i
    );
  });

  it('detects a swapped ephemeral key in the wrap', async () => {
    const a = await encryptForRecipientsFS(enc.encode('a'), [pubFor(bob, 'pk-new')]);
    const b = await encryptForRecipientsFS(enc.encode('b'), [pubFor(bob, 'pk-new')]);
    const forged = { ...a.meta, recipients: [{ ...a.meta.recipients[0], epk: b.meta.recipients[0].epk }] };
    await expect(decryptForRecipientFS(a.ciphertext, forged, 'bob', bob.identityPriv, resolverFor(bob))).rejects.toThrow(
      /could not unwrap|wrong identity/i
    );
  });

  it('binds caller context (file id) against envelope replay onto another record', async () => {
    const { ciphertext, meta } = await encryptForRecipientsFS(enc.encode('record A'), [pubFor(bob, 'pk-new')], { name: 'a' }, 'file:AAAA');
    expect(dec.decode(await decryptForRecipientFS(ciphertext, meta, 'bob', bob.identityPriv, resolverFor(bob), 'file:AAAA'))).toBe(
      'record A'
    );
    await expect(
      decryptForRecipientFS(ciphertext, meta, 'bob', bob.identityPriv, resolverFor(bob), 'file:BBBB')
    ).rejects.toThrow(/could not unwrap|wrong identity/i);
  });

  it('requires at least one recipient', async () => {
    await expect(encryptForRecipientsFS(enc.encode('x'), [])).rejects.toThrow(/at least one recipient/i);
  });

  it('is binary-lossless', async () => {
    const bytes = new Uint8Array(4096);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 97) % 256;
    const { ciphertext, meta } = await encryptForRecipientsFS(bytes, [pubFor(bob, 'pk-new')]);
    const out = await decryptForRecipientFS(ciphertext, meta, 'bob', bob.identityPriv, resolverFor(bob));
    expect(Array.from(out)).toEqual(Array.from(bytes));
  });
});
