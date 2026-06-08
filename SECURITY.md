# Security Policy

## Supported Versions

We take security seriously. The following versions are currently supported with security updates:

| Version | Supported          |
| ------- | ------------------ |
| Latest  | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability, please report it privately:

1. **Email**: aayushman2702@gmail.com
2. **Subject**: "[SECURITY] Brief description"
3. **Include**:
   - Type of vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### What to Expect

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 1 week
- **Fix timeline**: Depends on severity
  - Critical: 24-72 hours
  - High: 1-2 weeks
  - Medium: 2-4 weeks
  - Low: Best effort

### Disclosure Policy

- We will work with you to understand and fix the issue
- We ask that you do not publicly disclose until we've released a fix
- We will credit you in the security advisory (unless you prefer to remain anonymous)
- For critical issues, we may request a coordinated disclosure

## Security Best Practices

### For Self-Hosters

If you're self-hosting Walt, please follow these security guidelines:

#### 1. Environment Variables
```bash
# ❌ Never commit .env files
# ❌ Never share credentials publicly
# ✅ Use strong, unique passwords
# ✅ Rotate credentials regularly
```

#### 2. Firebase Security
- Enable 2FA on your Firebase account
- Use Firebase Security Rules
- Restrict API keys to your domain
- Monitor Firebase Console for unusual activity

#### 3. Database Security
```bash
# ✅ Set proper file permissions
chmod 600 data/ipfs-drive.db

# ✅ Enable WAL mode (already default)
# ✅ Regular backups
# ✅ Don't expose database port
```

#### 4. IPFS Node Security
```bash
# ✅ Run IPFS behind firewall
# ✅ Don't expose API port (5001) to internet
# ✅ Use nginx/reverse proxy for gateway
# ✅ Rate limit API endpoints
```

#### 5. Server Hardening
- Keep OS and packages updated
- Use firewall (UFW, iptables)
- Enable fail2ban
- Use SSH keys (disable password auth)
- Regular security audits

#### 6. CORS Configuration
```javascript
// ✅ Restrict to your domains
ALLOWED_ORIGINS=https://yourdomain.com

// ❌ Never use in production
ALLOWED_ORIGINS=*
```

