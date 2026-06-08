# Walt — Architecture

> Status: reflects the codebase as of the Phase B refactor (composed storage hook + modular Express backend). Where the doc marks a feature **planned**, the code does not implement it yet.

## 1. System overview

Walt is a self-hostable, content-addressed file store with a Google-Drive-style UX. It splits the problem into three substrates, each owning exactly one concern: **IPFS (Kubo)** holds the actual bytes — file content and the user's serialized file-list JSON — addressed by CID; **Firestore** holds a single durable pointer per user (`fileListUri`, the CID of the latest file-list) plus an optional searchable per-file index; **SQLite** (backend-side) holds authoritative server metadata — users, files, folders, shares, activity, billing — and backs quota enforcement and pinning bookkeeping. The censorship-resistance thesis: file *content* is decentralized and portable (any IPFS gateway can serve a CID; the file-list itself is an IPFS object, so a user's entire library survives a Firebase outage and can be re-hydrated from the CID alone). Firestore and SQLite are indexes/accelerators, not the source of truth for content. The trade-off this buys — and pays for — is a dual write model: the backend writes SQLite on upload, while the client writes the IPFS file-list; the loader reconciles the two (see §7).

## 2. Component map

Nodes and the directed relations (data + transformation) between them.

```
┌──────────────────────────── Vercel ────────────────────────────┐
│  Next.js Pages Router (frontend + serverless API routes)        │
│                                                                 │
│  pages/dashboard.tsx (view)                                     │
│        │ consumes                                               │
│        ▼                                                        │
│  components/dashboard/hooks/useDashboardController.ts           │
│        │ composes domain hooks (useUpload, useFileOperations,   │
│        │  useSearch, useBilling, useShareTags, useVersion…)     │
│        ▼                                                        │
│  hooks/useUserFileStorage.ts  ── composes ──▶ hooks/storage/*   │
│        │ (persistence, pinning, folders, trash, fileViews,      │
│        │  sharing, tags, customProperties, fileCrud)            │
│        ├── lib/backendClient.ts ─────────────┐                  │
│        ├── lib/firebase.ts (Web SDK) ──┐     │                  │
│        └── lib/gatewayOptimizer.ts     │     │                  │
│                                        │     │                  │
│  pages/api/* (firebase-admin) ─────────┼─────┼──┐               │
└────────────────────────────────────────┼─────┼──┼──────────────┘
                                          │     │  │
                          Firestore ◀─────┘     │  │ (admin reads/writes
                          + Firebase Auth       │  │  fileListUri,
                                ▲               │  │  notifications)
                                │ verifyIdToken │  ▼
                                │               │ Firebase Auth / Firestore
┌──────────── self-hosted (Docker) ────────────▼──────────────────┐
│  Express backend (backend/server.js)                            │
│    routes/{ipfs,files,folders,user,shares,billing,payments}.js  │
│    middleware/auth.js  (firebase-admin verifyAuth)              │
│    db.js (better-sqlite3)        ipfs.js (ipfs-http-client)     │
│         │                              │                         │
│         ▼                              ▼                         │
│      SQLite (WAL)                Kubo IPFS node (HTTP API :5001) │
└─────────────────────────────────────────────────────────────────┘
```

### Frontend (Next.js Pages Router, on Vercel)

| Node | Responsibility | Key inbound → outbound relations |
| --- | --- | --- |
| `pages/dashboard.tsx` | Thin view. Renders the dashboard tree (`components/dashboard/*`). | Consumes `useDashboardController` → JSX. |
| `components/dashboard/hooks/useDashboardController.ts` | Owns all page-level UI state and composes every dashboard domain hook. | Calls `useUserFileStorage` + domain hooks → returns a flat props bag to the view. |
| `components/dashboard/hooks/useUpload.ts` | Upload orchestration: dropzone, large-file confirmation, duplicate resolution, backend upload + simulated progress. | `File[]` → `BackendFileAPI.upload` → `UploadedFile[]` → `addFiles`. |
| `hooks/useUserFileStorage.ts` | Public storage entry point. Owns shared state (`uploadedFiles`, `loading`, `error`, `fileVersions`) and `addActivityLog`; composes the `hooks/storage/*` domain hooks and spreads their returns into one stable API. | Wires sub-hooks via shared setters + `saveUserFiles`. |
| `hooks/storage/useFilePersistence.ts` | The IPFS↔Firestore bridge: `loadUserFiles`, `saveUserFiles`, `syncFilesToFirestore`, `fetchFromIPFS`. | Firestore `fileListUri` → `fetchFromIPFS` → state; state → `BackendFileAPI.addToIPFS` → Firestore `fileListUri`. |
| `hooks/storage/{usePinning,useFolders,useTrash,useFileViews,useSharing,useTags,useCustomProperties,useFileCrud}.ts` | One domain each. All mutate shared `uploadedFiles` and persist via `saveUserFiles`. | Domain op → state mutation → `saveUserFiles`. |
| `lib/backendClient.ts` | Typed client for the Express backend (`BackendFileAPI`, `BackendFolderAPI`, `BackendUserAPI`, `BackendShareAPI`, `BackendIPFSAPI`). Attaches `Authorization: Bearer <idToken>`. | App calls → HTTPS REST → backend. |
| `lib/gatewayOptimizer.ts` | Singleton that ranks IPFS gateways by EMA response time + success rate, persists stats to `localStorage`, runs 5-min health checks (browser only). | Records success/failure per fetch → ranked gateway list. |
| `lib/firebase.ts` | Firebase Web SDK init: `auth` (Google OAuth, sessions) + `db` (client Firestore). | Client reads/writes `users/{uid}` + per-file index. |

