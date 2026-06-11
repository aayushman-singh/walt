# Chunked / streaming envelope encryption — V5

`lib/streamingEncryption.ts`, dispatched by `lib/fileEnvelope.ts`.

## Why

`lib/encryption` (whole-file v1) does one AES-GCM op over the entire buffer: it must
hold the whole plaintext **and** the whole ciphertext in memory at once. For a 100 MB
file that is a multi-hundred-MB transient spike; for a 1 GB file it OOMs a browser tab.

The chunked envelope encrypts the same data in bounded-size blocks, so peak memory is
~one chunk regardless of file size.

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
- **Read** — `decryptFileBytes` / `decryptFileToBlob` dispatch on the stored meta
  shape (`isChunkedEncrypted`), so existing v1 files keep decrypting forever and new
  chunked files decrypt streaming. No fallback: an unrecognised meta throws.

Wired into the real upload (`useUpload`), download (`useFileOperations`) and re-share
(`encryptedShareOrchestration`) paths.

## Measured (100 MB, `tests/bench/cryptoPerf.bench.test.ts`, `BENCH=1`)

Peak measured with `--expose-gc` + forced gc before each sample, so numbers reflect
the **live working set**, not transient garbage. One process, common-mode overhead.

| | wall time | peak arrayBuffers | peak RSS |
|---|---|---|---|
| whole-file (v1) | ~200 ms | **100 MiB** | **420 MiB** |
| streaming (v2)  | ~250 ms | **24 MiB** | **189 MiB** |

Streaming caps peak TypedArray backing-store memory ~**4×** lower and peak RSS ~**2.2×**
lower (saves ~230 MiB on a 100 MB file), at ~**+25%** wall time. The memory ceiling is
flat in file size: a 1 GB file streams at the same ~24 MiB working set where the
whole-file path would need >2 GB and crash the tab. The wall-time cost is the
deliberate trade for not OOMing.

Run it:

```
BENCH=1 NODE_OPTIONS=--expose-gc npx vitest run tests/bench/cryptoPerf.bench.test.ts --pool=forks
```

## Bounded-memory caveat

The guarantee holds when the **source yields bounded runs** — a real `File.stream()`
yields ~64 KiB reads. The whole-buffer convenience wrappers (`encryptBytesChunked` /
`decryptBytesChunked`, for tests/small files) are necessarily buffer-sized on input.
The upload Blob aggregates ciphertext (the upload API takes a `File`), but plaintext
and ciphertext are never both fully resident, and the per-chunk re-chunker avoids the
O(file) buffer-growth churn a naïve concat-per-read would cause.
