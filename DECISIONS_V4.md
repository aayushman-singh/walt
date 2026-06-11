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

## D5 — Deploy-safe: feature flag defaults OFF
New shares emit v2 only when `NEXT_PUBLIC_FS_SHARING === 'on'`. Reading v1 + v2 is
ALWAYS enabled. Default is OFF (corrected after codex review): turning v2 on requires
every participant to already have a published prekey ring AND a rotation driver, which
this wave does not yet wire into onboarding/login. Shipping v2-on by default would
break sharing for existing v1-only users. main stays green on v1 until that wiring
lands. The live wrap format does not change.

## D6 — No fallbacks
A missing prekey bundle, malformed/duplicate prekey, wrong passphrase, evicted prekey,
or tampered wrap throws loudly with context (an evicted prekey resolves to null and
the caller raises an explicit "forward-secret / expired" error). There is NO silent
fallback. (An earlier draft of this file described an "identity-bound last-resort
prekey" fallback — that was never implemented and would violate the no-fallback rule;
it is removed.)

## D7 — Honest scope (added after codex review)
- **Forward-secrecy window = re-download window.** A re-downloadable drive share and
  forward secrecy are in fundamental tension: any key that can still decrypt server
  ciphertext is a key whose compromise breaks confidentiality. So per-session eviction
  means an evicted share is unreadable by EVERYONE, including the recipient. This is
  the *expiry* mechanism, documented as such — not silent data loss. The crypto + test
  deliver the proven FS property; making rotation automatic and surfacing expiry in the
  UI is follow-up.
- **Sender authentication is out of scope.** v2 proves "encrypted to me", not "from
  sender X". `fromEmail` is Firestore-rule-bound only. Signing the envelope is future
  work.
- **Directory trust is still TOFU.** v2's identity-DH term makes *prekey-only*
  substitution a DoS, not disclosure; full identity+prekey substitution by a malicious
  directory is still disclosure. Out-of-band fingerprint verification remains the
  planned mitigation (DECISIONS #11).
- **"Eviction" ≠ cryptographic erasure** if Firestore history/backups retain old
  encrypted rings and the passphrase is later compromised. Erasure strength depends on
  the backup threat model.
