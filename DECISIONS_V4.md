# DECISIONS_V4 — forward-secret sharing

Autonomous calls (hard rule #1: decide, don't block, pick the more ambitious option).

## D1 — Forward-secrecy mechanism: recipient prekeys, not just sender ephemerals
v1 already uses a fresh *sender* ephemeral per wrap, but the recipient side is the
long-term identity key — so the recipient's long-term private key derives every
shared secret ever. Forward secrecy REQUIRES a second, deletable secret that the
identity key cannot reconstruct. Chosen: recipient publishes **session prekeys**
(ECDH P-256). Each wrap mixes a fresh sender ephemeral EK with BOTH the recipient
identity key IK and a recipient prekey PK:

    wrapSecret = HKDF-SHA256( ECDH(EK,IK) ‖ ECDH(EK,PK), salt, info )

- `ECDH(EK,IK)` binds the wrap to the published identity (an attacker who swaps a
  prekey into the directory still needs IK_priv → directory-substitution is DoS,
  not disclosure).
- `ECDH(EK,PK)` is the forward-secret term: once PK's private key is evicted, no
  holder of IK_priv can recover it.

## D2 — Prekey lifecycle: rotating bounded ring with eviction (not server-claimed one-time)
True Signal-style one-time prekeys need a trusted server to atomically hand out &
delete each OPK; in Firestore that means letting senders WRITE to a victim's pool
(DoS + rule complexity). Rejected as not deploy-safe. Chosen instead: the recipient
maintains a **bounded ring** of session prekeys, publishes the public ring, and on
rotation deletes the oldest prekey's PRIVATE half. Senders pick the newest published
prekey. Forward-secrecy window = rotation/eviction interval. Honest docs state this
is per-session FS, NOT a double ratchet and NOT post-compromise security.
The crypto module is prekey-agnostic, so swapping to true one-time prekeys later is
a storage change, not a crypto change.

## D3 — Wire format: versioned envelope, v1 stays decryptable
New shares are `meta.v = 2`, `recipientAlg = 'ECDH-P256-2DH+HKDF-SHA256'`, and each
wrap carries `prekeyId`. Decrypt dispatches on `meta.v`: v1 → legacy path
(lib/recipientSharing), v2 → lib/forwardSecretSharing. No migration of existing
shares; old inbox records keep working forever.

## D4 — At-rest prekey privates reuse the passphrase envelope
Prekey private keys are PKCS#8 → `encryptBytes` (Argon2id+AES-GCM) under the user's
existing passphrase, stored owner-only at `users/{uid}/secrets/prekeys`. One secret,
zero new trust — same posture as the identity key.

## D5 — Deploy-safe: feature flag
New shares emit v2 only when `NEXT_PUBLIC_FS_SHARING` is enabled (defaults ON in this
branch). Reading v1 + v2 is always enabled. main stays green; the live wrap format
does not change until the flag ships.

## D6 — No fallbacks
A missing prekey bundle, exhausted ring, wrong passphrase, or tampered wrap throws
loudly with context. The only documented alternative behaviour is the identity-bound
last-resort prekey when the one-time ring is empty, and it is logged at the moment it
is used (see docs/crypto-forward-secrecy.md).
