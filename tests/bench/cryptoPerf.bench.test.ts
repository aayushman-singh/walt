/**
 * Measured performance benchmark for the V5 work. NOT part of the normal suite —
 * it allocates ~100 MB and is gated behind BENCH=1:
 *
 *   BENCH=1 node --expose-gc node_modules/vitest/vitest.mjs run tests/bench/cryptoPerf.bench.test.ts
 *
 * Reports, in one process so the runtime overhead is common-mode:
 *   (A) whole-file vs streaming envelope encryption of a 100 MB file — peak
 *       arrayBuffer bytes (where TypedArray backing stores live) + peak RSS + wall time.
 *   (B) sequential vs parallel DEK wrapping to N recipients — wall time.
 *
 * The streaming source yields bounded 64 KiB runs and the ciphertext is consumed
 * without accumulation, so the streamed path never holds the whole file.
 */
import { describe, it, expect } from 'vitest';
import { encryptBytes } from '../../lib/encryption';
import { encryptStream, DEFAULT_CHUNK_SIZE } from '../../lib/streamingEncryption';
import { wrapKeyForRecipientFS, type FSRecipientPublicKey } from '../../lib/forwardSecretSharing';
import { generateIdentityKeyPair, exportPublicIdentity, importPublicIdentity } from '../../lib/recipientKeys';

const RUN = !!process.env.BENCH;
const SIZE = 100 * 1024 * 1024; // 100 MB
const RUN_BYTES = 64 * 1024; // streamed source run size (models File.stream())
const PW = 'bench-passphrase';

function maybeGc() {
  const g = (globalThis as any).gc;
  if (typeof g === 'function') g();
}

/**
 * Measure `fn` in TWO passes for honest numbers:
 *   - a clean timed pass (no sampler, no forced gc) → wall time;
 *   - a memory pass that forces gc() before each sample so the peak reflects the
 *     LIVE working set, not transient collectable garbage.
 * Reporting time from the gc-sampled pass would unfairly inflate it.
 */
async function measure<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number; peakRss: number; peakAb: number }> {
  maybeGc();
  const t0 = performance.now();
  const result = await fn();
  const ms = performance.now() - t0;

  maybeGc();
  let peakRss = 0;
  let peakAb = 0;
  const sampler = setInterval(() => {
    maybeGc();
    const m = process.memoryUsage();
    if (m.rss > peakRss) peakRss = m.rss;
    if ((m as any).arrayBuffers > peakAb) peakAb = (m as any).arrayBuffers;
  }, 12);
  await fn();
  clearInterval(sampler);
  return { result, ms, peakRss, peakAb };
}

const mb = (n: number) => (n / 1024 / 1024).toFixed(1) + ' MiB';

async function makeRecipient(id: string): Promise<FSRecipientPublicKey> {
  const idPair = await generateIdentityKeyPair();
  const idPub = await importPublicIdentity(await exportPublicIdentity(idPair.publicKey));
  const pk = await generateIdentityKeyPair(); // same P-256 ECDH params as a prekey
  return { id, identityKey: idPub, prekey: { id: `pk-${id}`, key: pk.publicKey } };
}

describe.skipIf(!RUN)('V5 performance benchmark (BENCH=1)', () => {
  it('(A) streaming vs whole-file encryption of 100 MB — peak memory + wall time', async () => {
    // Whole-file: must materialize the full plaintext buffer (the status quo).
    const whole = await measure(async () => {
      const buf = new Uint8Array(SIZE);
      for (let i = 0; i < SIZE; i += 4096) buf[i] = i & 0xff; // touch pages
      const { ciphertext } = await encryptBytes(buf, PW, { size: SIZE });
      return ciphertext.length;
    });

    // Streaming: lazy 64 KiB source runs; discard ciphertext chunks as they arrive.
    async function* lazySource(): AsyncGenerator<Uint8Array> {
      let produced = 0;
      while (produced < SIZE) {
        const n = Math.min(RUN_BYTES, SIZE - produced);
        const run = new Uint8Array(n);
        run[0] = produced & 0xff;
        produced += n;
        yield run;
      }
    }
    const streamed = await measure(async () => {
      const { ciphertext } = await encryptStream(lazySource(), PW, { size: SIZE }, DEFAULT_CHUNK_SIZE);
      let out = 0;
      for await (const c of ciphertext) out += c.length; // consume + discard
      return out;
    });

    // eslint-disable-next-line no-console
    console.log(
      '\n[A] 100 MB encryption\n' +
        `  whole-file : time ${whole.ms.toFixed(0)} ms | peak arrayBuffers ${mb(whole.peakAb)} | peak rss ${mb(whole.peakRss)}\n` +
        `  streaming  : time ${streamed.ms.toFixed(0)} ms | peak arrayBuffers ${mb(streamed.peakAb)} | peak rss ${mb(streamed.peakRss)}\n` +
        `  memory saved (arrayBuffers peak): ${mb(whole.peakAb - streamed.peakAb)}`
    );

    // The whole-file path holds plaintext + ciphertext (~200 MB+) at peak; the
    // streamed path holds ~one chunk. Conservative guard: streamed peak arrayBuffers
    // is at least the full plaintext lower than whole-file peak.
    expect(streamed.peakAb).toBeLessThan(whole.peakAb - SIZE / 2);
  }, 120_000);

  it('(B) parallel vs sequential DEK wrapping to 25 recipients — wall time', async () => {
    const N = 25;
    const recipients = await Promise.all(Array.from({ length: N }, (_, i) => makeRecipient(`r${i}`)));
    const rawDek = new Uint8Array(32);
    rawDek[0] = 7;

    const seq = await measure(async () => {
      const wraps = [];
      for (const r of recipients) wraps.push(await wrapKeyForRecipientFS(rawDek, r, 'ctx'));
      return wraps.length;
    });
    const par = await measure(async () => {
      const wraps = await Promise.all(recipients.map((r) => wrapKeyForRecipientFS(rawDek, r, 'ctx')));
      return wraps.length;
    });

    // eslint-disable-next-line no-console
    console.log(
      `\n[B] wrap DEK to ${N} recipients\n` +
        `  sequential : ${seq.ms.toFixed(0)} ms\n` +
        `  parallel   : ${par.ms.toFixed(0)} ms\n` +
        `  speedup    : ${(seq.ms / par.ms).toFixed(2)}x`
    );
    expect(par.ms).toBeLessThanOrEqual(seq.ms);
  }, 120_000);
});