### Next.js API routes (`pages/api/*`, firebase-admin)

Serverless functions on Vercel that authenticate with `lib/apiAuth.ts` (`verifyAuthToken`) and talk to Firestore via the Admin SDK. They are a **second, parallel** auth/data surface to the Express backend — used for the Firestore-side concerns the browser shouldn't do with elevated rights.

| Route | Responsibility |
| --- | --- |
| `pages/api/files/index.ts` | GET returns `users/{uid}.fileListUri`; POST sets it (merge). |
| `pages/api/files/[id].ts`, `pages/api/files/[id]/pin.ts` | Per-file metadata / pin toggles. |
| `pages/api/ipfs/{upload,download,list,status}.ts` | Next.js-side IPFS proxies (alternative path to the Express `/api/ipfs/*`). |
| `pages/api/notifications/index.ts` | CRUD over `users/{uid}/notifications/*` (admin Firestore). |
| `pages/api/share/[id].ts` | Public share lookup. **Stub** — returns placeholder JSON, does not yet fetch from IPFS. |
| `pages/api/two-factor/*`, `pages/api/versions/[fileId].ts`, `pages/api/guest/upload.ts` | 2FA setup/verify/disable, version history, unauthenticated guest upload. |

### Express backend (self-hosted, `backend/`)

`server.js` loads `.env`, then side-effect-imports `db.js` (schema init), `middleware/auth.js` (firebase-admin init), `ipfs.js` (Kubo client), and mounts seven routers. CORS is delegated to nginx in production. The `/api/payment/webhook` route gets a raw body parser for signature verification; everything else gets `express.json()`.

| Node | Responsibility | Relations |
| --- | --- | --- |
| `routes/ipfs.js` | `POST /api/ipfs/upload` (multer → `ipfs.add` → SQLite insert + quota update + activity log), `/upload/guest` (unpinned, 200 MB cap, no auth), `POST /api/ipfs/add` (raw JSON → IPFS, used for the file-list), `GET /list`, `GET /download` (streams `ipfs.cat`), `GET /status`, `POST /pin`, `DELETE /pin/:cid` (reference-counted pin/unpin across user rows). | `multipart` → Kubo → SQLite. |
| `routes/{files,folders,user,shares,billing,payments}.js` | File/folder metadata CRUD, profile + storage stats, share tokens, billing info, Cashfree payment/webhook flow. | SQLite (+ Firestore for share/billing reads). |
| `middleware/auth.js` | `verifyAuth` Express middleware: extracts Bearer token, `firebaseAuth.verifyIdToken`, attaches `req.user`. Exports the shared `firestore` + `firebaseAuth` admin handles. | ID token → decoded claims. Returns 503 if admin not configured (no silent fallback). |
| `db.js` | `better-sqlite3`, `foreign_keys=ON`, `journal_mode=WAL`. Owns schema init, `getOrCreateUser`, `rowToObject` (int→bool, metadata JSON parse), short-code generation. | SQL. |
| `ipfs.js` | `ipfs-http-client` to `IPFS_API_URL` (default `http://127.0.0.1:5001`) + multer (`dest: /tmp`). | HTTP → Kubo. |

### Firebase (managed)

