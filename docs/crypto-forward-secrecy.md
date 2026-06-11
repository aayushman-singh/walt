# Forward-secret sharing (V4)

## The gap this closes

walt's V3 sharing wraps a file's data-encryption key (DEK) to each recipient with
ECIES: a fresh **sender** ephemeral ECDH key, the recipient's **long-term** P-256
identity key, HKDF-SHA256, AES-256-GCM. That gives confidentiality against a passive
server, but **no forward secrecy**: the shared secret is `ECDH(EK_sender, IK_recipient)`,
and `IK_recipient` is a *long-term* key. Compromise that one private key once and you
can recompute the secret for **every** wrap ever made to that recipient — including
ciphertexts captured years earlier.

## The V4 property

Each V4 wrap derives its key from **two** Diffie–Hellman outputs:

```
EK            = fresh sender ephemeral (P-256), discarded after the wrap
IK_recipient  = recipient long-term identity key  (published, never deleted)
PK_recipient  = recipient SESSION PREKEY          (published, private EVICTED on rotation)

wrapSecret = HKDF-SHA256(
                ECDH(EK, IK_recipient) ‖ ECDH(EK, PK_recipient),
                salt,
                info = "walt-fs-recipient-wrap-v2"
             )
wrapKey    = AES-256-GCM key from wrapSecret
```

- **`ECDH(EK, IK)` — identity binding.** Deriving the key requires the recipient
  *identity* private key. So an attacker who substitutes their own prekey into the
  directory still cannot read the file (they lack `IK_priv`). Directory substitution
  becomes denial-of-service, never disclosure.
- **`ECDH(EK, PK)` — the forward-secret term.** `PK` is a short-lived session prekey.
  Its private half is **deleted** when the prekey rotates out of the recipient's
  bounded ring. After eviction, the second DH output is unrecoverable, so even a full
  compromise of the **long-term identity key** cannot reconstruct `wrapSecret` for any
  already-evicted share.

### What is actually guaranteed (no overclaiming)

