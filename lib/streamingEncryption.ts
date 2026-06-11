/**
 * Chunked / streaming envelope encryption (AES-256-GCM + Argon2id).
 *
 * lib/encryption encrypts a whole file as ONE AES-GCM operation: the entire
 * plaintext and the entire ciphertext are held in memory at once. For a 100 MB+
 * file that is hundreds of MB of resident memory and a single monolithic crypto
 * call. This module encrypts the SAME envelope shape but in bounded-size CHUNKS,
 * so peak memory is ~one chunk regardless of file size, and a file can be read
 * from / written to a stream rather than a buffer.
 *
 * Scheme (per chunk):
 *   - One random 256-bit DEK encrypts the whole file (all chunks share it).
 *   - The DEK is wrapped under an Argon2id KEK derived from the passphrase — the
 *     EXACT same wrapping as lib/encryption (same KEK derivation, same floors).
 *   - The plaintext is split into fixed `chunkSize` blocks. Each block is
 *     AES-256-GCM encrypted under the DEK with a UNIQUE per-chunk IV:
 *         IV(96-bit) = fileNonce(64-bit, random per file) ‖ counter(32-bit, BE)
 *     The random fileNonce makes IVs unique across files; the counter makes them
 *     unique across chunks within a file — so no (key, IV) pair is ever reused.
 *   - Each chunk's AAD binds the public header AND its (chunkIndex, isFinal) flag.
 *     This authenticates the ORDER and the LENGTH of the stream: dropping the real
 *     last chunk, appending a forged chunk, or reordering chunks all flip an
 *     expected (index, isFinal) and fail the GCM tag. Truncation is detected, not
 *     silently accepted.
 *
 * Wire layout of the ciphertext stream: just the encrypted chunks concatenated.
 * Every non-final chunk is exactly `chunkSize + TAG_BYTES`; the final chunk is
 * `remainder + TAG_BYTES`. With `chunkSize` in the public meta, a reader slices
 * the stream into `chunkSize + TAG_BYTES` blocks (the last being the remainder)
 * and knows a chunk is final iff no bytes follow it.
 *
 * Bounded-memory guarantee holds when the SOURCE yields bounded chunks (a real
 * `File.stream()` yields ~64 KiB reads). A whole-buffer convenience wrapper is
 * provided for tests / small files; that one is necessarily buffer-sized on input.
 *
 * Failure is loud (project policy): wrong passphrase, sub-floor KDF params, a
 * corrupted/truncated/reordered stream — every one throws. No silent fallback.
 */
import {
  toBase64,
  fromBase64,
  deriveKEK,
  assertArgonFloor,
  ARGON_TIME_COST,
  ARGON_MEMORY_COST_KIB,
  ARGON_PARALLELISM,
  SALT_BYTES,
  DEK_BYTES,
} from './encryption';

/** Format version for the chunked envelope (distinct lineage from lib/encryption v1). */
export const STREAM_ENCRYPTION_VERSION = 2;
export const STREAM_ALG = 'AES-256-GCM-CHUNKED' as const;

const TAG_BYTES = 16; // AES-GCM authentication tag
const FILE_NONCE_BYTES = 8; // 64-bit random per-file IV prefix
const COUNTER_BYTES = 4; // 32-bit big-endian per-chunk counter
const IV_BYTES = FILE_NONCE_BYTES + COUNTER_BYTES; // 12-byte (96-bit) AES-GCM IV
const WRAP_IV_BYTES = 12;

/** Default plaintext chunk size: 4 MiB. Bounds peak memory at ~one chunk. */
export const DEFAULT_CHUNK_SIZE = 4 * 1024 * 1024;

/** Max chunks addressable by a 32-bit counter; guards against IV-counter overflow. */
const MAX_CHUNKS = 0xffffffff;

/**
 * Public metadata for a chunked file. Every field is safe to store: without the
 * passphrase the wrapped DEK is useless, and the header only describes structure.
 */