- **Auth** — Google OAuth + session management via the Web SDK. Issues short-lived ID tokens.
- **Firestore** — `users/{uid}` (the `fileListUri` pointer + prefs), `users/{uid}/files/{id}` (search index), `users/{uid}/notifications/{id}`. Read/written from both the client SDK and the two admin surfaces (Next.js API routes, Express backend).

## 3. Upload path (end to end)

```mermaid
sequenceDiagram
    actor User
    participant View as dashboard.tsx
    participant Upload as useUpload
    participant Client as BackendFileAPI
    participant API as Express POST /api/ipfs/upload
    participant Multer as multer (/tmp)
    participant Kubo as Kubo (ipfs.add)
    participant SQLite as SQLite (files)
    participant Persist as useFilePersistence.saveUserFiles
    participant Add as Express POST /api/ipfs/add
    participant FS as Firestore users/{uid}

    User->>View: pick / drop file(s)
    View->>Upload: onDrop(File[])
    Note over Upload: large-file confirm + duplicate resolution<br/>then checkBillingAccess()
    Upload->>Client: upload(file, idToken, {folderId, isPinned})
    Note over Client,API: PLANNED (Phase D): client-side AES-GCM<br/>encrypt(file) BEFORE multipart send;<br/>only ciphertext leaves the browser
    Client->>API: POST multipart/form-data + Bearer idToken
    API->>API: verifyAuth → getOrCreateUser → quota check
    API->>Multer: parse multipart → temp file
    Multer-->>API: req.file (path, size, mimetype)
    API->>Kubo: ipfs.add(buffer, {pin: autoPin})
    Kubo-->>API: { cid, size }
    API->>SQLite: INSERT files(...) + UPDATE storage_used + activity_log
    API-->>Client: { success, file: { id, cid, size, mimeType, isPinned } }
    Client-->>Upload: file metadata
    Upload->>View: addFiles(UploadedFile[]) → uploadedFiles updated
    Upload->>Persist: addFiles triggers saveUserFiles(files)
    Persist->>Add: addToIPFS(JSON.stringify(fileList), idToken, pin=false)
    Add->>Kubo: ipfs.add(fileListJson)
    Kubo-->>Add: { cid }
    Add-->>Persist: { ipfsUri: ipfs://<cid> }
    Persist->>FS: setDoc({ fileListUri }, {merge:true})
    Persist->>FS: syncFilesToFirestore (per-file index, batched)
```

The AES-GCM step is **planned (Phase D)** — there is no encryption in the current code; bytes are sent and stored in plaintext.

## 4. Download / read path

```mermaid
sequenceDiagram
    actor User
    participant View as dashboard.tsx
    participant Persist as useFilePersistence.loadUserFiles
    participant FS as Firestore users/{uid}
    participant Fetch as fetchFromIPFS
    participant Opt as gatewayOptimizer
    participant GW as IPFS gateway

    User->>View: open dashboard
    View->>Persist: loadUserFiles()
    Persist->>FS: getDoc(users/{uid}) → fileListUri (CID)
    FS-->>Persist: fileListUri = ipfs://<cid>
    Persist->>Opt: getRankedGateways()
    Opt-->>Persist: gateways sorted by successRate, then EMA latency
    loop each gateway until first 2xx (8s AbortController timeout, 2 retries)
        Persist->>Fetch: fetch(gateway + cid)
        Fetch->>GW: GET <gateway>/<cid>
        GW-->>Fetch: file-list JSON | error/timeout
        Fetch->>Opt: recordSuccess(ms) | recordFailure()
    end
    Note over Persist: PLANNED: AES-GCM decrypt(fileList / file bytes)<br/>here, after fetch, before parse/render
    Persist->>Persist: JSON.parse → verify userId → merge backend list
    Persist->>View: setUploadedFiles → render grid/list
```

Notes from `fetchFromIPFS`: a user-configured gateway (`NEXT_PUBLIC_IPFS_GATEWAY`) is prepended ahead of the public list (`ipfs.io`, `dweb.link`, `cloudflare-ipfs.com`, `gateway.pinata.cloud`). 4xx and DNS/`Failed to fetch` errors break out immediately (no pointless retry); transient errors back off 1s/2s. Per-file *binary* download additionally has a backend path: `GET /api/ipfs/download?cid|fileId` streams `ipfs.cat` from the user's own Kubo node and logs a `download` activity row. Decryption is **planned**, not implemented.

## 5. Data model

### SQLite (`backend/db.js`)

