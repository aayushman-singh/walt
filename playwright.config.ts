import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E config — PUBLIC SURFACE ONLY.
 *
 * This host has no running Express backend and no Firebase test account, so the
 * auth-gated dashboard/upload/share flows cannot be exercised here. The suite
 * therefore targets the deterministic public landing page (`/`) and documents
 * the auth-gated paths as skipped skeletons (see e2e/auth-flows.spec.ts).
 *
 * Runner separation:
 *  - Playwright owns `e2e/` (testDir below). It never sees `tests/` (Vitest).
 *  - Vitest's include is scoped to `tests/**` (see vitest.config.ts), so it
 *    never picks up these specs. The two runners do not collide.
 *
 * The webServer builds the Next.js app and serves the production build on 3000.
 * The build is slow, so the timeout is generous. `reuseExistingServer` lets a
 * developer keep `pnpm start` running locally between runs; in CI it always
 * starts fresh.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm build && pnpm start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    // The Next.js production build is slow; allow plenty of headroom.
    timeout: 300_000,
  },
});
