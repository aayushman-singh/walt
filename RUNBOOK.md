# Walt Backend Self-Hosting Runbook

Operator guide for running the Walt backend + IPFS node with Docker Compose.

The Next.js **frontend is already hosted on Vercel** at https://walt.aayushman.dev.
Only the **backend** (Express API) and an **IPFS (Kubo) node** need self-hosting.
This stack cannot run keyless — it requires Firebase Admin credentials.

---

## 1. Prerequisites

- Docker Engine 24+ and the Docker Compose plugin (`docker compose version`).
- A Firebase project with a downloaded Admin SDK service-account private key
  (Firebase Console -> Project Settings -> Service Accounts -> Generate New Private Key).
- (Optional) A Cashfree merchant account if you want billing
  (https://merchant.cashfree.com/). Skip entirely to run without billing.
- A reverse proxy with TLS (nginx, Caddy, Traefik, ...) if you expose the API publicly.
  The backend and IPFS gateway are bound to loopback by default — see Security.

---

## 2. First-time setup (step by step)

### 2.1 Clone

```bash
git clone https://github.com/aayushman-singh/walt.git
cd walt
```

### 2.2 Create and fill the backend env file

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and fill in real values. At minimum, set the Firebase credentials
(Section 5). `IPFS_API_URL`, `DATABASE_URL`, `PORT`, and `NODE_ENV` are already forced
to the correct compose values in `docker-compose.yml`, so you mainly need:

- Firebase: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
  (or the single `FIREBASE_SERVICE_ACCOUNT` JSON).
- `BACKEND_URL` — the public HTTPS URL your reverse proxy serves the API on.
- `FRONTEND_URL` — `https://walt.aayushman.dev` (or your own frontend URL).
- Cashfree vars only if you enable billing.

### 2.3 Provide Firebase credentials

Important: `backend/middleware/auth.js` loads Firebase credentials from
**environment variables only** — it does NOT read a credential file from disk.
There are two supported shapes (pick one):

- **Trio (recommended):** copy `project_id`, `client_email`, and `private_key` out of
  the downloaded JSON into `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and
  `FIREBASE_PRIVATE_KEY`. For the private key, put it on one line with literal `\n`
  for line breaks, wrapped in double quotes — the code converts `\n` to real newlines.

- **Inline JSON:** paste the entire downloaded JSON as a single-line value of
  `FIREBASE_SERVICE_ACCOUNT`. This takes priority over the trio.

> The `docker-compose.yml` contains a commented-out read-only mount for a
> `firebase-service-account.json`. It is OFF by default because the application code
> does not read a file path. Only uncomment it if you have your own mechanism to load
> `FIREBASE_SERVICE_ACCOUNT` from that file; otherwise leave it commented and use env.

### 2.4 Bring the stack up

```bash
docker compose up -d --build
```

This builds the backend image (compiling the native `better-sqlite3` module on Linux),
starts the Kubo IPFS node, waits for it to be healthy, then starts the backend.

### 2.5 Verify health

The real health endpoint (from `backend/server.js`) is `GET /health`:

```bash
curl http://127.0.0.1:3001/health
# -> {"status":"ok","timestamp":"2026-..."}
```

Check the IPFS node:

```bash
docker compose exec ipfs ipfs id
docker compose exec ipfs ipfs version
```

Confirm Firebase initialized (look for "Firebase Admin initialized successfully"):

```bash
docker compose logs backend | grep -i firebase
```

### 2.6 Point the frontend at your backend

The frontend is on Vercel. In the Vercel project's Environment Variables, set the
backend/gateway URLs to your self-hosted host, then redeploy:

```
NEXT_PUBLIC_BACKEND_API_URL=https://your-backend-host.example.com
NEXT_PUBLIC_IPFS_GATEWAY=https://your-backend-host.example.com/ipfs
```

The frontend's Firebase web config (`NEXT_PUBLIC_FIREBASE_*`) must belong to the SAME
Firebase project as the backend's Admin credentials, or token verification will fail:

```
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<project>.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=<project>
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=<project>.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

---

## 3. Templated secrets — what to set and where to get it

All of these live in `backend/.env` (gitignored). Nothing real is committed.

| Secret / value | Required? | Where to get it |
| --- | --- | --- |
| `FIREBASE_PROJECT_ID` | Yes | Firebase Console -> Project Settings -> General |
| `FIREBASE_CLIENT_EMAIL` | Yes | `client_email` in the service-account JSON |
| `FIREBASE_PRIVATE_KEY` | Yes | `private_key` in the service-account JSON (escape newlines as `\n`) |
| `FIREBASE_SERVICE_ACCOUNT` | Alt. to trio | The whole service-account JSON, one line |
| `BACKEND_URL` | Yes (for share/webhook URLs) | Your public API hostname |
| `FRONTEND_URL` | Yes | `https://walt.aayushman.dev` or your frontend URL |
| `CASHFREE_X_CLIENT_ID` / `CASHFREE_X_CLIENT_SECRET` | Only if billing | Cashfree dashboard -> Developers -> API Keys |
| `CASHFREE_ENVIRONMENT` | Only if billing | `SANDBOX` to test, `PRODUCTION` for live |
| `FREE_TIER_GB`, `COST_PER_GB_USD`, `MIN_CHARGE_INR` | Optional | Your pricing policy |

If billing is enabled, set the Cashfree webhook URL in the Cashfree dashboard to:
`<BACKEND_URL>/api/payment/webhook` (the backend reads this route's raw body to verify
the signature).

---

## 4. Operations

### 4.1 Logs (pino)

The backend logs JSON via pino (`NODE_ENV=production` => structured JSON).

```bash
docker compose logs -f backend
docker compose logs -f ipfs
# Pretty-print backend JSON logs if you have pino-pretty / jq locally:
docker compose logs --no-log-prefix backend | npx pino-pretty
```

Adjust verbosity with `LOG_LEVEL` in `backend/.env` (e.g. `debug`), then
`docker compose up -d backend`.

### 4.2 Backups

Two things hold all state: the SQLite database volume (`backend_data`) and the IPFS
repo volume (`ipfs_data`). Back up BOTH.

SQLite is in WAL mode (`.db`, `.db-wal`, `.db-shm`). Quiesce writes for a clean copy:

```bash
# Stop the backend so no writes are in flight (IPFS can keep running).
docker compose stop backend

# Back up the SQLite database volume.
docker run --rm -v walt_backend_data:/data -v "$PWD":/backup alpine \
  tar czf /backup/walt-db-$(date +%Y%m%d-%H%M%S).tar.gz -C /data .

# Back up the IPFS repo (pins + blocks).
docker run --rm -v walt_ipfs_data:/data -v "$PWD":/backup alpine \
  tar czf /backup/walt-ipfs-$(date +%Y%m%d-%H%M%S).tar.gz -C /data .

docker compose start backend
```

> Volume names are prefixed with the compose project name (the directory, `walt`),
> giving `walt_backend_data` and `walt_ipfs_data`. Confirm with `docker volume ls`.

Restore: stop the stack, `tar xzf ...` back into the volume with the same
`docker run --rm -v <volume>:/data ...` pattern, then `docker compose up -d`.

### 4.3 Pinning persistence

Pins live in the `ipfs_data` volume. They survive `docker compose restart`,
`stop/start`, and `up -d` as long as the named volume is not deleted. Do NOT run
`docker compose down -v` unless you intend to wipe pinned content — `-v` deletes the
volumes. A plain `docker compose down` keeps them.

### 4.4 Updating / redeploying

```bash
git pull
docker compose up -d --build
```

This rebuilds changed images and recreates containers; named volumes (DB + IPFS repo)
are preserved.

### 4.5 Restart policy

Both services use `restart: unless-stopped`: they come back after crashes and host
reboots, but stay down if you explicitly `docker compose stop` them.

---

## 5. Troubleshooting

### better-sqlite3 build issues
`better-sqlite3` is a native module compiled during `docker build`. The Dockerfile's
build stage installs `python3`, `make`, and `g++` for this. If the build fails:
- Ensure you build on a Linux Docker host (the image targets Linux glibc).
- Force a clean rebuild: `docker compose build --no-cache backend`.
- Building on Windows/macOS via Docker Desktop is fine — compilation happens inside
  the Linux build container, not on your host.

### Authenticated routes return 503 / "Authentication service unavailable"
This is the intended fail-loud behavior when Firebase Admin is not initialized.
- Check `docker compose logs backend | grep -i firebase`. A warning listing
  `FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY` as MISSING means creds aren't loaded.
- The most common cause is a malformed `FIREBASE_PRIVATE_KEY` — it must be quoted and
  use `\n` for newlines. Re-copy it from the JSON.
- After fixing `backend/.env`: `docker compose up -d backend`.

### IPFS connection refused / backend can't reach the node
- `IPFS_API_URL` must be `http://ipfs:5001` (the compose service name), which
  `docker-compose.yml` sets. Do not point it at `127.0.0.1` from inside the backend
  container.
- Confirm the node is healthy: `docker compose ps` (ipfs should be "healthy") and
  `docker compose exec ipfs ipfs id`.
- The backend waits for the IPFS healthcheck before starting (`depends_on`).

### CORS errors in the browser
The backend does not apply CORS itself (see the comment in `server.js`: CORS is handled
by the reverse proxy). Configure allowed origins (e.g. `https://walt.aayushman.dev`) at
your nginx/Caddy/Traefik layer. Setting `ALLOWED_ORIGINS` in `.env` has no effect.

### Health check fails but container is up
`curl http://127.0.0.1:3001/health` from the host. If it hangs, the backend likely
exited during boot — check `docker compose logs backend` for the stack trace.

---

## 6. Security notes

- **Never expose the Kubo API port (5001) publicly.** It grants full admin control of
  the node (add/remove pins, read config, shut down). `docker-compose.yml` deliberately
  does NOT publish 5001 to the host — only the backend reaches it over the internal
  Docker network. Do not add a `5001:5001` mapping.
- The backend (3001) and IPFS gateway (8080) are bound to `127.0.0.1` by default. Put a
  TLS-terminating reverse proxy in front before serving them to the internet.
- Keep `backend/.env` and any Firebase service-account JSON out of git. `.env` and
  `backend/.env` are already in `.gitignore`. Service-account JSONs are NOT covered by a
  generic rule — only one specific historical filename is ignored. If you place a JSON
  on disk (e.g. `backend/firebase-service-account.json`), add a matching line to
  `.gitignore` first (a `*firebase-adminsdk*.json` / `backend/*.json` pattern), and
  always verify with `git status` before committing.
- The IPFS swarm port (4001/tcp+udp) is meant to be reachable by peers; that is expected
  and safe to expose.
```