| Table | Columns |
| --- | --- |
| `users` | `id` (PK), `firebase_uid` (UNIQUE), `email`, `display_name`, `storage_used` (default 0), `storage_limit` (default 10 GiB), `created_at`, `updated_at` |
| `folders` | `id` (PK), `user_id` (FK→users), `name`, `parent_folder_id` (FK→folders), `is_starred`, `is_deleted`, `deleted_at`, `created_at`, `updated_at` |
| `files` | `id` (PK), `user_id` (FK), `cid`, `filename`, `original_filename`, `size`, `mime_type`, `parent_folder_id` (FK→folders), `is_pinned`, `pin_service`, `pin_status`, `is_starred`, `is_deleted`, `deleted_at`, `last_accessed_at`, `created_at`, `updated_at` |
| `shares` | `id` (PK), `file_id` (FK), `folder_id` (FK), `user_id` (FK), `share_token` (UNIQUE), `permission_level` (default `viewer`), `password_hash`, `expires_at`, `max_downloads`, `download_count`, `access_count`, `is_active`, `created_at`, `last_accessed_at` |
| `activity_logs` | `id` (PK), `user_id` (FK), `file_id` (FK), `folder_id` (FK), `action`, `ip_address`, `user_agent`, `metadata` (JSON text), `created_at` |
| `billing_info` | `id` (PK), `user_id` (FK), `payment_method_added`, `payment_info_received_at`, `services_blocked`, `created_at`, `updated_at` |
| `orders` | `id` (PK), `user_id` (FK), `cashfree_order_id` (UNIQUE), `order_amount`, `order_currency` (default INR), `order_status` (default PENDING), `payment_session_id`, `payment_link`, `billing_period_start`, `billing_period_end`, `created_at`, `updated_at` |
| `subscriptions` | `id` (PK), `user_id` (FK), `billing_day`, `last_billed_at`, `next_billing_at`, `is_active`, `created_at`, `updated_at` |
| `short_links` | `id` (PK), `short_code` (UNIQUE), `file_id` (FK), `folder_id` (FK), `user_id` (FK), `share_id` (FK→shares), `created_at`, `updated_at`, `access_count`, `last_accessed_at` |

Booleans are stored as integers and rehydrated by `rowToObject`. WAL mode is enabled for write concurrency.

### Firestore

| Document | Shape |
| --- | --- |
| `users/{uid}` | `{ fileListUri: "ipfs://<cid>", lastUpdated, userId, autoPinEnabled? }` — the durable pointer to the latest file-list CID + the auto-pin preference. |
| `users/{uid}/files/{id}` | Per-file search/filter index (optional accelerator), written by `syncFilesToFirestore`: `id, name, ipfsUri, gatewayUrl, timestamp, type, size, isPinned, pinService, pinDate, pinExpiry, parentFolderId, isFolder, starred, trashed, trashedDate, lastAccessed, modifiedDate, userId, lastSynced`. |
| `users/{uid}/notifications/{id}` | `{ type, title, message, timestamp, read, userId, relatedFileId?, relatedShareId?, actionUrl?, metadata?, createdAt, readAt? }`. |

### IPFS objects

| Object | Shape |
| --- | --- |
| File content | Raw bytes from `ipfs.add` during upload; addressed by `cid`. |
| File-list (`UserFileList`) | `{ files: UploadedFile[], lastUpdated: number, userId: string }` — JSON, added via `POST /api/ipfs/add` with `pin: false`. Each new save produces a **new CID**; the Firestore `fileListUri` is repointed. Old CIDs remain resolvable (immutable history). The `UploadedFile` shape (`hooks/storage/types.ts`) carries name, `ipfsUri`, `gatewayUrl`, type/size, pin metadata, folder/org flags, `shareConfig`, `activityLog`, `tags`, `customProperties`. |

## 6. Auth flow

1. Browser authenticates with the **Firebase Web SDK** (`lib/firebase.ts`, Google OAuth). Firebase issues a short-lived **ID token**.
2. Hooks obtain it lazily via `user.getIdToken()` (wired through `useDashboardController` into `useUserFileStorage(getAuthToken)`).
3. **Express backend**: every authed route runs `verifyAuth` (`backend/middleware/auth.js`) → `firebaseAuth.verifyIdToken(token)` → `req.user = decodedToken`. Missing/invalid token → 401; admin SDK unconfigured → **503** (explicit failure, no degraded mode).
4. **Next.js API routes**: `lib/apiAuth.ts → verifyAuthToken(req)` does the same admin-side verification and returns `{ uid, email }` or `null` → 401.
5. The decoded `uid`/`email`/`name` drive `getOrCreateUser` in SQLite, so a Firebase identity maps to exactly one backend user row.

