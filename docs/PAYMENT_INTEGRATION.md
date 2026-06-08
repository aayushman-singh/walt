# Payment & Billing Integration

How `walt` meters storage usage and collects payment. Billing is **optional** — a self-hoster who never sets Cashfree credentials can run the whole app; only the payment-collection step fails (see [Self-hosting](#self-hosting)).

Source of truth for this document:
- `backend/billingUtils.js` — pure cost/period math
- `backend/paymentService.js` — Cashfree SDK wrapper
- `backend/server.js` — Express routes and persistence
- `lib/billingClient.ts`, `pages/dashboard.tsx` — frontend consumers (referenced for the warning/modal behaviour the backend implies)

## 1. Overview

Pricing is GB-based, computed from the sum of a user's **pinned, non-deleted** files (`server.js:1113-1117`):

- **Free tier:** 5 GB (`DEFAULT_FREE_TIER_GB`, override `FREE_TIER_GB`) — `billingUtils.js:15-20`
- **Cost above free tier:** $0.40 / GB / month (`DEFAULT_COST_PER_GB`, override `COST_PER_GB_USD`) — `billingUtils.js:29-34`
- **Billing cycle:** monthly, anchored to the user's account-creation day-of-month (`billingUtils.js:103-106`)

Payments are collected through **Cashfree** (`cashfree-pg` SDK), which is **India-only and charges in INR**. USD cost is converted at a **hardcoded rate of 83 INR/USD** (`USD_TO_INR`, `billingUtils.js:37`) and a minimum charge of ₹1 is enforced (`DEFAULT_MIN_CHARGE_INR`, override `MIN_CHARGE_INR`) — Cashfree rejects orders below ₹1.

## 2. Architecture

Frontend reads billing state and triggers checkout; the backend owns all cost math and order persistence; Cashfree handles the actual payment and notifies the backend twice — synchronously via the return URL (polled through `GET /api/payment/order/:orderId`) and asynchronously via the webhook.

```
                         GET /api/billing/status
                         GET /api/billing/check-access
   Frontend (dashboard) ─────────────────────────────►  Backend (server.js)
        │                                                      │  cost math: billingUtils.js
        │  POST /api/payment/create-order                      │  persist: orders / billing_info / subscriptions (SQLite)
        │ ─────────────────────────────────────────────►      │
        │                                                      │  paymentService.createOrder()
        │                                                      │ ──────────────► Cashfree PGCreateOrder
        │  ◄──── { paymentSessionId, paymentLink, ... } ───────┤
        │                                                      
        │  Cashfree-hosted / SDK checkout (user pays)          
        │ ───────────────────────────────────────────► Cashfree
        │                                                      │
        │  return_url ─► GET /api/payment/order/:orderId       │  (re-fetches live status, marks PAID)
        │                                                      │
        └──────────────────────────────────────────────┐      ▼
                                            Cashfree ──► POST /api/payment/webhook (notify_url)
                                                               (verify signature, mark PAID)
```

`return_url` and `notify_url` are set per-order from `FRONTEND_URL` / `BACKEND_URL` (`paymentService.js:77-78`, also passed explicitly from `server.js:1237-1238`).

## 3. Endpoints

All paths are prefixed at the app root. "Auth" = the `verifyAuth` middleware (Firebase ID token in `Authorization: Bearer <token>`).

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET  | `/api/billing/status` | Yes | Current usage + cost snapshot; lazily creates `billing_info` and `subscription` rows; auto-unblocks if it is no longer billing day. `server.js:1108` |
| GET  | `/api/billing/check-access` | Yes | Gate for file operations. Returns `allowed` plus a `reason` (`null`, `FREE_TIER_EXCEEDED`, or `BILLING_DAY_PAYMENT_REQUIRED`); flips `services_blocked` accordingly. `server.js:1430` |
| POST | `/api/payment/create-order` | Yes | Creates a Cashfree order for the current charge amount, persists it as `PENDING`. Body: `{ phone }` (optional; defaults to `"9999999999"`). 400 if within free tier. `server.js:1190` |
| GET  | `/api/payment/order/:orderId` | Yes | Looks up an order by internal UUID, then by `cashfree_order_id`; re-fetches live status from Cashfree; on `PAID` marks payment received + unblocks. `server.js:1285` |
| POST | `/api/payment/webhook` | No (signature-verified) | Cashfree server-to-server notification. Verifies signature, updates order, on `PAID`+`SUCCESS` marks payment received. `server.js:1358` |
| POST | `/api/billing/test-billing` | Yes | Dev/sandbox helper: creates a real Cashfree order for an arbitrary `userId`. Returns 403 when `CASHFREE_ENVIRONMENT=PRODUCTION` **and** `NODE_ENV=production`. Body: `{ userId, simulateDate }`. `server.js:1543` |

### Selected response shapes

`GET /api/billing/status` (`server.js:1169-1183`):
```json
{
  "pinnedSizeBytes": 0, "pinnedSizeGB": 0.0,
  "freeTierGB": 5, "costPerGB": 0.4,
  "monthlyCostUSD": 0.0, "exceedsLimit": false,
  "chargeAmountINR": 0.0, "freeTierLimitUSD": 2.0,
  "servicesBlocked": false, "paymentInfoReceived": false,
  "billingDay": 14, "nextBillingDate": "ISO-8601",
  "billingPeriod": { "start": "ISO-8601", "end": "ISO-8601" }
}
```

`POST /api/payment/create-order` (`server.js:1270-1278`):
```json
{
  "success": true,
  "orderId": "internal-uuid",
  "cashfreeOrderId": "order_...",
  "paymentSessionId": "...",
  "paymentLink": null,
  "amount": 1, "currency": "INR"
}
```
`paymentLink` is intentionally whatever Cashfree returns (or `null`) — the comment at `server.js:1246` notes hosted checkout links are deprecated for production and checkout should use `paymentSessionId`.

## 4. Billing calculation

All math lives in `billingUtils.js` and is stateless:

- `bytesToGB(bytes)` — `bytes / 1024^3` (`:42`)
- `calculateMonthlyPinCost(bytes)` — `0` if `sizeGB <= freeTierGB`, else `(sizeGB - freeTierGB) * costPerGB` USD (`:51-62`)
- `exceedsFreeTierLimit(bytes)` — `sizeGB > freeTierGB` (`:76-79`)
- `calculateChargeAmount(bytes)` — monthly USD → INR (`* 83`, rounded to 2 dp), then `max(rawINR, MIN_CHARGE_INR≥1)`; returns `0` when monthly cost is `0` (`:84-98`)
- `getBillingDay(createdAt)` — day-of-month of account creation, 1–31 (`:103-106`)
- `isBillingDay(billingDay)` — today's day-of-month equals `billingDay` (`:111-114`)
- `getNextBillingDate` / `getBillingPeriod` — derive the current/next period boundaries from `billingDay` (`:119-156`)

`getFreeTierLimitUSD()` (`:23-26`) is a legacy display value: `freeTierGB * costPerGB` (= $2.00 at defaults). It is **not** a real money threshold — gating is purely GB-based via `exceedsFreeTierLimit`. It is still returned in several responses under `freeTierLimitUSD`.

### Free tier, warnings, and the billing-day modal

The backend exposes the raw signals; the frontend (`pages/dashboard.tsx`) decides what UI to show.

Backend state machine for `GET /api/billing/check-access` (`server.js:1446-1536`):

| Condition | `allowed` | `reason` | `services_blocked` side effect |
|-----------|-----------|----------|--------------------------------|
| Within free tier | `true` | `null` | — |
| Over free tier, payment already on file | `true` | `null` | — |
| Over free tier, **not** billing day, no payment | `true` | `FREE_TIER_EXCEEDED` | cleared to `0` |
| Over free tier, **is** billing day, no payment | `false` | `BILLING_DAY_PAYMENT_REQUIRED` | set to `1` |

Frontend mapping (`dashboard.tsx:448-471`):
- **Mandatory payment modal** when `exceedsLimit && !paymentInfoReceived && (billingDayToday || servicesBlocked)` → `setShowPaymentModal(true)`. This cannot be dismissed away the way the warning can.
- **Dismissible warning banner** when `exceedsLimit && !billingDayToday` and not currently snoozed.
- **14-day snooze** is purely client-side: dismissing writes `Date.now() + 14d` to `localStorage["billing_warning_dismissed_until_<uid>"]` (`dashboard.tsx:141-142, 280-285, 459-470`). The backend has no record of dismissals.

## 5. Configuration

Billing/Cashfree env vars (`backend/env.example:47-65`). Names and purpose only — never commit values.

| Variable | Purpose |
|----------|---------|
| `CASHFREE_X_CLIENT_ID` | Cashfree API client ID (production unless a `_TEST` variant resolves first). |
| `CASHFREE_X_CLIENT_SECRET` | Cashfree API client secret. |
| `CASHFREE_ENVIRONMENT` | `SANDBOX` (default) or `PRODUCTION`; selects which credential set and Cashfree endpoint is used. |
| `FREE_TIER_GB` | Override free-tier size in GB (default 5). |
| `COST_PER_GB_USD` | Override cost per GB/month in USD (default 0.40). |
| `MIN_CHARGE_INR` | Minimum INR charge; floored at 1 regardless of value (default 1). |
| `FRONTEND_URL` | Base for the Cashfree `return_url` (payment callback page). |
| `BACKEND_URL` | Base for the Cashfree `notify_url` (webhook). |

Additional credential aliases read by `paymentService.js` but **not documented in `env.example`** (see Caveats): `X_ENVIRONMENT`, `CASHFREE_X_CLIENT_ID_TEST`, `X_CLIENT_ID_TEST`, `X_CLIENT_ID`, `CASHFREE_X_CLIENT_SECRET_TEST`, `X_CLIENT_SECRET_TEST`, `X_CLIENT_SECRET`. In `SANDBOX`, `_TEST` variants are preferred, then non-test variants (`paymentService.js:23-35`).

## 6. Webhook handling

`POST /api/payment/webhook` (`server.js:1358-1427`):

1. **Raw body** — registered before the JSON parser via `express.raw({ type: 'application/json' })` (`server.js:265`) and skipped by the global JSON middleware (`server.js:268-269`) so the exact bytes are available for signature verification.
2. **Signature verification** — requires headers `x-webhook-signature` and `x-webhook-timestamp`; missing either → `400`. Verification delegates to `cashfree.PGVerifyWebhookSignature(signature, rawBody, timestamp)` (`paymentService.js:154-165`); failure → `401`.
3. **Order lookup** — by `cashfree_order_id`; unknown order → `404`.
4. **Update** — always updates `orders.order_status`. Only when `orderStatus === 'PAID' && paymentStatus === 'SUCCESS'` does it set `billing_info.payment_method_added = 1`, `services_blocked = 0`, and advance `subscriptions.next_billing_at`.

**Idempotency:** there is no explicit idempotency key or processed-event ledger. Re-delivery is safe in practice only because the updates are idempotent writes (set flags to fixed values, recompute next billing date from `billingDay`). It is not protected against out-of-order or stale events — a late non-`PAID` webhook would overwrite `order_status` (see Caveats).

## 7. Self-hosting

Billing is optional. The cost-math functions in `billingUtils.js` have no external dependency and always work, but **payment collection requires Cashfree credentials**.

What happens when Cashfree creds are absent:
- `paymentService.js` resolves `xClientId` / `xClientSecret` to empty strings and still constructs the `Cashfree` instance at import time (`paymentService.js:30-54`). The server **starts** — it logs the masked (empty) credentials.
- The first real call (`PGCreateOrder` / `PGFetchOrder` / `PGVerifyWebhookSignature`) fails. `createOrder` catches and returns `{ success: false, error }`, so `POST /api/payment/create-order` responds `500` with the Cashfree error message. No silent fallback or fake order is created.
- `GET /api/billing/status` and `GET /api/billing/check-access` keep working (pure math + SQLite), so a self-hoster can disable billing simply by leaving `exceedsLimit` unreachable — e.g. raise `FREE_TIER_GB` above any realistic usage — without touching Cashfree at all.

There is no single `BILLING_ENABLED` flag; "disabled" means "credentials absent and/or free tier set high enough that no charge is ever produced."

## Caveats

- **Hardcoded FX rate.** `USD_TO_INR = 83` is a constant (`billingUtils.js:37`); the comment admits it "should use real-time rates in production." Charged amounts drift from true USD cost as the exchange rate moves.
- **Webhook payload field names are assumed, not verified against the SDK.** The handler destructures `{ orderId, orderStatus, paymentStatus }` from the parsed body (`server.js:1373`). Cashfree's documented webhook schema nests data under `data.order` / `data.payment` with snake_case keys. If the live payload doesn't have top-level camelCase fields, `orderId` is `undefined`, the order lookup 404s, and **no billing update occurs even on a successful payment**. This should be confirmed against the actual Cashfree webhook contract.
- **No webhook idempotency/ordering guard.** Any webhook (including a later `EXPIRED`/`FAILED` redelivery) unconditionally overwrites `orders.order_status` (`server.js:1383-1386`). A stale or out-of-order event can regress a `PAID` order's status. There is no processed-event table.
- **`order_status` text is provider-driven and inconsistent across paths.** The webhook stores whatever `orderStatus` Cashfree sends; `GET /api/payment/order/:orderId` stores `cashfreeResult.data?.order_status`. Code paths key off the literal string `'PAID'` — any casing/value mismatch silently skips the billing update.
- **Credential alias sprawl.** Up to four env-var spellings per credential are accepted (`paymentService.js:30-35`) but only `CASHFREE_X_CLIENT_ID/SECRET` are in `env.example`. The undocumented aliases (`X_CLIENT_ID`, `X_ENVIRONMENT`, `*_TEST`, etc.) make misconfiguration easy to miss.
- **Empty credentials don't fail fast.** The Cashfree instance is built with empty strings rather than refusing to start (`paymentService.js:54`), so a misconfigured production server appears healthy until the first payment attempt fails at runtime.
- **`paymentInfoReceived` is sticky.** Once a single payment succeeds, `payment_method_added` is set to `1` and never reset; subsequent billing days find `paymentInfoReceived === true` and never re-block or re-charge (`check-access`, `server.js:1504-1515`). There is no recurring-charge mechanism — only the first payment is ever collected.
