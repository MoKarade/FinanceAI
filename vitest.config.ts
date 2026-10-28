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
    // Exécution des fichiers SÉQUENTIELLE (pas en parallèle). Plusieurs tests
    // sont sensibles au timing (événements de vie stochastiques W3.x) ou à
    // l'horloge (personas générés via `new Date()` sur 24 mois) : sous forte
    // contention CPU parallèle, l'ordonnancement variait → échecs intermittents
    // (~50%) alors qu'en isolation/séquentiel tout est vert (984/984, déterministe).
    // Le séquentiel garantit un CI reproductible (≈4 min vs ≈1 min, acceptable).
    // NB : le vrai bug que ce flou cachait (RQAP fantôme parent seul) a été corrigé,
    // ceci ne masque donc pas un bug — ça stabilise des tests timing-sensibles.
    fileParallelism: false,
    // Restaure les globaux stubés (vi.stubGlobal) AVANT chaque test → empêche la pollution
    // inter-fichiers (audit projection-validator 2026-06 : `finance.test.ts` stubbe `fetch`
    // sans le nettoyer → flake ~1/3 sur des tests purs selon l'ordre d'exécution). Filet global,
    // rend le gate/CI déterministe sans dépendre du nettoyage manuel de chaque fichier.
    unstubGlobals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: ['services/**/*.ts', 'utils/**/*.ts', 'hooks/**/*.ts'],
      exclude: [
        'services/test*.ts',
        'services/*.worker.ts',
        'node_modules/**',
      ],
    },
  },
});
