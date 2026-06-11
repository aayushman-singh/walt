import { describe, it, expect, beforeAll } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import {
  encryptFileForUpload,
  decryptFileBytes,
  decryptFileToBlob,
  STREAMING_THRESHOLD_BYTES,
  type FileEncryptionMeta,
} from '../../lib/fileEnvelope';
import { encryptBytesChunked, isChunkedEncrypted, STREAM_ALG } from '../../lib/streamingEncryption';

// jsdom's Blob lacks arrayBuffer()/stream(); Node's Blob (node:buffer) has both.
// fileEnvelope constructs `new Blob(...)`, so swap the global for this suite to make
// the produced blobs readable. The crypto under test is environment-agnostic.
beforeAll(() => {
  (globalThis as any).Blob = NodeBlob;
});

const PW = 'envelope-pass';
const dec = new TextDecoder();

function bytes(n: number, seed = 1): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (i * 17 + seed) & 0xff;
  return out;
}
function eq(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Minimal File-like over a Uint8Array: stream() for the chunked path, arrayBuffer() for whole-file. */
function fakeFile(name: string, type: string, data: Uint8Array, run = 64 * 1024) {
  return {
    name,
    type,
    size: data.length,
    async arrayBuffer(): Promise<ArrayBuffer> {
      return data.slice().buffer;
    },
    stream(): ReadableStream<Uint8Array> {
      let off = 0;
      return new ReadableStream<Uint8Array>({
        pull(controller) {
          if (off >= data.length) {
            controller.close();
            return;
          }
          const end = Math.min(off + run, data.length);
          controller.enqueue(data.slice(off, end));
          off = end;
        },
      });
    },
  };
}

describe('lib/fileEnvelope — envelope dispatch', () => {
  it('decryptFileBytes reads a WHOLE-FILE (v1) envelope', async () => {
    const plain = bytes(2000);
    // Below threshold → encryptFileForUpload takes the whole-file path.
    const { blob, meta } = await encryptFileForUpload(fakeFile('a.bin', 'application/octet-stream', plain), PW);
    expect(isChunkedEncrypted(meta)).toBe(false);
    const ct = new Uint8Array(await blob.arrayBuffer());
    expect(eq(await decryptFileBytes(ct, meta as FileEncryptionMeta, PW), plain)).toBe(true);
  });

  it('decryptFileBytes reads a CHUNKED (v2) envelope', async () => {
    const plain = bytes(300_000);
    const { ciphertext, meta } = await encryptBytesChunked(plain, PW, undefined, 64 * 1024);
    expect(isChunkedEncrypted(meta)).toBe(true);
    expect(eq(await decryptFileBytes(ciphertext, meta, PW), plain)).toBe(true);
  });

  it('encryptFileForUpload picks WHOLE-FILE below the threshold and round-trips', async () => {
    const plain = bytes(4096);
    const file = fakeFile('small.bin', 'application/octet-stream', plain);
    const { blob, meta } = await encryptFileForUpload(file, PW);
    expect(isChunkedEncrypted(meta)).toBe(false);
    const ct = new Uint8Array(await blob.arrayBuffer());
    expect(eq(await decryptFileBytes(ct, meta, PW), plain)).toBe(true);
  });

  it('encryptFileForUpload picks CHUNKED at/above the threshold and round-trips', async () => {
    // Use a small explicit threshold so the test stays fast but still exercises streaming.
    const plain = bytes(250_000, 9);
    const file = fakeFile('big.bin', 'image/png', plain);
    const { blob, meta } = await encryptFileForUpload(file, PW, 100_000);
    expect(isChunkedEncrypted(meta)).toBe(true);
    expect(meta.alg).toBe(STREAM_ALG);
    const out = await decryptFileToBlob(new Uint8Array(await blob.arrayBuffer()), meta, PW);
    expect(out.type).toBe('image/png');
    expect(eq(new Uint8Array(await out.arrayBuffer()), plain)).toBe(true);
  });

  it('exposes a sane default streaming threshold', () => {
    expect(STREAMING_THRESHOLD_BYTES).toBeGreaterThanOrEqual(1024 * 1024);
  });
});