#### 7. SSL/TLS
- Use valid SSL certificates (Let's Encrypt)
- Force HTTPS
- Enable HSTS headers
- Use secure cookies

### For Hosted Service Users

If you're using walt.aayushman.dev:

- ✅ Enable 2FA on your account
- ✅ Use strong, unique passwords
- ✅ Don't share account credentials
- ✅ Review shared file permissions regularly
- ✅ Report suspicious activity immediately

## Known Security Considerations

### 1. IPFS Content Addressing
- IPFS content is **public by design**: anyone who learns a file's CID can fetch
  its bytes from the network. Content addressing provides integrity and
  censorship-resistance, **not** confidentiality.
- **Mitigation — client-side encryption (recommended for sensitive data).** Walt
  can encrypt files in your browser *before* they are added to IPFS. Toggle
  **"Encrypt uploads (end-to-end)"** in the sidebar and set a passphrase. With it
  on, only AES-256-GCM ciphertext ever leaves your device, so the CID reveals
  nothing without your passphrase. See [Encryption](#encryption) below and
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- Unpinning removes content from your node but copies may persist on other nodes;
  encryption is what actually protects already-published bytes.

### Encryption

Client-side, zero-knowledge envelope encryption (`lib/encryption.ts`):

- **Cipher:** AES-256-GCM (authenticated; detects tampering) with a unique random
  96-bit IV per file.
- **Key derivation:** the passphrase is stretched with **Argon2id** (memory-hard,
  64 MiB / 3 passes) over a random 16-byte salt to derive a key-encryption key.
- **Envelope:** a random per-file data key encrypts the bytes; that data key is
  then wrapped under the passphrase-derived key. Only ciphertext, the wrapped key,
  and the public KDF parameters (salt, IVs, costs) are needed to store an object.
  None of it is usable without the passphrase.
- **Tamper-binding (AAD):** the format version, cipher, KDF parameters, and the
  display-metadata header are bound into the GCM authentication tag as Additional
  Authenticated Data. A hostile store cannot alter those fields, or swap whole
  envelopes between records, without decryption failing.
- **Passphrase secrecy:** the passphrase is held only in memory for the session,
  is **never** transmitted or persisted, and is cleared on logout or when
  encryption is toggled off. A minimum length is enforced (the salt + wrapped key
  are public, so a weak passphrase is brute-forceable offline). **If you lose your
  passphrase, encrypted files are unrecoverable** — no backdoor by design.
- **Fail-closed:** a wrong passphrase, tampered header, or corrupted ciphertext
  fails loudly on download (GCM authentication error); there is no silent fallback
  to returning the raw ciphertext, and uploads abort rather than silently sending
  plaintext if encryption is on without a passphrase.

#### What encryption does and does NOT hide

| Protected (confidential + integrity-checked) | NOT hidden (visible metadata) |
| --- | --- |
| File **contents** (the bytes) | File **name**, **MIME type**, **size** |
| | The fact that a file exists, its CID, timestamps, folder |

File contents are fully protected. File **names, types, and sizes are stored as
metadata in cleartext** so the UI can list files without prompting for the
passphrase on every page load. If those are themselves sensitive, encrypt them
into the filename before upload (e.g. upload as a random name). Encrypting the
display metadata end-to-end is a planned enhancement.

#### Known limitations (roadmap)

- **Metadata confidentiality** — names/types/sizes are not yet encrypted (above).
- **Downgrade handling** — a record with no encryption metadata is treated as
  plaintext. A malicious store that *stripped* the metadata from an encrypted
  record would cause the client to download undecryptable ciphertext (a denial of
  service / UX failure, not a plaintext disclosure). A signed per-record format
  version is planned to make this fail explicitly.
- **Upload atomicity** — ciphertext upload and metadata persistence are not a
  single transaction; if the bytes upload but the metadata save fails, the object
  is unrecoverable. Transactional persistence is planned.

- **Scope / migration:** encryption is **opt-in per upload session**. Files
  uploaded while the toggle was off remain plaintext on IPFS; to protect an
  existing file, re-upload it with encryption enabled. Bulk re-encryption of an
  existing library is not yet automated.

#### Multi-recipient sharing (cryptographic)

Files can be shared to other walt users *cryptographically* rather than via a
server-trusted permission (`lib/recipientSharing.ts`, `lib/recipientKeys.ts`):

- Each user holds an **ECDH P-256 identity**. The public key is published to a
  directory (`publicKeys/{uid}`); the private key is encrypted at rest under the
  user's passphrase and stored owner-only (`users/{uid}/secrets/identityKey`) —
  the server never holds it in cleartext.
- A shared file is encrypted once with a random data key (DEK); the DEK is wrapped
  **per recipient** via ephemeral-static ECDH → HKDF-SHA256 → AES-256-GCM (ECIES).
  The server stores only ciphertext + the per-recipient wrapped keys.
- Each wrap and the content are AES-GCM **authenticated**, with AAD binding the
  format, `recipientId`, ephemeral key, salt, and a **file-context id** (prevents
  replaying a wrap/envelope onto another record). Wrong recipient / wrong key /
  tampering fails closed.
- Imported private keys are **non-extractable**.

**Trust model & limitations (disclosed, not hidden):**

- **Directory is trust-on-first-use.** The email→public-key mapping is asserted by
  the directory; an *actively malicious* directory could serve an attacker's key.
  The guarantee is "no **passive** server read of your files", not "defeats an
  active key-substitution attacker." **Mitigation (roadmap): out-of-band public-key
  fingerprint verification / signed identities.**
- **No recipient forward secrecy** — static-key ECIES means if a recipient's
  long-term key later leaks, files previously shared to them are recoverable.
- **Recipient-list integrity is not cryptographic** (so add/remove never
  re-encrypts the content). Revoking a recipient drops their wrap, but true
  revocation against someone who already read the file requires rotating the DEK
  on the next write.

### 2. Authentication
- Authentication via Firebase
- Backend validates all Firebase tokens
- CORS restricted to allowed origins

### 3. File Permissions
- Share links can have passwords and expiration
- Implement proper access controls for shared files
- Monitor share link usage

### 4. Payment Security
- Payment via Cashfree (PCI-compliant)
- No credit card data stored on our servers
- Webhook signature verification

### 5. Database
- SQLite database with prepared statements
- No SQL injection vulnerabilities
- User data isolated by user_id

## Security Features

✅ **End-to-end encryption**: opt-in client-side AES-256-GCM + Argon2id (zero-knowledge)  
✅ **Authentication**: Firebase Auth  
✅ **Authorization**: Token-based with backend validation  
✅ **Input Validation**: All endpoints validate inputs  
✅ **SQL Injection**: Prepared statements only  
✅ **XSS Protection**: React auto-escapes  
✅ **CSRF Protection**: SameSite cookies  
✅ **Rate Limiting**: Recommended for production  
✅ **CORS**: Configurable origins  
✅ **HTTPS**: Enforced in production  

## Regular Security Tasks

### Weekly
- Review access logs
- Monitor for unusual activity
- Check failed login attempts

### Monthly
- Update dependencies (`npm audit fix`)
- Review user permissions
- Check for security advisories

### Quarterly
- Full security audit
- Review and rotate credentials
- Update security documentation

## Dependencies

We use:
- `npm audit` to check for vulnerable packages
- Dependabot for automated security updates
- Regular manual reviews of dependencies

## Bug Bounty

We currently do not have a formal bug bounty program, but we greatly appreciate responsible disclosure and will:

- Acknowledge your contribution
- Credit you in security advisories (if desired)
- Provide swag/credits on our hosted service

## Questions?

For security questions that don't involve a vulnerability, please:
- Open a GitHub Discussion
- Tag with "security" label

Thank you for helping keep Walt secure! 🔒

