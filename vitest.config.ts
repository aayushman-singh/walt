import { defineConfig } from 'vitest/config';

/**
 * Single config, environment chosen per-file by path.
 * Backend route tests run under `node`; everything else (frontend pure
 * modules / future component tests) runs under `jsdom`.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    environmentMatchGlobs: [
      ['tests/backend/**', 'node'],
      ['backend/**', 'node'],
    ],
    include: ['tests/**/*.test.{ts,tsx,js}'],
  },
});
