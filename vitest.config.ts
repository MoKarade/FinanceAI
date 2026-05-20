import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Phase A.4 — les constantes globales définies dans vite.config.ts (build)
  // doivent aussi exister en environnement de test sinon ReferenceError.
  define: {
    __APP_VERSION__: JSON.stringify('test'),
    __GIT_SHA__: JSON.stringify('test'),
    __BUILD_DATE__: JSON.stringify('1970-01-01'),
  },
  test: {
    // Tests services: Node (rapide). Tests composants: jsdom via __jsdom__ env override.
    environment: 'node',
    environmentMatchGlobs: [
      ['tests/components/**', 'jsdom'],
      ['tests/store/**', 'jsdom'],
      ['tests/a11y/**', 'jsdom'],
    ],
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
  },
});
