/**
 * One door for at-rest file encryption: choose the right envelope on write, and
 * dispatch to the right decryptor on read.
 *
 * Two envelopes coexist:
 *   - v1 whole-file (lib/encryption): one AES-GCM op over the whole buffer. Simple,
 *     lowest per-op overhead — best for small files.
 *   - v2 chunked/streaming (lib/streamingEncryption): per-chunk AES-GCM with bounded
 *     memory — required for large files so the browser never holds the whole
 *     plaintext AND whole ciphertext at once.
 *
 * Read dispatches on the stored meta's shape, so existing v1 files keep decrypting
 * forever. `decryptFileBlobToBlob` streams chunked v2 downloads from Blob.stream();
 * whole-buffer helpers remain whole-buffer by contract. No fallback: an
 * unrecognised meta throws loudly rather than guessing.
 */
import { encryptFile, decryptBytes, type EncryptionMeta } from './encryption';
import {
  encryptStream,
  decryptStream,
  decryptBytesChunked,
  isChunkedEncrypted,
  DEFAULT_CHUNK_SIZE,
  type StreamEncryptionMeta,
} from './streamingEncryption';

/** Either at-rest envelope's public metadata. Stored on the file record. */
export type FileEncryptionMeta = EncryptionMeta | StreamEncryptionMeta;

/**
 * Files at or above this size are encrypted with the chunked/streaming envelope so
 * peak memory stays bounded; smaller files use the lower-overhead whole-file path.
 */
export const STREAMING_THRESHOLD_BYTES = 8 * 1024 * 1024; // 8 MiB

/** A Blob/File-like that can stream itself (browser File, undici File). */
interface StreamableBlob {
  name: string;
  type: string;
  size: number;
  stream(): ReadableStream<Uint8Array>;
}

/** Blob-like ciphertext input for decrypting downloaded files. */
interface ReadableBlob {
  arrayBuffer(): Promise<ArrayBuffer>;
  stream(): ReadableStream<Uint8Array>;
}

async function* readableToAsyncIterable(stream: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      if (value) yield value instanceof Uint8Array ? value : new Uint8Array(value as ArrayBufferLike);
    }
  } finally {
    reader.releaseLock();
  }
}

async function iterableToBlob(source: AsyncIterable<Uint8Array>, type: string): Promise<Blob> {
  const parts: BlobPart[] = [];
  for await (const chunk of source) parts.push(chunk.slice());
  return new Blob(parts, { type });
}

/**
 * Encrypt a File for upload, picking the envelope by size. Returns an upload-ready
 * Blob of ciphertext + the metadata needed to decrypt it. Large files are streamed
 * chunk-by-chunk straight into the output Blob — the whole plaintext is never
 * resident, and plaintext + ciphertext are never both fully buffered at once.
 */
export async function encryptFileForUpload(
  file: StreamableBlob,
  passphrase: string,
  thresholdBytes: number = STREAMING_THRESHOLD_BYTES
): Promise<{ blob: Blob; meta: FileEncryptionMeta }> {
  if (file.size < thresholdBytes) {
    // Whole-file path. encryptFile already returns a Blob + meta.
    return encryptFile(file as unknown as File, passphrase);
  }
  const { meta, ciphertext } = await encryptStream(
    readableToAsyncIterable(file.stream()),
    passphrase,
    { name: file.name, type: file.type, size: file.size },
    DEFAULT_CHUNK_SIZE
  );
  const parts: BlobPart[] = [];
  for await (const chunk of ciphertext) parts.push(chunk.slice());
  return { blob: new Blob(parts, { type: 'application/octet-stream' }), meta };
}

/** Decrypt downloaded ciphertext back to plaintext bytes, dispatching on the meta shape. */
export async function decryptFileBytes(
  ciphertext: Uint8Array,
  meta: FileEncryptionMeta,
  passphrase: string
): Promise<Uint8Array> {
  if (isChunkedEncrypted(meta)) return decryptBytesChunked(ciphertext, meta, passphrase);
  return decryptBytes(ciphertext, meta as EncryptionMeta, passphrase);
}

/** Decrypt downloaded ciphertext into a Blob carrying the original MIME type. */
export async function decryptFileToBlob(
  ciphertext: Uint8Array,
  meta: FileEncryptionMeta,
  passphrase: string
): Promise<Blob> {
  const plain = await decryptFileBytes(ciphertext, meta, passphrase);
  return new Blob([plain.slice()], { type: meta.originalType || 'application/octet-stream' });
}

/**
 * Decrypt a downloaded ciphertext Blob into a plaintext Blob. Chunked v2 files
 * are decrypted from `Blob.stream()` so the ciphertext is not first coerced into
 * one contiguous ArrayBuffer. Whole-file v1 still uses its whole-buffer decryptor
 * because that envelope is a single AES-GCM operation by design.
 */
export async function decryptFileBlobToBlob(
  ciphertext: ReadableBlob,
  meta: FileEncryptionMeta,
  passphrase: string
): Promise<Blob> {
  if (isChunkedEncrypted(meta)) {
    const plain = await decryptStream(readableToAsyncIterable(ciphertext.stream()), meta, passphrase);
    return iterableToBlob(plain, meta.originalType || 'application/octet-stream');
  }
  return decryptFileToBlob(new Uint8Array(await ciphertext.arrayBuffer()), meta, passphrase);
}