export interface StreamEncryptionMeta {
  v: number; // STREAM_ENCRYPTION_VERSION
  alg: typeof STREAM_ALG;
  kdf: 'argon2id';
  salt: string; // base64 — Argon2id salt for the KEK
  argonTimeCost: number;
  argonMemoryCost: number; // KiB
  argonParallelism: number;
  wrapIv: string; // base64 — IV used to wrap the DEK under the KEK
  wrappedKey: string; // base64 — DEK encrypted under the KEK
  fileNonce: string; // base64 — 8-byte per-file IV prefix for content chunks
  chunkSize: number; // plaintext bytes per non-final chunk
  originalName?: string;
  originalType?: string;
  originalSize?: number;
}

function getSubtle(): SubtleCrypto {
  const c: Crypto | undefined = (globalThis as any).crypto;
  if (!c || !c.subtle) throw new Error('Web Crypto API is unavailable; cannot stream-encrypt/decrypt');
  return c.subtle;
}
function randomBytes(n: number): Uint8Array {
  const c: Crypto = (globalThis as any).crypto;
  if (!c || !c.getRandomValues) throw new Error('Secure RNG (crypto.getRandomValues) is unavailable');
  return c.getRandomValues(new Uint8Array(n));
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/** Per-chunk 96-bit IV = fileNonce(8) ‖ counter(32-bit BE). Unique per (file, chunk). */
function chunkIv(fileNonce: Uint8Array, counter: number): Uint8Array {
  const iv = new Uint8Array(IV_BYTES);
  iv.set(fileNonce, 0);
  // Big-endian 32-bit counter in the trailing 4 bytes.
  iv[FILE_NONCE_BYTES] = (counter >>> 24) & 0xff;
  iv[FILE_NONCE_BYTES + 1] = (counter >>> 16) & 0xff;
  iv[FILE_NONCE_BYTES + 2] = (counter >>> 8) & 0xff;
  iv[FILE_NONCE_BYTES + 3] = counter & 0xff;
  return iv;
}

/**
 * Stable header AAD bound into EVERY chunk so a hostile store cannot alter the
 * version, cipher, KDF params, chunk size, nonce, or display metadata without the
 * GCM tag failing. Mirrors lib/encryption's header binding.
 */
function headerAAD(m: StreamEncryptionMeta): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify([
      m.v, m.alg, m.kdf, m.salt, m.argonTimeCost, m.argonMemoryCost, m.argonParallelism,
      m.fileNonce, m.chunkSize, m.originalName ?? null, m.originalType ?? null, m.originalSize ?? null,
    ])
  );
}

/** Per-chunk AAD = header ‖ [chunkIndex, isFinal]. Authenticates order + length. */
function chunkAAD(header: Uint8Array, index: number, isFinal: boolean): Uint8Array {
  const tail = new TextEncoder().encode(JSON.stringify([index, isFinal ? 1 : 0]));
  return concat(header, tail);
}

/** Normalize any async/sync iterable of chunks into an async iterable. */
async function* toAsyncIterable(source: AsyncIterable<Uint8Array> | Iterable<Uint8Array>): AsyncIterable<Uint8Array> {
  for await (const chunk of source as AsyncIterable<Uint8Array>) yield chunk;
}

/**
 * Re-chunk an arbitrary stream of byte runs into fixed `size` plaintext blocks,
 * yielding `{ data, isFinal }`. A block is emitted as non-final only once the NEXT
 * block (or the final tail) is known, so `isFinal` is always accurate — including
 * for empty input (one empty final chunk) and exact multiples of `size`.
 *
 * Pending source runs are queued by reference (no repeated whole-buffer concat),
 * and each emitted block is a single `size` allocation copied straight from the
 * queue. Live memory is ~`size` + a few queued runs — bounded when the source is —
 * and per-block garbage is one `size` buffer, not an O(file) churn of grown buffers.
 */
