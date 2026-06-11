# STATE_V4

Branch: `feat/v4-forward-secret-sharing`

## Phase
A — design (in progress → done) → B implement → C tests+docs

## Last step
- Read prior crypto (recipientSharing, recipientKeys, directory, orchestration, rules).
- Confirmed gap: v1 wrap is ephemeral(sender)-static(recipient) ECDH → recipient long-term key decrypts every share. No forward secrecy.
- Locked design: v2 envelope, secret = HKDF( DH(EK,IK) ‖ DH(EK,PK) ), PK = rotating recipient session prekey whose private is evicted → forward secrecy.
- Created branch, design note `docs/crypto-forward-secrecy.md`, DECISIONS_V4.md.

## Next step
- Implement `lib/forwardSecretSharing.ts` (v2 wrap/unwrap, version dispatch).
- Implement `lib/recipientPrekeys.ts` (pool gen, at-rest encrypt, rotate+evict).
- Wire directory (publish/lookup prekey bundle) + orchestration version dispatch.
- Firestore rules + indexes for prekeys.
- Tests: FS property, v2 round-trip, v1 back-compat, orchestration.
- Codex review (design done; implementation pending), honest docs, SESSION_SUMMARY_V4.

## Codex
- codex/ : design review + impl review (pending)
