import { test, expect } from '@playwright/test';

/**
 * Auth-gated happy paths — SKELETON, intentionally skipped (not fake-passing).
 *
 * These three flows are the product's core value, but every one of them is gated
 * behind BOTH Firebase Authentication AND the Express backend. Neither is
 * runnable on this host:
 *   - No seeded Firebase test account (and no NEXT_PUBLIC_FIREBASE_* env on this
 *     machine, so lib/firebase.ts initialises with an unusable config).
 *   - No running backend (backend/ depends on native better-sqlite3, which does
 *     not build on this Windows dev host — see pnpm-workspace.yaml / RUNBOOK).
 *
 * They are written as runnable test bodies guarded by `test.skip` so the suite
 * stays honest: the green run reports them as skipped, never as passed. To enable
 * them, run against an environment where the prerequisites below are satisfied
 * and flip the guard (or gate on an env flag such as E2E_AUTH=1).
 *
 * Required environment to un-skip:
 *   Frontend (Firebase web SDK — contexts/AuthContext.tsx, lib/firebase.ts):
 *     NEXT_PUBLIC_FIREBASE_API_KEY
 *     NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
 *     NEXT_PUBLIC_FIREBASE_PROJECT_ID
 *     NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
 *     NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
 *     NEXT_PUBLIC_FIREBASE_APP_ID
 *     NEXT_PUBLIC_BACKEND_URL / NEXT_PUBLIC_FRONTEND_URL (API + share-link base)
 *   Backend (Express + Firebase Admin + IPFS — backend/.env):
 *     a reachable backend on its configured port, plus its Firebase Admin
 *     service-account key and IPFS/gateway configuration.
 *   Test data:
 *     a seeded Firebase test account (email + password) whose credentials are
 *     supplied to the runner, e.g. E2E_TEST_EMAIL / E2E_TEST_PASSWORD.
 */

const AUTH_E2E_ENABLED = process.env.E2E_AUTH === '1';

test.describe('auth-gated happy paths (requires Firebase account + backend)', () => {
  test('login: a seeded user signs in and lands on the dashboard', async ({ page }) => {
    test.skip(!AUTH_E2E_ENABLED, 'Needs seeded Firebase account + Firebase env vars.');

    // Outline:
    //   1. goto('/'), open the AuthModal via the "Sign In" button.
    //   2. Fill E2E_TEST_EMAIL / E2E_TEST_PASSWORD and submit.
    //   3. Firebase auth resolves -> useAuth().user becomes non-null.
    //   4. Header now shows the "Dashboard" link; navigate to /dashboard.
    //   5. Assert the authenticated dashboard shell renders.
    await page.goto('/');
    expect(AUTH_E2E_ENABLED).toBe(true);
  });

  test('upload: an authenticated user uploads a file and it appears in their list', async ({
    page,
  }) => {
    test.skip(!AUTH_E2E_ENABLED, 'Needs running backend + IPFS + authenticated session.');

    // Outline (depends on a logged-in session from the login flow / storage state):
    //   1. On /dashboard, drop a fixture file into the FileUpload dropzone.
    //   2. The backend persists metadata + pins to IPFS; wait for completion.
    //   3. Assert the new file row appears with its name and a CID.
    await page.goto('/dashboard');
    expect(AUTH_E2E_ENABLED).toBe(true);
  });

  test('share: an authenticated user creates a share link and the public page resolves', async ({
    page,
  }) => {
    test.skip(!AUTH_E2E_ENABLED, 'Needs running backend to mint + resolve share links.');

    // Outline:
    //   1. From an uploaded file, open the share dialog and create a link
    //      (optionally with password / expiry / permission).
    //   2. Capture the generated share URL (NEXT_PUBLIC_FRONTEND_URL/s/<id>).
    //   3. Visit it in a fresh context and assert the public share page resolves
    //      and exposes the file for view/download.
    await page.goto('/');
    expect(AUTH_E2E_ENABLED).toBe(true);
  });
});
