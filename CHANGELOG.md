# Changelog

All notable changes to Walt IPFS Drive will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Open source release preparation
- Self-hosting documentation
- Contributing guidelines
- Security policy
- GitHub issue templates

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

