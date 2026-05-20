import { defineConfig } from 'vitest/config';

// P1 fix — vitest ^4 a retiré `environmentMatchGlobs` (était deprecated dans v3).
// Solution : utiliser `projects` pour grouper les tests par environnement, OU
// simplement passer tout en jsdom (overhead négligeable et simpler config).
// Choix : jsdom partout — la plupart de nos tests utilisent localStorage ou React,
// et les tests services pures n'ont pas de cost notable en jsdom.

export default defineConfig({
  // Phase A.4 — les constantes globales définies dans vite.config.ts (build)
  // doivent aussi exister en environnement de test sinon ReferenceError.
  define: {
    __APP_VERSION__: JSON.stringify('test'),
    __GIT_SHA__: JSON.stringify('test'),
    __BUILD_DATE__: JSON.stringify('1970-01-01'),
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
  },
});
