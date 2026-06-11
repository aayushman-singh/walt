# HANDOFF_V4 — walt

You are the per-repo orchestrator for `walt` (IPFS Drive, Next.js + Firebase, live at walt.aayushman.dev). Prior waves shipped client-side AES-256-GCM + Argon2id envelope encryption, multi-recipient ECIES sharing, WebAuthn-PRF passkey keys, and the share modal. Execute this wave fully autonomously.

## Hard rules (do not violate)
1. Never block on the user — decide, write the call into `DECISIONS_V4.md`, pick the more ambitious option.
2. Deploy boundary: live only if cheap+keyless; else one-command deployable + templated secrets. The live site at walt.aayushman.dev must stay green; do NOT push to a branch that auto-deploys `main` without the feature behind a flag.
3. After each large refactor run: `codex exec "review this diff as a senior engineer with no patience for excuses. Find architectural problems, security holes, untested edge cases, naming smell, dead code. Be brutal. No praise."` Apply criticisms in a follow-up commit. Save raw output under `codex/`.
4. Maintain `STATE_V4.md` (phase, last step, next step). Read it first on resume.
5. Backend/crypto E2E tests REQUIRED. No fallbacks — fail loudly with rich logs.
6. Work on a branch `feat/v4-forward-secret-sharing`. Open a PR at the end; do not merge to main.

## Mission
Close the documented crypto gap: today's ECIES sharing is **static-ECDH with no forward secrecy** — a one-time compromise of a recipient's long-term P-256 key decrypts every file ever shared to them. Add **forward-secret sharing**: an ephemeral-static ECDH ratchet so each share (or each session) uses a fresh ephemeral key, and compromise of long-term keys does not retroactively decrypt prior shares.

## Success criteria (observable)
- A shared file's DEK wrap uses a fresh ephemeral key per share; the wire format records the ephemeral public key; the server still never sees plaintext.
- A test proves: given a recipient's long-term private key AND a captured ciphertext, a *prior* share's DEK cannot be derived (forward secrecy) — and a current share still decrypts correctly.
- Honest docs: state exactly what FS property is achieved (per-share ephemeral) vs not (no double-ratchet / no post-compromise security unless you add it). No overclaiming.

## Plan
A. Design the ratchet + wire-format change (back-compat: version the envelope). Codex the design note.
B. Implement encrypt/wrap + decrypt/unwrap; migrate the share modal + Firestore inbox schema (versioned).
C. Tests (FS property + back-compat decrypt of v1 shares) + honest README/crypto-notes. Codex. Write `SESSION_SUMMARY_V4.md`.

## Start
Read `STATE_V4.md` if it exists, else create it and begin Phase A. Go.
</content>
