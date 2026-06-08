# Changelog

All notable changes to Walt IPFS Drive will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Client-side encryption** — opt-in end-to-end AES-256-GCM with Argon2id key
  derivation; files are encrypted in the browser before IPFS upload, decrypted on
  download, with an "encrypt uploads" toggle and an encrypted badge (`lib/encryption.ts`).
- Vitest test suite (backend route tests + frontend/crypto unit tests) and a
  Playwright public-landing E2E.
- GitHub Actions CI (lint, typecheck, test, build).
- `docs/ARCHITECTURE.md`, `docs/PAYMENT_INTEGRATION.md`, and `RUNBOOK.md` with a
  one-command Docker Compose self-host setup.
- Open source release preparation, self-hosting docs, contributing guidelines,
  security policy, GitHub issue templates.

### Changed
- Decomposed the 4726-LOC `dashboard.tsx` and 1773-LOC storage hook into focused
  modules (every file < 500 LOC); modularized the Express backend into routers
  with a pino logger.
- Standardized tooling on a single pnpm workspace; removed dead dependencies and
  the dead `lib/database.ts`.

### Security
- Replaced the "public by CID" caveat with real client-side encryption; updated
  `SECURITY.md` with the threat model and known limitations.

## [1.0.0] - 2024-12-01

### Added
- GB-based pricing model ($0.40/GB above 5GB free tier)
- Billing modal requirements implementation
- Warning banner for free tier exceeded
- 14-day dismissible warnings
- Mandatory payment modal on billing day
- Backend billing status endpoint with GB metrics
- Frontend UI showing GB usage
- Environment variables for billing configuration

### Changed
- Switched from fictional Pinata costs to real self-hosted pricing
- Updated payment modal to show GB breakdown
- Improved billing calculations for sustainability

### Documentation
- Documented the GB-based pricing migration (from fictional Pinata costs to
  real self-hosted pricing) inline in this changelog
- Documented billing integration and the billing-modal behaviour in
  [`docs/PAYMENT_INTEGRATION.md`](docs/PAYMENT_INTEGRATION.md)

## [0.9.0] - Earlier

### Added
- File upload and download via IPFS
- Folder organization
- Starred files functionality
- Trash with 30-day recovery
- Share links with passwords and expiration
- Version history tracking
- Firebase authentication
- Cashfree payment integration
- Storage quota management
- Auto-pin toggle
- Gateway settings
- Two-factor authentication
- Activity logging
- Notifications system

### Technical
- Next.js 14 frontend
- Express.js backend
- SQLite database
- Local IPFS node (Kubo)
- Docker Compose setup
- Vercel deployment

---

## Release Notes Format

### [Version] - YYYY-MM-DD

#### Added
- New features

#### Changed
- Changes to existing functionality

#### Deprecated
- Features marked for removal

#### Removed
- Removed features

#### Fixed
- Bug fixes

#### Security
- Security fixes

---

## Upcoming

### v1.1.0 (Planned)
- [ ] Mobile app (React Native)
- [ ] Team collaboration features
- [ ] Client-side encryption
- [ ] Bulk operations

### v1.2.0 (Planned)
- [ ] IPFS cluster support
- [ ] S3-compatible API
- [ ] Advanced search
- [ ] File previews for more formats

### v2.0.0 (Future)
- [ ] Desktop app (Electron)
- [ ] End-to-end encryption by default
- [ ] Decentralized authentication
- [ ] Web3 integration

---

[Unreleased]: https://github.com/aayushman-singh/walt/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/aayushman-singh/walt/releases/tag/v1.0.0