Two independent verifiers exist (Express + Next.js API), both rooted in the same firebase-admin service account.

## 7. Key design decisions & trade-offs

- **Hybrid IPFS + Firestore + SQLite.** Each substrate does one thing: IPFS = portable content + portable file-list (survivability/censorship-resistance), Firestore = one durable CID pointer + fast index (no IPFS round-trip to find "where is my library"), SQLite = authoritative server metadata for quota, pinning ref-counts, shares, billing. Trade-off: more moving parts and **two write models**. On upload the backend writes SQLite; separately the client writes the IPFS file-list and repoints Firestore. These can diverge (e.g. upload succeeds, file-list save fails). `loadUserFiles` papers over divergence by **merging** the backend `list()` into the IPFS file-list — any backend file/folder absent from the file-list is appended and the merged list is re-saved. This is a real seam: the loader is the reconciliation point, and it intentionally treats the backend list as best-effort (logs and continues if it fails) rather than failing the whole load.
- **Gateway resilience.** Public IPFS gateways are unreliable, so reads never trust one gateway. `gatewayOptimizer` ranks by success rate then EMA latency, persists stats in `localStorage`, health-checks every 5 min, and `fetchFromIPFS` walks the ranked list with an 8s timeout and short retry backoff, short-circuiting on 4xx/DNS. A user's own gateway can be prepended via env. This is an *explicit, user-requested* multi-gateway behaviour, not a silent failure-hider — every failure is recorded and influences future ranking.
- **Optional billing.** Cashfree orders/subscriptions/billing_info live in SQLite and a dedicated `payments` router with a raw-body webhook for signature verification. Self-hosters can ignore it entirely (`storage_limit` defaults to 10 GiB and quota is enforced in `/api/ipfs/upload`).
- **Composition-hook pattern (Phase B).** `useUserFileStorage` was decomposed into focused `hooks/storage/*` domains; the public hook now owns only shared state + `addActivityLog` + persistence and spreads sub-hook returns so the external API is byte-for-byte unchanged. A deliberate wrinkle: persistence is composed *before* pinning (it needs `saveUserFiles`) yet the loader must hand the persisted `autoPinEnabled` to pinning — broken via a `setAutoPinEnabledRef` ref. The dashboard mirrors this: `useDashboardController` composes ~12 domain hooks and returns a flat bag to a thin `dashboard.tsx` view. Trade-off: a lot of prop-drilling between hooks (shared `uploadedFiles`/`setUploadedFiles`/`saveUserFiles` passed everywhere) in exchange for single-responsibility, testable domains.
- **Known stubs / honesty.** `pages/api/share/[id].ts` is a placeholder (returns canned JSON, no IPFS fetch). Client-side encryption is on the roadmap but **not implemented** — content is stored in plaintext on IPFS today.

## 8. Deployment topology

| Tier | What runs | Notes |
| --- | --- | --- |
| **Vercel** | Next.js frontend + `pages/api/*` serverless functions | Public app at `walt.aayushman.dev`. API routes use firebase-admin (`FIREBASE_SERVICE_ACCOUNT` or `FIREBASE_PROJECT_ID`/`CLIENT_EMAIL`/`PRIVATE_KEY`). Backend base URL via `NEXT_PUBLIC_BACKEND_API_URL` (default `https://api-walt.aayushman.dev`). |
| **Self-hosted backend + Kubo** | Express (`backend/server.js`, port 3001) + a Kubo IPFS node (HTTP API on `:5001`, via `IPFS_API_URL`) | Backend talks to Kubo over `ipfs-http-client`; SQLite file at `DATABASE_URL` (default `./data/ipfs-drive.db`). CORS handled by nginx in front. README/SELF_HOSTING describe Docker Compose for Kubo + backend. |
| **Firebase** | Auth + Firestore (managed) | One service account shared by both admin surfaces. |

> **Self-hosting reference:** `SELF_HOSTING.md` (repo root). The README also links a `RUNBOOK.md`; that file is **not currently present in the repo** — `SELF_HOSTING.md` is the authoritative self-host guide today. Env templates: `.env.example` (frontend) and `backend/env.example` (backend). Note: the README's `docker-compose.yml` reference is likewise **not tracked in the repo** at the time of writing; treat the compose snippets in the README/SELF_HOSTING docs as the spec, not a committed file.
