No Critical/High/Medium findings.

Residual notes: the diff is materially more honest about the crypto and perf boundaries: active directory substitution plus identity-key compromise is no longer overclaimed, re-share is no longer described as bounded-memory, and chunked download avoids contiguous ciphertext buffering without pretending to be true constant-memory.

The only thing I would still want called out before merge is migration posture for any already-created ratchet state that lacks `EncryptedRatchetState.publicKey`. This now fails loudly via parity checks, which matches the no-fallback rule, but release notes or an operator note should say beta/on-flag users may need a deliberate repair/reset path.