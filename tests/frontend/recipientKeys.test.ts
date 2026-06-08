import { describe, it, expect } from 'vitest';
import {
  generateIdentityKeyPair,
  exportPublicIdentity,
  importPublicIdentity,
  exportPrivateKeyEncrypted,
  importPrivateKeyEncrypted,
  createStoredIdentity,
} from '../../lib/recipientKeys';

// Private-key-at-rest uses Argon2id (64 MiB) — give it room.
const TIMEOUT = 30_000;

const subtle = (globalThis as any).crypto.subtle as SubtleCrypto;

// Two keys are "the same" if they derive the same ECDH shared secret against a
// fixed counterparty public key.
async function sharedWith(counterpartyPub: CryptoKey, priv: CryptoKey): Promise<string> {
  const bits = await subtle.deriveBits({ name: 'ECDH', public: counterpartyPub }, priv, 256);
  return Buffer.from(new Uint8Array(bits)).toString('hex');
}

describe('lib/recipientKeys — ECDH identity, private key encrypted at rest', () => {
  it('exports/imports a public identity that still derives the right secret', async () => {
    const a = await generateIdentityKeyPair();
    const b = await generateIdentityKeyPair();
    const aPubRoundTripped = await importPublicIdentity(await exportPublicIdentity(a.publicKey));

    // b derives the same secret against the original a.public and the round-tripped one.
    const s1 = await sharedWith(a.publicKey, b.privateKey);
    const s2 = await sharedWith(aPubRoundTripped, b.privateKey);
    expect(s2).toBe(s1);
  });

  it('encrypts the private key at rest and restores the SAME key with the passphrase', async () => {
    const a = await generateIdentityKeyPair();
    const peer = await generateIdentityKeyPair();
    const stored = await exportPrivateKeyEncrypted(a.privateKey, 'correct horse battery');

    // The stored blob must not contain raw key material in cleartext (it's an envelope).
    expect(stored.ciphertext).toBeTruthy();
    expect(stored.alg).toBe('ECDH-P256');

    const restored = await importPrivateKeyEncrypted(stored, 'correct horse battery');
    // Restored private key derives the identical shared secret => same key.
    expect(await sharedWith(peer.publicKey, restored)).toBe(await sharedWith(peer.publicKey, a.privateKey));
  }, TIMEOUT);

  it('fails loudly on the wrong passphrase', async () => {
    const a = await generateIdentityKeyPair();
    const stored = await exportPrivateKeyEncrypted(a.privateKey, 'right');
    await expect(importPrivateKeyEncrypted(stored, 'wrong')).rejects.toThrow(/incorrect passphrase|tampered/i);
  }, TIMEOUT);

  it('createStoredIdentity yields a publishable public id + encrypted private key', async () => {
    const { publicIdentity, encryptedPrivateKey } = await createStoredIdentity('pw-at-least-8');
    expect(publicIdentity.alg).toBe('ECDH-P256');
    expect(publicIdentity.publicKey).toBeTruthy();
    expect(encryptedPrivateKey.ciphertext).toBeTruthy();
    // The published identity is importable and usable as a recipient key.
    const pub = await importPublicIdentity(publicIdentity);
    expect(pub.type).toBe('public');
  }, TIMEOUT);
});
