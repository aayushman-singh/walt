# V5 Session Summary

Branch: `feat/v5-pcs-streaming`

## User-Visible Outcome

When forward-secret sharing is explicitly enabled with `NEXT_PUBLIC_FS_SHARING=on`, new shared-file sends now use the recipient's current post-compromise ratchet prekey instead of the legacy prekey ring. After the recipient rotates the ratchet, previously issued ratchet-epoch shares no longer decrypt with the new epoch state.

The feature remains default-off. Rotation expires prior-epoch ratchet shares, so enabling automatic or UX-driven rotation needs a deliberate product decision rather than a hidden background behavior change.

## Security Claims

- A recipient identity can publish and persist a ratchet-backed prekey pair for new V2 forward-secret shares.
- Ratchet rotation is guarded by a Firestore transaction that compares the previous public and private ratchet state before publishing the next epoch.
- Public and owner-only ratchet records must agree on epoch, prekey id, and public key. Drift fails loudly.
- Ratchet-backed shares are marked with `keyLifecycle: "ratchet-v1"`, and decryption routes through the ratchet resolver only.
- Legacy prekey-ring shares remain readable through the explicit `prekey-ring-v1` compatibility path.

## Non-Claims

- This does not protect against passphrase compromise.
- This does not protect against active directory substitution when the attacker also controls or steals the substituted identity private key.
- This does not silently repair beta ratchet state created before `EncryptedRatchetState.publicKey` existed. That state now fails loudly and needs a deliberate repair or reset path before broad rollout.
- Re-sharing still decrypts into a whole plaintext buffer before creating the new share envelope.
- Chunked download decryption avoids a contiguous ciphertext `arrayBuffer()`, but the browser still materializes final `Blob` parts. It is not a true constant-memory sink.

## Performance Evidence

Bench command:

```powershell
$env:BENCH='1'; node --expose-gc ./node_modules/vitest/vitest.mjs run tests/bench/cryptoPerf.bench.test.ts --pool=forks
```

Observed output:

```text
[A] 100 MB encryption
  whole-file : time 164 ms | peak arrayBuffers 100.1 MiB | peak rss 391.1 MiB
  streaming  : time 211 ms | peak arrayBuffers 72.2 MiB | peak rss 261.0 MiB
  memory saved (arrayBuffers peak): 27.9 MiB

[B] wrap DEK to 25 recipients
  sequential : 12 ms
  parallel   : 2 ms
  speedup    : 7.44x
```

Streaming upload encryption trades about 29% more wall time in this run for lower peak memory: about 130.1 MiB lower RSS, 1.5x lower RSS, and 1.4x lower peak `arrayBuffers`.

## Verification

- `npm test`: passed, 21 test files passed, 1 bench file skipped, 160 tests passed, 2 skipped.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed with existing warnings, no errors.
- V5 review artifact: `codex/v5-pcs-streaming-review.md` reports no Critical/High/Medium findings.