async function* reChunk(
  source: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
  size: number
): AsyncGenerator<{ data: Uint8Array; isFinal: boolean }> {
  const queue: Uint8Array[] = []; // pending runs, front = queue[0] sliced by `head`
  let head = 0; // consumed offset into queue[0]
  let queued = 0; // total unconsumed bytes across the queue
  let held: { data: Uint8Array; isFinal: boolean } | null = null;

  // Copy exactly `size` bytes out of the front of the queue into one fresh block.
  function take(): Uint8Array {
    const block = new Uint8Array(size);
    let off = 0;
    while (off < size) {
      const front = queue[0];
      const avail = front.length - head;
      const need = size - off;
      const n = Math.min(avail, need);
      block.set(front.subarray(head, head + n), off);
      off += n;
      head += n;
      if (head >= front.length) {
        queue.shift();
        head = 0;
      }
    }
    queued -= size;
    return block;
  }

  for await (const incoming of toAsyncIterable(source)) {
    if (incoming.length === 0) continue;
    queue.push(incoming);
    queued += incoming.length;
    while (queued >= size) {
      const block = take();
      if (held) yield held;
      held = { data: block, isFinal: false };
    }
  }

  // Drain the (< size) tail.
  let tail = new Uint8Array(queued);
  let off = 0;
  while (queue.length) {
    const front = queue.shift()!;
    tail.set(front.subarray(head), off);
    off += front.length - head;
    head = 0;
  }
  if (tail.length > 0) {
    if (held) yield held;
    yield { data: tail, isFinal: true };
  } else if (held) {
    yield { data: held.data, isFinal: true };
  } else {
    yield { data: new Uint8Array(0), isFinal: true }; // empty input → single empty final chunk
  }
}

interface FileInfo {
  name?: string;
  type?: string;
  size?: number;
}

/**
 * Build the header + wrapped DEK for a chunked stream and return both the public
 * `meta` and the live AES-GCM DEK. Computed up front so `meta` is fully known
 * before any content chunk is produced (salt/wrappedKey do not depend on content).
 */
async function buildHeader(
  passphrase: string,
  fileInfo: FileInfo | undefined,
  chunkSize: number
): Promise<{ meta: StreamEncryptionMeta; dek: CryptoKey; headerBytes: Uint8Array }> {
  if (!passphrase) throw new Error('A passphrase is required to encrypt');
  if (!Number.isInteger(chunkSize) || chunkSize < 1) throw new Error('chunkSize must be a positive integer');
  const subtle = getSubtle();

  const salt = randomBytes(SALT_BYTES);
  const kek = await deriveKEK(passphrase, salt, {
    timeCost: ARGON_TIME_COST,
    memoryCost: ARGON_MEMORY_COST_KIB,
    parallelism: ARGON_PARALLELISM,
  });

  const dek = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const fileNonce = randomBytes(FILE_NONCE_BYTES);

  const meta: StreamEncryptionMeta = {
    v: STREAM_ENCRYPTION_VERSION,
    alg: STREAM_ALG,
    kdf: 'argon2id',
    salt: toBase64(salt),
    argonTimeCost: ARGON_TIME_COST,
    argonMemoryCost: ARGON_MEMORY_COST_KIB,
    argonParallelism: ARGON_PARALLELISM,
    wrapIv: '', // filled below
    wrappedKey: '', // filled below
    fileNonce: toBase64(fileNonce),
    chunkSize,
    originalName: fileInfo?.name,
    originalType: fileInfo?.type,
    originalSize: fileInfo?.size,
  };

  // Wrap the DEK under the KEK, binding the header (sans wrap fields) as AAD so the
  // wrap cannot be lifted onto a different header. We bind the same headerAAD the
  // content chunks use, computed with the wrap fields still empty — symmetric on
  // decrypt because decrypt recomputes it the same way before unwrapping.
  const wrapAadMeta: StreamEncryptionMeta = { ...meta };
  const wrapAad = headerAAD(wrapAadMeta);
  const rawDek = new Uint8Array(await subtle.exportKey('raw', dek));
  const wrapIv = randomBytes(WRAP_IV_BYTES);
  const wrappedKey = new Uint8Array(
    await subtle.encrypt({ name: 'AES-GCM', iv: wrapIv, additionalData: wrapAad as unknown as BufferSource }, kek, rawDek as unknown as BufferSource)
  );
  rawDek.fill(0);

  meta.wrapIv = toBase64(wrapIv);
  meta.wrappedKey = toBase64(wrappedKey);
  // The header bound into CONTENT chunks excludes the wrap fields (they are empty
  // in wrapAadMeta); recompute the exact same bytes for content AAD.
  return { meta, dek, headerBytes: wrapAad };
}

