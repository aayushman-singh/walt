import { describe, it, expect } from 'vitest';
import {
  encryptStream,
  decryptStream,
  encryptBytesChunked,
  decryptBytesChunked,
  isChunkedEncrypted,
  STREAM_ALG,
  STREAM_ENCRYPTION_VERSION,
  type StreamEncryptionMeta,
} from '../../lib/streamingEncryption';

const PW = 'correct horse battery staple';
const CHUNK = 64 * 1024; // small chunk so MB-scale plaintext spans many chunks fast

function patternedBytes(n: number): Uint8Array {
  // Deterministic non-trivial content so a byte-identical round-trip is meaningful.
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (i * 31 + (i >> 8) * 7) & 0xff;
  return out;
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Yield a buffer as many small runs of `run` bytes (models File.stream()). */
async function* runs(data: Uint8Array, run: number): AsyncGenerator<Uint8Array> {
  for (let off = 0; off < data.length; off += run) yield data.slice(off, Math.min(off + run, data.length));
}

async function collect(gen: AsyncGenerator<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  let total = 0;
  for await (const p of gen) {
    parts.push(p);
    total += p.length;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

describe('lib/streamingEncryption — chunked AES-256-GCM envelope', () => {
  it('tags meta as chunked v2', async () => {
    const { meta } = await encryptBytesChunked(patternedBytes(10), PW, undefined, CHUNK);
    expect(meta.v).toBe(STREAM_ENCRYPTION_VERSION);
    expect(meta.alg).toBe(STREAM_ALG);
    expect(isChunkedEncrypted(meta)).toBe(true);
    expect(isChunkedEncrypted({ v: 1, alg: 'AES-GCM' })).toBe(false);
  });

  it('round-trips BYTE-IDENTICALLY across many chunk boundaries (multi-chunk + partial last)', async () => {
    const plain = patternedBytes(CHUNK * 5 + 12345); // 5 full chunks + a partial
    const { ciphertext, meta } = await encryptBytesChunked(plain, PW, { name: 'big.bin', type: 'application/octet-stream', size: plain.length }, CHUNK);
    expect(equalBytes(ciphertext, plain)).toBe(false); // actually encrypted
    const out = await decryptBytesChunked(ciphertext, meta, PW);
    expect(equalBytes(out, plain)).toBe(true);
  });

  it('round-trips an EXACT multiple of the chunk size', async () => {
    const plain = patternedBytes(CHUNK * 3);
    const { ciphertext, meta } = await encryptBytesChunked(plain, PW, undefined, CHUNK);
    expect(equalBytes(await decryptBytesChunked(ciphertext, meta, PW), plain)).toBe(true);
  });

  it('round-trips a sub-chunk file and an EMPTY file', async () => {
    for (const n of [0, 1, 1000]) {
      const plain = patternedBytes(n);
      const { ciphertext, meta } = await encryptBytesChunked(plain, PW, undefined, CHUNK);
      expect(equalBytes(await decryptBytesChunked(ciphertext, meta, PW), plain)).toBe(true);
    }
  });

  it('STREAMING API round-trips: small source runs → encrypted chunks → decrypted runs', async () => {
    const plain = patternedBytes(CHUNK * 4 + 777);
    const { meta, ciphertext } = await encryptStream(runs(plain, 9000), PW, { size: plain.length }, CHUNK);
    const ct = await collect(ciphertext);
    // Feed the ciphertext back in awkward 7000-byte runs to prove re-chunking on read.
    const out = await collect(await decryptStream(runs(ct, 7000), meta, PW));
    expect(equalBytes(out, plain)).toBe(true);
  });

  it('fails loudly on the WRONG passphrase', async () => {
    const { ciphertext, meta } = await encryptBytesChunked(patternedBytes(5000), PW, undefined, CHUNK);
    await expect(decryptBytesChunked(ciphertext, meta, 'wrong')).rejects.toThrow(/incorrect passphrase|could not unwrap/i);
  });

  it('detects a flipped ciphertext byte (per-chunk GCM tag)', async () => {
    const { ciphertext, meta } = await encryptBytesChunked(patternedBytes(5000), PW, undefined, CHUNK);
    ciphertext[10] ^= 0x01;
    await expect(decryptBytesChunked(ciphertext, meta, PW)).rejects.toThrow(/corrupted|truncated|reordered|tampered/i);
  });

  it('detects TRUNCATION — dropping the final chunk fails (isFinal bound into AAD)', async () => {
    const plain = patternedBytes(CHUNK * 2 + 500);
    const { ciphertext, meta } = await encryptBytesChunked(plain, PW, undefined, CHUNK);
    const encChunk = CHUNK + 16;
    // Drop the final (partial) chunk: keep only the two full chunks.
    const truncated = ciphertext.slice(0, encChunk * 2);
    await expect(decryptBytesChunked(truncated, meta, PW)).rejects.toThrow(/corrupted|truncated|reordered|tampered/i);
  });

  it('detects APPEND — extra bytes after the final chunk fail', async () => {
    const plain = patternedBytes(CHUNK + 500);
    const { ciphertext, meta } = await encryptBytesChunked(plain, PW, undefined, CHUNK);
    const appended = new Uint8Array(ciphertext.length + 32);
    appended.set(ciphertext, 0);
    appended.set(patternedBytes(32), ciphertext.length);
    await expect(decryptBytesChunked(appended, meta, PW)).rejects.toThrow(/corrupted|truncated|reordered|tampered/i);
  });

  it('detects REORDER — swapping two full chunks fails (chunkIndex + IV counter bound)', async () => {
    const plain = patternedBytes(CHUNK * 3);
    const { ciphertext, meta } = await encryptBytesChunked(plain, PW, undefined, CHUNK);
    const encChunk = CHUNK + 16;
    const swapped = ciphertext.slice();
    const c0 = ciphertext.slice(0, encChunk);
    const c1 = ciphertext.slice(encChunk, encChunk * 2);
    swapped.set(c1, 0);
    swapped.set(c0, encChunk);
    await expect(decryptBytesChunked(swapped, meta, PW)).rejects.toThrow(/corrupted|truncated|reordered|tampered/i);
  });

  it('detects HEADER tampering — altering chunkSize/originalName fails the wrap AAD', async () => {
    const { ciphertext, meta } = await encryptBytesChunked(patternedBytes(3000), PW, { name: 'a.txt' }, CHUNK);
    const tampered: StreamEncryptionMeta = { ...meta, originalName: 'evil.exe' };
    await expect(decryptBytesChunked(ciphertext, tampered, PW)).rejects.toThrow(/incorrect passphrase|could not unwrap/i);
  });

  it('uses a unique fileNonce per encryption (no IV reuse across files)', async () => {
    const a = await encryptBytesChunked(patternedBytes(100), PW, undefined, CHUNK);
    const b = await encryptBytesChunked(patternedBytes(100), PW, undefined, CHUNK);
    expect(a.meta.fileNonce).not.toBe(b.meta.fileNonce);
    expect(a.meta.wrappedKey).not.toBe(b.meta.wrappedKey);
  });

  it('rejects sub-floor Argon parameters in stored meta (downgrade guard)', async () => {
    const { ciphertext, meta } = await encryptBytesChunked(patternedBytes(100), PW, undefined, CHUNK);
    const weak: StreamEncryptionMeta = { ...meta, argonMemoryCost: 1024 };
    await expect(decryptBytesChunked(ciphertext, weak, PW)).rejects.toThrow(/sub-minimum argon/i);
  });
});
