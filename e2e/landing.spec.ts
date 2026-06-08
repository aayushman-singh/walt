import { test, expect } from '@playwright/test';

/**
 * Happy-path E2E for the PUBLIC landing page (route `/`).
 *
 * `/` renders pages/index.tsx -> pages/home.tsx -> components/HomePageHtml.tsx.
 * Assertions below are anchored to the REAL rendered DOM in those files, not
 * invented copy. With no signed-in Firebase user (the default on this host),
 * HomePageHtml renders the guest hero with the "Upload a file" / "Sign In"
 * buttons and the public footer links (Terms of Service -> /terms).
 */
test.describe('public landing page', () => {
  test('loads, shows brand + hero, exposes a real public link, no uncaught page error', async ({
    page,
  }) => {
    // Capture genuine uncaught exceptions (PAGE ERROR). We intentionally do NOT
    // fail on console.error / network errors: with no Firebase env or backend on
    // this host, the SDK emits expected network/auth noise that is not a defect.
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    // 1. Page responds 200.
    const response = await page.goto('/');
    expect(response, 'navigation should produce a response').not.toBeNull();
    expect(response!.status()).toBe(200);

    // 2. Document title comes from components/OpenGraph.tsx via pages/home.tsx.
    await expect(page).toHaveTitle('Walt - Decentralized Storage');

    // 3. Brand wordmark is visible (the menu-bar logo renders the text "Walt").
    await expect(page.locator('header').getByText('Walt', { exact: true })).toBeVisible();

    // 4. Hero heading + accent copy from HomePageHtml's #welcome-hero section.
    await expect(
      page.getByRole('heading', { name: 'Easy and Reliable Asset Storage' })
    ).toBeVisible();
    await expect(
      page.getByText('Experience true data security with IPFS on chain storage')
    ).toBeVisible();

    // 5. Primary guest CTAs render for an unauthenticated visitor.
    await expect(page.getByRole('button', { name: 'Upload a file' })).toBeVisible();

    // 6. A real public link with the correct href: the footer Terms of Service
    //    link points at /terms (pages/terms.tsx). This is the deterministic,
    //    auth-free navigation target on this page.
    const termsLink = page.getByRole('link', { name: 'Terms of Service' });
    await expect(termsLink).toBeVisible();
    await expect(termsLink).toHaveAttribute('href', '/terms');

    // No uncaught exceptions while the page loaded and settled.
    expect(pageErrors, `unexpected uncaught page errors: ${pageErrors.join('; ')}`).toEqual([]);
  });
});