/**
 * Encrypt a stream of plaintext byte runs into a stream of ciphertext chunks.
 * Returns the public `meta` (known immediately) and an async generator of encrypted
 * chunks. Peak memory is ~`chunkSize` when the source yields bounded runs.
 */
export async function encryptStream(
  source: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
  passphrase: string,
  fileInfo?: FileInfo,
  chunkSize: number = DEFAULT_CHUNK_SIZE
): Promise<{ meta: StreamEncryptionMeta; ciphertext: AsyncGenerator<Uint8Array> }> {
  const { meta, dek, headerBytes } = await buildHeader(passphrase, fileInfo, chunkSize);
  const fileNonce = fromBase64(meta.fileNonce);

  async function* produce(): AsyncGenerator<Uint8Array> {
    const subtle = getSubtle();
    let counter = 0;
    for await (const { data, isFinal } of reChunk(source, chunkSize)) {
      if (counter > MAX_CHUNKS) throw new Error('File too large: exceeds the chunk-counter space');
      const aad = chunkAAD(headerBytes, counter, isFinal);
      const out = new Uint8Array(
        await subtle.encrypt(
          { name: 'AES-GCM', iv: chunkIv(fileNonce, counter) as unknown as BufferSource, additionalData: aad as unknown as BufferSource },
          dek,
          data as unknown as BufferSource
        )
      );
      counter++;
      yield out;
    }
  }

  return { meta, ciphertext: produce() };
}

/** Unwrap the DEK from a chunked-stream meta (throws loudly on wrong passphrase / tamper). */
async function unwrapDek(meta: StreamEncryptionMeta, passphrase: string): Promise<{ dek: CryptoKey; headerBytes: Uint8Array }> {
  if (!passphrase) throw new Error('A passphrase is required to decrypt');
  if (meta.v !== STREAM_ENCRYPTION_VERSION) throw new Error(`Unsupported chunked encryption version: ${meta.v}`);
  if (meta.alg !== STREAM_ALG || meta.kdf !== 'argon2id') {
    throw new Error(`Unsupported chunked cipher/KDF: ${meta.alg}/${meta.kdf}`);
  }
  if (!Number.isInteger(meta.chunkSize) || meta.chunkSize < 1) throw new Error('Malformed meta: chunkSize must be a positive integer');
  if (fromBase64(meta.fileNonce).length !== FILE_NONCE_BYTES) throw new Error('Malformed meta: fileNonce must be 8 bytes');
  assertArgonFloor({ timeCost: meta.argonTimeCost, memoryCost: meta.argonMemoryCost, parallelism: meta.argonParallelism });

  const subtle = getSubtle();
  const kek = await deriveKEK(passphrase, fromBase64(meta.salt), {
    timeCost: meta.argonTimeCost,
    memoryCost: meta.argonMemoryCost,
    parallelism: meta.argonParallelism,
  });
  // Recompute the header AAD exactly as encryption did: with the wrap fields EMPTY.
  const headerBytes = headerAAD({ ...meta, wrapIv: '', wrappedKey: '' });
  let rawDek: ArrayBuffer;
  try {
    rawDek = await subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(meta.wrapIv), additionalData: headerBytes as unknown as BufferSource },
      kek,
      fromBase64(meta.wrappedKey) as unknown as BufferSource
    );
  } catch (cause) {
    throw new Error('Incorrect passphrase or tampered metadata (could not unwrap the file key)', { cause });
  }
  const dek = await subtle.importKey('raw', rawDek, { name: 'AES-GCM' }, false, ['decrypt']);
  return { dek, headerBytes };
}

