# STATE_V4

Branch: `feat/v4-forward-secret-sharing`

## Phase
C — tests + docs + codex hardening DONE. PR pending.

## Done
- Phase A: confirmed gap (v1 = ephemeral-sender/static-recipient ECDH, no FS). Design
  note `docs/crypto-forward-secrecy.md`, `DECISIONS_V4.md`.
- Phase B: implemented
  - `lib/forwardSecretSharing.ts` — v2 two-DH wrap/unwrap, version dispatch, untrusted-input validation.
  - `lib/recipientPrekeys.ts` — prekey ring gen, at-rest encrypt, rotate+evict, bundle validation.
  - `lib/recipientDirectory.ts` — publish/lookup prekey bundle + ring (atomic writeBatch).
  - `hooks/useRecipientIdentity.ts` — provision/rotate prekeys, resolve FS recipient, prekey resolver.
  - `lib/encryptedShareOrchestration.ts` + `useEncryptedShare.ts` — emit v2 behind flag (default OFF), read v1+v2.
- Phase C: tests (FS property proof incl. PK-DH-contributes, lifecycle E2E, orchestration v2 + v1 back-compat, validation). All 124 pass. Lint clean. tsc clean.
- Codex review (codex/v4-review.txt). Applied: strengthened FS test, runtime validation, atomic publish, flag default OFF, honest docs (data-loss=expiry, sender-auth non-goal, TOFU, rotation-driver follow-up, removed phantom fallback).

## Follow-ups (documented, not done — out of this wave's scope)
- Rotation driver (call rotatePrekeys per session) so FS is operational, not latent.
- Expiry UX surfacing eviction to users.
- Envelope signing for sender authentication.
- Firestore rules: tighter schema validation of prekeyBundle.

## Next step
- Commit hardening, write SESSION_SUMMARY_V4.md, open PR (no merge to main).
