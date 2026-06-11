# Post-compromise (healing) ratchet — V5

`lib/postCompromiseRatchet.ts`. Read alongside `docs/crypto-forward-secrecy.md` (V4),
whose two-DH wrap this builds on unchanged.

## The gap V4 left open

V4 gives **forward secrecy** through a bounded *ring* of session prekeys: evicting
the oldest makes shares bound to it unreadable. But the ring keeps **many** prekey
privates live at once, and each rotation evicts only the single oldest. So:

- An attacker who captures the recipient's live private key material at time *T*
  can read every share wrapped to **any** still-resident prekey.
- The ring only fully heals after a **complete turnover** (ring-size rotations);
  until then, prekeys the attacker holds remain valid wrap targets.

That is why V4 honestly documented **no post-compromise security (PCS)**.

## The V5 property: single-step healing

V5 replaces the ring with a **single ratcheting prekey**:

```
epoch n     : recipient publishes ONE ratchet prekey  R_n = (epoch n, prekeyId, P-256 public)
              private R_n.priv stored encrypted under the passphrase (owner-only)

ratchetForward():
              R_{n+1} = fresh P-256 keypair from new CSPRNG entropy
              publish R_{n+1}; DROP R_n.priv (never carried into the new state)
```

Senders always wrap to the current published prekey using the **identical** two-DH
envelope as V4 (`encryptForRecipientsFS`):

```
wrapSecret = HKDF( ECDH(EK, IK_identity) ‖ ECDH(EK, R_current), salt, info )
```

Because `R_{n+1}.priv` is independent fresh randomness and `R_n.priv` is destroyed,
**one** ratchet step does both:

| | mechanism | result |
|---|---|---|
| **Heals (PCS)** | new private is entropy the attacker never saw | a share wrapped to epoch *n+1* is unreadable to an attacker holding the epoch-*n* ratchet private + the long-term identity private |
| **Expires (FS)** | old private is destroyed | epoch-*n* shares become unreadable the instant epoch *n+1* is adopted |

The confidentiality and identity-binding crypto are **unchanged** — a directory-
substituted prekey is still denial-of-service, never disclosure (the attacker lacks
`IK_identity_priv`). The ratchet is a **key-lifecycle** change, not a new cipher.

### Proof

`tests/frontend/postCompromiseRatchet.test.ts`:

- **PCS** — capture the epoch-0 ratchet private + identity private, `ratchetForward`,
  create a share at epoch 1; an attacker resolver returning the captured epoch-0 key
  for *any* prekey id **cannot** decrypt the epoch-1 share (fails in the GCM tag),
  while the recipient holding the epoch-1 state reads it fine (healed).
- **FS** — a prior-epoch share decrypts while current, then throws "ratcheted out"
  the instant the ratchet advances.
- **DH contribution** — forcing the epoch-0 private against an epoch-1 wrap fails,
  proving `ECDH(EK, R)` genuinely gates the key (no key confusion).
- Many consecutive ratchets: only the current epoch reads; all priors expire.

## Honest scope — what is NOT claimed

- **PCS is against private-key-material compromise**, not passphrase compromise. The
  ratchet private is stored encrypted under the user's passphrase, so an attacker who
  learns the **passphrase** *and* keeps reading storage decrypts future epochs too.
  Healing a passphrase compromise is fundamentally impossible against a party who
  continues to read passphrase-locked storage — it needs a second factor/device and
  is out of scope.
- **Single-step heal, single-step expiry are the same step.** Per the FS ↔ re-download
  tension (see `crypto-forward-secrecy.md`), once you ratchet, prior-epoch shares are
  gone for **everyone**, including the recipient. Surfacing that as *expiry* in the UI
  and choosing a ratchet cadence (e.g. per login vs. per share) is rollout work.
- **Not a double ratchet.** There is no per-message chain key and no sending/receiving
  symmetric ratchet. Granularity is per epoch (the ratchet interval).
- **Sender authentication is still not provided** (unchanged from V4): the envelope
  proves "encrypted to me", not "sent by X".

## Wire format

The ratchet emits the **same** v2 forward-secret wrap as V4 — `meta.recipientAlg =
'ECDH-P256-2DH+HKDF-SHA256'`, dispatched by `decryptForRecipientFS`. The published
prekey and owner-only state are new, prekey-agnostic structures
(`PublishedRatchetPrekey`, `EncryptedRatchetState`); moving to server-claimed
one-time prekeys later remains a storage change, not a crypto change.

## Rollout

Like V4, this is library + proof. Turning it on requires onboarding to provision a
ratchet (`createRatchet`) and a driver to call `ratchetForward` on a cadence, plus an
expiry UI for prior-epoch shares. Until wired, the live site is unchanged.