/**
 * Decrypt a stream of ciphertext chunks (as produced by {@link encryptStream})
 * back into plaintext byte runs. The reader slices the input into
 * `chunkSize + TAG_BYTES` blocks; the trailing block is the (shorter) final chunk.
 * `isFinal` is derived from position and bound into the AAD, so any truncation,
 * append, or reorder flips the expected flag/index and fails the GCM tag.
 */
export async function decryptStream(
  source: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
  meta: StreamEncryptionMeta,
  passphrase: string
): Promise<AsyncGenerator<Uint8Array>> {
  const { dek, headerBytes } = await unwrapDek(meta, passphrase);
  const fileNonce = fromBase64(meta.fileNonce);
  const encChunkSize = meta.chunkSize + TAG_BYTES;

  async function* produce(): AsyncGenerator<Uint8Array> {
    const subtle = getSubtle();
    let buf = new Uint8Array(0);
    let counter = 0;

    // Decrypt one encrypted block under the running counter. `isFinal` is bound
    // into the AAD, so an attacker who cuts/appends/reorders raw bytes shifts a
    // block to a position whose (index, isFinal) no longer matches and the tag fails.
    async function decodeBlock(block: Uint8Array, isFinal: boolean): Promise<Uint8Array> {
      if (block.length < TAG_BYTES) throw new Error('Corrupted chunked stream: a chunk is shorter than the GCM tag');
      const aad = chunkAAD(headerBytes, counter, isFinal);
      let plain: ArrayBuffer;
      try {
        plain = await subtle.decrypt(
          { name: 'AES-GCM', iv: chunkIv(fileNonce, counter) as unknown as BufferSource, additionalData: aad as unknown as BufferSource },
          dek,
          block as unknown as BufferSource
        );
      } catch (cause) {
        throw new Error('Decryption failed — the chunked stream is corrupted, truncated, reordered, or tampered', { cause });
      }
      counter++;
      return new Uint8Array(plain);
    }

    for await (const incoming of toAsyncIterable(source)) {
      if (incoming.length === 0) continue;
      buf = buf.length === 0 ? incoming : concat(buf, incoming);
      // Emit every block for which MORE bytes follow (so it is provably non-final).
      while (buf.length > encChunkSize) {
        const block = buf.slice(0, encChunkSize);
        buf = buf.slice(encChunkSize);
        yield await decodeBlock(block, false);
      }
    }
    // Whatever remains is the final chunk (a full block for an exact multiple, a
    // shorter remainder, or an empty file's lone 16-byte tag block).
    yield await decodeBlock(buf, true);
  }

  return produce();
}

// ── Whole-buffer convenience wrappers (tests / small files) ──────────────────
// Input/output are single buffers, so these are NOT memory-bounded on size; they
// exist to round-trip the chunked format without wiring a stream.

/** Encrypt a whole buffer into the chunked format, returning concatenated ciphertext. */
export async function encryptBytesChunked(
  data: Uint8Array,
  passphrase: string,
  fileInfo?: FileInfo,
  chunkSize: number = DEFAULT_CHUNK_SIZE
): Promise<{ ciphertext: Uint8Array; meta: StreamEncryptionMeta }> {
  const { meta, ciphertext } = await encryptStream([data], passphrase, fileInfo, chunkSize);
  const parts: Uint8Array[] = [];
  let total = 0;
  for await (const c of ciphertext) {
    parts.push(c);
    total += c.length;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return { ciphertext: out, meta };
}

/** Decrypt a whole chunked-format buffer back to plaintext. */
export async function decryptBytesChunked(
  ciphertext: Uint8Array,
  meta: StreamEncryptionMeta,
  passphrase: string
): Promise<Uint8Array> {
  const gen = await decryptStream([ciphertext], meta, passphrase);
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

/** Whether a stored file record carries chunked (v2 streaming) encryption metadata. */
export function isChunkedEncrypted(meta: unknown): meta is StreamEncryptionMeta {
  return (
    !!meta &&
    typeof meta === 'object' &&
    (meta as any).alg === STREAM_ALG &&
    (meta as any).v === STREAM_ENCRYPTION_VERSION
  );
}
