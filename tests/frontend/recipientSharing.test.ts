import { describe, it, expect, beforeAll } from 'vitest';
import {
  encryptForRecipients,
  decryptForRecipient,
  addRecipient,
  removeRecipient,
  isSharedEncrypted,
  type RecipientPublicKey,
} from '../../lib/recipientSharing';
import { generateIdentityKeyPair, exportPublicIdentity, importPublicIdentity } from '../../lib/recipientKeys';

const enc = new TextEncoder();
const dec = new TextDecoder();

interface Identity {
  id: string;
  pub: RecipientPublicKey;
  priv: CryptoKey;
}

async function makeIdentity(id: string): Promise<Identity> {
  const pair = await generateIdentityKeyPair();
  const publicKey = await importPublicIdentity(await exportPublicIdentity(pair.publicKey));
  return { id, pub: { id, publicKey }, priv: pair.privateKey };
}

let alice: Identity, bob: Identity, carol: Identity, mallory: Identity;
beforeAll(async () => {
  [alice, bob, carol, mallory] = await Promise.all([
    makeIdentity('alice'),
    makeIdentity('bob'),
    makeIdentity('carol'),
    makeIdentity('mallory'),
  ]);
});

describe('lib/recipientSharing — ECIES multi-recipient envelope', () => {
  it('round-trips for a single recipient', async () => {
    const { ciphertext, meta } = await encryptForRecipients(enc.encode('for bob only'), [bob.pub], {
      name: 'memo.txt',
      type: 'text/plain',
      size: 12,
    });
    expect(dec.decode(ciphertext)).not.toContain('for bob only');
    expect(isSharedEncrypted(meta)).toBe(true);
    expect(meta.recipients.map((r) => r.recipientId)).toEqual(['bob']);

    const out = await decryptForRecipient(ciphertext, meta, 'bob', bob.priv);
    expect(dec.decode(out)).toBe('for bob only');
  });

  it('lets every listed recipient decrypt, and excludes everyone else', async () => {
    const { ciphertext, meta } = await encryptForRecipients(enc.encode('team secret'), [
      alice.pub,
      bob.pub,
      carol.pub,
    ]);
    for (const who of [alice, bob, carol]) {
      const out = await decryptForRecipient(ciphertext, meta, who.id, who.priv);
      expect(dec.decode(out)).toBe('team secret');
    }
    // Mallory is not in the recipient list at all.
    await expect(decryptForRecipient(ciphertext, meta, 'mallory', mallory.priv)).rejects.toThrow(
      /not a recipient/i
    );
  });

  it('rejects a recipient id whose private key does not match (no key confusion)', async () => {
    const { ciphertext, meta } = await encryptForRecipients(enc.encode('x'), [bob.pub]);
    // Right id, wrong private key.
    await expect(decryptForRecipient(ciphertext, meta, 'bob', mallory.priv)).rejects.toThrow(
      /could not unwrap|wrong recipient/i
    );
  });

  it('detects tampered ciphertext (content GCM auth)', async () => {
    const { ciphertext, meta } = await encryptForRecipients(enc.encode('integrity'), [bob.pub]);
    const bad = ciphertext.slice();
    bad[bad.length - 1] ^= 0xff;
    await expect(decryptForRecipient(bad, meta, 'bob', bob.priv)).rejects.toThrow(/corrupted|truncated|tampered/i);
  });

  it('detects a tampered wrap (swapped ephemeral key)', async () => {
    const { ciphertext, meta } = await encryptForRecipients(enc.encode('y'), [bob.pub]);
    const other = await encryptForRecipients(enc.encode('z'), [bob.pub]);
    const forged = { ...meta, recipients: [{ ...meta.recipients[0], epk: other.meta.recipients[0].epk }] };
    await expect(decryptForRecipient(ciphertext, forged, 'bob', bob.priv)).rejects.toThrow(
      /could not unwrap|wrong recipient/i
    );
  });

  it('addRecipient grants access WITHOUT re-encrypting the content', async () => {
    const { ciphertext, meta } = await encryptForRecipients(enc.encode('grow the circle'), [alice.pub]);
    await expect(decryptForRecipient(ciphertext, meta, 'bob', bob.priv)).rejects.toThrow(/not a recipient/i);

    const meta2 = await addRecipient(meta, 'alice', alice.priv, bob.pub);
    // Same ciphertext bytes — only the wrapped-key list changed.
    const out = await decryptForRecipient(ciphertext, meta2, 'bob', bob.priv);
    expect(dec.decode(out)).toBe('grow the circle');
    // Alice still works too.
    expect(dec.decode(await decryptForRecipient(ciphertext, meta2, 'alice', alice.priv))).toBe('grow the circle');
  });

  it('only an existing recipient can add another', async () => {
    const { meta } = await encryptForRecipients(enc.encode('x'), [alice.pub]);
    await expect(addRecipient(meta, 'mallory', mallory.priv, bob.pub)).rejects.toThrow(
      /only an existing recipient/i
    );
  });

  it('removeRecipient drops the entry; remaining recipients still decrypt', async () => {
    const { ciphertext, meta } = await encryptForRecipients(enc.encode('shrink'), [alice.pub, bob.pub]);
    const meta2 = removeRecipient(meta, 'bob');
    expect(meta2.recipients.map((r) => r.recipientId)).toEqual(['alice']);
    await expect(decryptForRecipient(ciphertext, meta2, 'bob', bob.priv)).rejects.toThrow(/not a recipient/i);
    expect(dec.decode(await decryptForRecipient(ciphertext, meta2, 'alice', alice.priv))).toBe('shrink');
  });

  it('binds a caller context (file id) so a wrap/envelope cannot be replayed onto another record', async () => {
    const { ciphertext, meta } = await encryptForRecipients(
      enc.encode('record A payload'),
      [bob.pub],
      { name: 'a.txt' },
      'file:AAAA'
    );
    // Correct context decrypts.
    expect(dec.decode(await decryptForRecipient(ciphertext, meta, 'bob', bob.priv, 'file:AAAA'))).toBe(
      'record A payload'
    );
    // Same envelope replayed under a different record id fails (AAD mismatch).
    await expect(decryptForRecipient(ciphertext, meta, 'bob', bob.priv, 'file:BBBB')).rejects.toThrow(
      /could not unwrap|wrong recipient/i
    );
  });

  it('requires at least one recipient', async () => {
    await expect(encryptForRecipients(enc.encode('x'), [])).rejects.toThrow(/at least one recipient/i);
  });

  it('is binary-lossless', async () => {
    const bytes = new Uint8Array(2048);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 53) % 256;
    const { ciphertext, meta } = await encryptForRecipients(bytes, [bob.pub]);
    const out = await decryptForRecipient(ciphertext, meta, 'bob', bob.priv);
    expect(Array.from(out)).toEqual(Array.from(bytes));
  });
});
