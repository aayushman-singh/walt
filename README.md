# Walt

Self-hostable IPFS storage with versioning, pinning, password-shared links, and built-in billing. Decentralized cloud storage that you actually own.

<div align="center">

[![Live](https://img.shields.io/badge/Live-walt.aayushman.dev-1f6feb?style=flat)](https://walt.aayushman.dev)
[![CI](https://github.com/aayushman-singh/walt/actions/workflows/ci.yml/badge.svg)](https://github.com/aayushman-singh/walt/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-c8693d?style=flat)](LICENSE.md)
[![Self-Hostable](https://img.shields.io/badge/self--hostable-yes-3a8a5f?style=flat)](#self-hosting)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat)](https://nextjs.org/)
[![IPFS](https://img.shields.io/badge/IPFS-Enabled-blue?style=flat)](https://ipfs.tech/)
[![Encrypted](https://img.shields.io/badge/encryption-AES--256--GCM-3a8a5f?style=flat)](SECURITY.md#encryption)

</div>

---

## Why

Cloud storage is centralized, expensive, and a lock-in trap. IPFS solves the protocol problem but ships without auth, billing, or a usable interface. Walt fills the gap — content-addressed storage with the UX of Drive and the sovereignty of self-hosting. 5GB free on the hosted version; spin up your own for nothing on a Raspberry Pi.

## Features

**Core**
- File management — upload, download, organize files and folders
- Pinning — choose what to persist permanently on IPFS
- Versioning — track file history, restore previous versions
- Sharing — generate links with passwords and expiration
- Trash — safe deletion with 30-day recovery
- Favorites — star important files for quick access

**Advanced**
- **Client-side encryption** — opt-in end-to-end AES-256-GCM (Argon2id key
  derivation). Files are encrypted in your browser before they touch IPFS, so the
  CID reveals nothing without your passphrase. See [SECURITY.md](SECURITY.md#encryption).
- Firebase Auth — secure login
- Billing — usage tracking + payment integration (optional)
- Custom IPFS gateways — point Walt at your preferred edge
- Storage stats — usage and cost dashboards

**Developer**
- RESTful API
- Docker + Docker Compose ready
- TypeScript end-to-end
- Modular — easy to extend

## Quick start

### Hosted (zero setup)

[**walt.aayushman.dev**](https://walt.aayushman.dev) — 5GB free, $0.40/GB/month above.

### Self-hosted

```bash
git clone https://github.com/aayushman-singh/walt.git
cd walt
cat SELF_HOSTING.md
```

Setup time: 1-2 hours. Monthly cost: $10-30 depending on provider.

[**Complete Self-Hosting Guide →**](SELF_HOSTING.md)

## Architecture

```
┌─────────────────────────────────────────────┐
│            Frontend (Next.js)               │
│  React UI · Firebase Auth · Vercel          │
└─────────────────┬───────────────────────────┘
                  │ HTTPS / REST
┌─────────────────▼───────────────────────────┐
│         Backend (Node.js / Express)         │
│  API · Auth validation · Billing            │
└─────────────┬─────────────────┬─────────────┘
              │                 │
    ┌─────────▼─────────┐  ┌────▼─────────┐
    │  SQLite           │  │  IPFS Node   │
    │  Users · metadata │  │  Storage     │
    │  Billing          │  │  Pinning     │
    └───────────────────┘  └──────────────┘
```

## Stack

**Frontend** — Next.js 16 · React 19 · TypeScript · Tailwind · Firebase Auth · Vercel
**Backend** — Node.js 20 · Express · SQLite · pino
**Storage** — IPFS (Kubo) · Cashfree (payments, optional)

## Development

This is a pnpm workspace (frontend at the root, `backend/` as a member).

```bash
git clone https://github.com/aayushman-singh/walt.git
cd walt

# Frontend deps (skips the backend's native better-sqlite3 build)
pnpm install --filter walt

# Frontend dev server
pnpm dev
```

Open `http://localhost:3000`.

**Backend + IPFS** run via Docker (the backend's native deps build cleanly on
Linux). See [RUNBOOK.md](RUNBOOK.md) for the one-command Docker Compose setup with
templated secrets:

```bash
cp backend/.env.example backend/.env   # then fill in Firebase + (optional) Cashfree
docker compose up -d                   # starts Kubo (IPFS) + the backend
```

### Quality gates

```bash
pnpm lint        # ESLint 9 (flat config)
pnpm exec tsc --noEmit
pnpm test        # Vitest — backend route tests + frontend/crypto unit tests
pnpm e2e         # Playwright — public landing happy path
pnpm build
```

All of the above run in CI on every PR (`.github/workflows/ci.yml`).

### Project structure

```
walt/
├── pages/              Next.js pages
│   ├── dashboard.tsx   Main app interface
│   ├── api/            API routes (proxy to backend)
│   └── index.tsx       Landing page
├── components/         React components
├── lib/                Utilities
├── backend/            Express server
│   ├── server.js
│   ├── billingUtils.js
│   └── paymentService.js
├── styles/             CSS modules
├── hooks/              React hooks
└── docs/               Documentation
```

## Pricing (hosted)

| Tier | Storage | Price |
| --- | --- | --- |
| **Free** | 5 GB | $0/month |
| **Pay-as-you-go** | Above 5 GB | $0.40/GB/month |

Self-host = no usage limits, full control, your IPFS node, your data.

## Roadmap

- [x] File upload/download
- [x] IPFS integration
- [x] User auth
- [x] Folder organization
- [x] File sharing
- [x] Billing system
- [x] Client-side encryption (AES-256-GCM, opt-in)
- [ ] Mobile app (React Native)
- [ ] Team collaboration
- [ ] Encrypted file metadata (names/sizes)
- [ ] IPFS cluster support
- [ ] S3-compatible API
- [ ] Desktop app (Electron)

## Documentation

- [Self-Hosting Guide](SELF_HOSTING.md)
- [Contributing Guide](CONTRIBUTING.md)
- [Security Policy](SECURITY.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Billing Integration](docs/PAYMENT_INTEGRATION.md)
- [Self-Hosting Runbook](RUNBOOK.md)

## Contributing

PRs welcome. Look for issues labeled [`good first issue`](https://github.com/aayushman-singh/walt/labels/good%20first%20issue).

- Bugs → open an issue with reproduction steps
- Features → discuss first via [GitHub Discussions](https://github.com/aayushman-singh/walt/discussions)
- Docs → fix typos, add examples, write guides

## Security

If you discover a vulnerability:
- **Do not** open a public issue
- Email `aayushman2702@gmail.com` with subject `[walt-security]`
- See [Security Policy](SECURITY.md)

## Author

Built by [Aayushman Singh](https://aayushman.dev) — engineer building autonomous coding agents, decentralized storage, and surveillance-grade software. Smart India Hackathon '24 winner.

- Portfolio — [aayushman.dev](https://aayushman.dev)
- GitHub — [@aayushman-singh](https://github.com/aayushman-singh)
- X — [@aayushman2703](https://x.com/aayushman2703)
- LinkedIn — [in/aayushman-singh-zz](https://www.linkedin.com/in/aayushman-singh-zz/)

## License

MIT — use, modify, distribute freely (commercial OK). Keep the copyright notice.

## Acknowledgments

Built on [IPFS](https://ipfs.tech/), [Next.js](https://nextjs.org/), [Firebase](https://firebase.google.com/), [Express](https://expressjs.com/), [SQLite](https://sqlite.org/).

---

<div align="center">

If Walt is useful, [star it on GitHub](https://github.com/aayushman-singh/walt).

[![Star History Chart](https://api.star-history.com/svg?repos=aayushman-singh/walt&type=Date)](https://star-history.com/#aayushman-singh/walt&Date)

</div>