| Property | Status |
|---|---|
| Server never sees plaintext or DEK | ✅ (unchanged from V3) |
| Compromise of long-term **identity** key reveals **past** shares | ❌ → **fixed**: past shares need the evicted prekey private, not the identity key |
| Fresh ephemeral per share on the **sender** side | ✅ |
| Forward secrecy granularity | **per session prekey** — the FS window equals the rotation/eviction interval, not literally per-message |
| Double ratchet / per-message chain keys | ❌ not implemented |
| Post-compromise security (healing after a compromise that leaks live prekey privates) | ⤴ **V5**: single-step healing ratchet against private-key-material compromise — see `crypto-post-compromise.md` (not against passphrase compromise) |
| Defeats an *actively malicious* directory (wrong identity key served on first use) | ❌ — still trust-on-first-use; out-of-band fingerprint check is the mitigation (see DECISIONS #11) |

The honest one-liner: **V4 gives per-session forward secrecy against later compromise
of the recipient's long-term identity key. It is not a double ratchet and provides no
post-compromise security.**

### The unavoidable trade-off: FS window = re-download window

Forward secrecy and an indefinitely re-downloadable drive share are in **fundamental
tension**. If server ciphertext `C` can be decrypted at any future time `T` using only
keys the recipient holds at `T`, then compromising the recipient at `T` breaks `C`'s
confidentiality. Forward secrecy *requires* that the key for `C` be destroyed before the
compromise — so the forward-secrecy window and the re-download window are the **same
interval**. Concretely: once a session prekey is evicted, the shares bound to it become
unreadable by **everyone, including the recipient**. That is the *expiry* of the share,
not silent data loss — but it MUST be surfaced to the user as expiry. Wiring automatic
rotation and an expiry UI is follow-up work (see Rollout below); the crypto and the
proof are what this wave ships.

### Sender authentication is NOT provided

v2 proves "this was encrypted *to me*", not "this was sent *by sender X*". The displayed
`fromEmail` is bound only by Firestore rules, so a malicious server/admin could rewrite
provenance. Cryptographic sender authentication (signing the envelope) is future work.

## Prekey lifecycle

The recipient keeps a **bounded ring** of session prekeys (default 5):

1. On identity setup / login, generate prekeys to fill the ring. Public halves are
   published in the directory; private halves are PKCS#8 → Argon2id+AES-GCM encrypted
   under the user's passphrase and stored owner-only (`users/{uid}/secrets/prekeys`).
2. Senders fetch the recipient's bundle and wrap to the **newest** published prekey.
3. On rotation, a new prekey is added and the **oldest private is deleted**. Any share
   bound to an evicted prekey is now forward-secret — and also no longer decryptable by
   anyone, including the recipient, unless it was downloaded while the prekey was live.
   (Inbox items are meant to be pulled promptly; this is the documented trade-off of
   per-session FS without server-coordinated one-time prekeys.)

## Rollout (feature flag, default OFF)

New shares emit v2 only when `NEXT_PUBLIC_FS_SHARING === 'on'`. Reading both v1 and v2
is always on. The flag defaults **off** because emitting v2 safely requires, for every
participant:

1. A **published prekey ring** (`ensureIdentity` provisions one only when the FS flag is
   on, so an FS-off build's v1 setup never breaks on prekey generation; existing v1-only
   users have none until then), and
2. A **rotation driver** — something that calls `rotatePrekeys` on a cadence (e.g. per
   login/session). Without it, `pickPrekeyForWrap` keeps choosing the same newest
   prekey forever and the "forward-secret" key never actually rotates or evicts, which
   degrades v2 to a second long-lived ECDH key.

Until both are wired into onboarding/login, the live site keeps emitting v1 so sharing
never breaks. Turning the flag on before that wiring exists will fail loudly for users
without a prekey ring (no silent fallback).

### Untrusted-input validation

Prekey bundles and wraps come from Firestore (untrusted). Before use, the code validates
them explicitly (`lib/recipientPrekeys.requireWellFormedPrekey`,
`lib/forwardSecretSharing.requireWellFormedWrap` / `requireUncompressedP256`): version,
algorithm, integer non-negative `seq`, unique ids, 65-byte uncompressed P-256 points, and
exact wrap byte shapes (salt = 16 bytes, IV = 12 bytes, non-empty wrapped key) — so
malformed directory data raises a clear error instead of an opaque crypto failure.

Rotation additionally rejects a **drifted** bundle/ring (`assertBundleRingParity`: equal
length, one-to-one ids, matching seqs) and **proves the passphrase** against the existing
ring (`verifyRingPassphrase`) before encrypting a fresh prekey under it. Together those
guarantee a rotation can never publish a public prekey whose private half is missing or
encrypted under a divergent passphrase — i.e. a wrap target nobody can decrypt.

### Why not true one-time prekeys?

Signal-style one-time prekeys need a **trusted server** to atomically hand out and
delete one OPK per session. In Firestore that means granting *other* users write/delete
on a victim's prekey pool — a DoS surface and a rule-complexity hole. We rejected it as
not deploy-safe. The crypto module is **prekey-agnostic** (`prekeyId` + a public point),
so moving to server-claimed one-time prekeys later is a *storage* change, not a *crypto*
change.

## Wire format

`meta.v = 2`, `meta.recipientAlg = 'ECDH-P256-2DH+HKDF-SHA256'`. Each recipient wrap:

```jsonc
{
  "recipientId": "<uid>",
  "prekeyId":   "<which recipient prekey PK was used>",
  "epk":        "<base64 raw sender ephemeral public point>",
  "salt":       "<base64 HKDF salt>",
  "iv":         "<base64 AES-GCM IV>",
  "wrappedKey": "<base64 AES-GCM(DEK)>"
}
```

Decryption dispatches on `meta.v`: **v1** → legacy `lib/recipientSharing`, **v2** →
`lib/forwardSecretSharing`. Existing v1 inbox records keep decrypting forever.

## AAD

The wrap AAD binds `[version, recipientAlg, recipientId, prekeyId, epk, salt, context]`
so none of the public parameters can be swapped, and `context` (the file id) prevents a
valid wrap from being replayed onto a different record. The content AAD binds the stable
header + context but NOT the recipient list, so adding/removing a recipient never
invalidates the ciphertext.
