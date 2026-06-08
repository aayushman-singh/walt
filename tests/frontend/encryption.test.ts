import { describe, it, expect } from 'vitest';
import {
  encryptBytes,
  decryptBytes,
  decryptToBlob,
  isEncrypted,
  ENCRYPTION_VERSION,
  type EncryptionMeta,
} from '../../lib/encryption';

const enc = new TextEncoder();
const dec = new TextDecoder();

// Argon2id at 64 MiB is deliberately slow; give crypto tests room.
const TIMEOUT = 30_000;

describe('lib/encryption — AES-256-GCM + Argon2id envelope', () => {
  it('round-trips plaintext with the correct passphrase', async () => {
    const plain = enc.encode('the quick brown fox jumps over the lazy dog 🦊');
    const { ciphertext, meta } = await encryptBytes(plain, 'correct horse battery staple');

    // Ciphertext must NOT contain the plaintext.
    expect(dec.decode(ciphertext)).not.toContain('quick brown fox');
    expect(ciphertext.byteLength).toBeGreaterThan(plain.byteLength); // + GCM tag

    const out = await decryptBytes(ciphertext, meta, 'correct horse battery staple');
    expect(dec.decode(out)).toBe('the quick brown fox jumps over the lazy dog 🦊');
  }, TIMEOUT);

  it('emits well-formed, version-tagged public metadata', async () => {
    const { meta } = await encryptBytes(enc.encode('x'), 'pw', {
      name: 'a.txt',
      type: 'text/plain',
      size: 1,
    });
    expect(meta.v).toBe(ENCRYPTION_VERSION);
    expect(meta.alg).toBe('AES-GCM');
    expect(meta.kdf).toBe('argon2id');
    expect(meta.salt).toBeTruthy();
    expect(meta.iv).toBeTruthy();
    expect(meta.wrapIv).toBeTruthy();
    expect(meta.wrappedKey).toBeTruthy();
    expect(meta.originalName).toBe('a.txt');
    expect(isEncrypted(meta)).toBe(true);
  }, TIMEOUT);

  it('fails loudly on the WRONG passphrase (no silent fallback)', async () => {
    const { ciphertext, meta } = await encryptBytes(enc.encode('secret'), 'right-passphrase');
    await expect(decryptBytes(ciphertext, meta, 'wrong-passphrase')).rejects.toThrow(
      /incorrect passphrase/i
    );
  }, TIMEOUT);

  it('detects tampering with the ciphertext (GCM authentication)', async () => {
    const { ciphertext, meta } = await encryptBytes(enc.encode('integrity matters'), 'pw');
    const tampered = ciphertext.slice();
    tampered[tampered.length - 1] ^= 0xff; // flip a bit in the auth tag region
    await expect(decryptBytes(tampered, meta, 'pw')).rejects.toThrow(/corrupted|truncated/i);
  }, TIMEOUT);

  it('uses a unique salt + IV per encryption (no nonce reuse)', async () => {
    const a = await encryptBytes(enc.encode('same'), 'pw');
    const b = await encryptBytes(enc.encode('same'), 'pw');
    expect(a.meta.salt).not.toBe(b.meta.salt);
    expect(a.meta.iv).not.toBe(b.meta.iv);
    expect(a.meta.wrapIv).not.toBe(b.meta.wrapIv);
    // Identical plaintext + passphrase must still yield different ciphertext.
    expect(toHex(a.ciphertext)).not.toBe(toHex(b.ciphertext));
  }, TIMEOUT);

  it('rejects an empty passphrase on encrypt and decrypt', async () => {
    await expect(encryptBytes(enc.encode('x'), '')).rejects.toThrow(/passphrase is required/i);
    const fakeMeta = { v: ENCRYPTION_VERSION } as EncryptionMeta;
    await expect(decryptBytes(new Uint8Array(1), fakeMeta, '')).rejects.toThrow(
      /passphrase is required/i
    );
  }, TIMEOUT);

  it('binds metadata into the GCM tag (tampering the header fails decryption)', async () => {
    const { ciphertext, meta } = await encryptBytes(enc.encode('bind me'), 'pw', {
      name: 'invoice.pdf',
      type: 'application/pdf',
      size: 7,
    });
    // A hostile store rewrites the advertised filename. AAD binding must reject it.
    const tamperedHeader = { ...meta, originalName: 'innocent.txt' };
    await expect(decryptBytes(ciphertext, tamperedHeader, 'pw')).rejects.toThrow(
      /tampered|incorrect passphrase/i
    );
  }, TIMEOUT);

  it('refuses sub-minimum Argon2 cost params (downgrade guard)', async () => {
    const { ciphertext, meta } = await encryptBytes(enc.encode('x'), 'pw');
    const weakened = { ...meta, argonMemoryCost: 1024, argonTimeCost: 1 };
    await expect(decryptBytes(ciphertext, weakened, 'pw')).rejects.toThrow(/sub-minimum argon2/i);
  }, TIMEOUT);

  it('rejects an unknown format version', async () => {
    const { ciphertext, meta } = await encryptBytes(enc.encode('x'), 'pw');
    const badMeta = { ...meta, v: 999 };
    await expect(decryptBytes(ciphertext, badMeta, 'pw')).rejects.toThrow(/unsupported encryption/i);
  }, TIMEOUT);

  it('decryptToBlob restores the original MIME type', async () => {
    const { ciphertext, meta } = await encryptBytes(enc.encode('hello'), 'pw', {
      name: 'h.txt',
      type: 'text/plain',
      size: 5,
    });
    const blob = await decryptToBlob(ciphertext, meta, 'pw');
    expect(blob.type).toBe('text/plain');
    expect(blob.size).toBe(5); // 'hello'
  }, TIMEOUT);

  it('handles binary (non-UTF8) data losslessly', async () => {
    const bytes = new Uint8Array(1024);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 37) % 256;
    const { ciphertext, meta } = await encryptBytes(bytes, 'pw');
    const out = await decryptBytes(ciphertext, meta, 'pw');
    expect(toHex(out)).toBe(toHex(bytes));
  }, TIMEOUT);
});

function toHex(b: Uint8Array): string {
  return Array.from(b)
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}
