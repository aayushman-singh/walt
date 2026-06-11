# Chunked / streaming envelope encryption — V5

`lib/streamingEncryption.ts`, dispatched by `lib/fileEnvelope.ts`.

## Why

`lib/encryption` (whole-file v1) does one AES-GCM op over the entire buffer: it must
hold the whole plaintext **and** the whole ciphertext in memory at once. For a 100 MB
file that is a multi-hundred-MB transient spike; for a 1 GB file it OOMs a browser tab.

The chunked envelope encrypts the same data in bounded-size blocks, so the
implementation avoids full-file plaintext/ciphertext accumulation and reduces the
measured peak memory for large uploads.

## Scheme

```
DEK            = random AES-256 key (whole file)
KEK            = Argon2id(passphrase, salt)          — same derivation + floors as v1
wrappedKey     = AES-GCM_KEK(DEK)                    — header bound as AAD
fileNonce      = random 64-bit per-file IV prefix

per chunk i (plaintext block of `chunkSize`, last is the remainder):
  IV_i  = fileNonce(8 bytes) ‖ counter_i(32-bit BE)  — unique per (file, chunk)
  AAD_i = headerAAD ‖ [i, isFinal]
  out_i = AES-GCM_DEK(plaintext_i, IV=IV_i, AAD=AAD_i)
```

- **No nonce reuse.** Random `fileNonce` makes IVs unique across files; the counter
  makes them unique across chunks within a file.
- **Order + length authenticated.** Each chunk's AAD binds its index and an `isFinal`
  flag. Dropping the last chunk, appending bytes, or reordering chunks flips an
  expected `(index, isFinal)` and fails the GCM tag — truncation is *detected*, never
  silently accepted. (Proven in `tests/frontend/streamingEncryption.test.ts`.)
- **Header bound everywhere.** Version, cipher, KDF params, chunk size, fileNonce and
  display metadata are bound into the DEK wrap **and** every content chunk, so a
  hostile store cannot alter them.

### Wire layout

Encrypted chunks concatenated. Every non-final chunk is exactly `chunkSize + 16`
(tag); the final chunk is `remainder + 16`. With `chunkSize` in the public meta a
reader slices the stream into `chunkSize + 16` blocks (the trailing block being the
final, shorter chunk). Default `chunkSize` = 4 MiB.

## Dispatch & rollout

`lib/fileEnvelope.ts` is the single door:

- **Write** — `encryptFileForUpload` streams files ≥ `STREAMING_THRESHOLD_BYTES`
  (8 MiB) chunk-by-chunk straight into the upload Blob; smaller files take the
  lower-overhead whole-file path.
- **Read** — `decryptFileBlobToBlob` dispatches on the stored meta shape
  (`isChunkedEncrypted`). Existing v1 files keep using the whole-file decryptor;
  chunked v2 downloads read from `Blob.stream()` and decrypt chunk-by-chunk into
  plaintext Blob parts. No fallback: an unrecognised meta throws.

Wired into the real upload (`useUpload`) and dashboard download (`useFileOperations`)
paths.

## Measured (100 MB, `tests/bench/cryptoPerf.bench.test.ts`, `BENCH=1`)

Peak measured with `--expose-gc` + forced gc before each sample, so numbers reflect
the **live working set**, not transient garbage. One process, common-mode overhead.

| | wall time | peak arrayBuffers | peak RSS |
|---|---|---|---|
| whole-file (v1) | 164 ms | **100.1 MiB** | **391.1 MiB** |
| streaming (v2)  | 211 ms | **72.2 MiB** | **261.0 MiB** |

For the encryption benchmark, streaming caps peak TypedArray backing-store memory
~**1.4×** lower and peak RSS ~**1.5×** lower (saves ~130.1 MiB RSS on a 100 MB
file), at ~**+29%** wall time. The algorithmic input/output accumulation is
bounded by source run size plus chunk size instead of by total file size, while
runtime/WebCrypto backing-store retention can still move measured peaks. The
wall-time cost is the deliberate trade for avoiding full-file upload encryption.

Run it:

```bash
BENCH=1 node --expose-gc ./node_modules/vitest/vitest.mjs run tests/bench/cryptoPerf.bench.test.ts --pool=forks
```

## Bounded-memory caveat

The bounded-accumulation property holds when the **source yields bounded runs** — a
real `File.stream()` yields ~64 KiB reads. The whole-buffer convenience wrappers
(`encryptBytesChunked` / `decryptBytesChunked`, for tests/small files) are
necessarily buffer-sized on input. Runtime/WebCrypto may retain transient backing
stores beyond one chunk; the benchmark guards measured memory reduction rather than
an exact one-chunk peak. The upload/download Blob APIs still materialize the final
Blob object because the browser upload/download surfaces require one.
`decryptFileBlobToBlob` avoids a single contiguous ciphertext buffer and a single
contiguous plaintext buffer for chunked downloads, but it still retains plaintext
Blob parts until the browser download is triggered. It is not a true constant-memory
streaming sink.

Re-share is deliberately not claimed as bounded-memory yet. `encryptedShareOrchestration`
still encrypts one plaintext buffer into the share envelope, so re-sharing an
encrypted large file materializes that plaintext before wrapping it to recipients.
A bounded-memory re-share requires a streaming share envelope, not just the at-rest
file envelope.
