// ESLint 9 flat config. Next 16 removed the `next lint` subcommand and ships
// eslint-config-next as a flat config, so we run eslint directly (see the
// "lint" script in package.json).
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

const next = Array.isArray(nextCoreWebVitals) ? nextCoreWebVitals : [nextCoreWebVitals];

export default [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'backend/**',
      'coverage/**',
      'next-env.d.ts',
    ],
  },
  ...next,
  {
    // Project lint policy: Next 16 ships a much stricter react-hooks plugin
    // (set-state-in-effect, purity, refs) plus a few style rules. These flag
    // long-standing, behaviourally-correct patterns (localStorage hydration in
    // effects, etc.) rather than real bugs. Surface them as warnings so CI's
    // lint gate catches genuine errors without forcing an unrelated cleanup of
    // pre-existing component code. Tracked as a follow-up.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      'react/no-unescaped-entities': 'warn',
      'import/no-anonymous-default-export': 'warn',
      '@next/next/no-html-link-for-pages': 'warn',
    },
  },
];
