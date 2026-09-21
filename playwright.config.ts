import { defineConfig, devices } from '@playwright/test';

/**
 * Configuration Playwright pour les tests E2E de FinanceAI.
 *
 * Projets : chromium (Desktop Chrome) + mobile-chrome (390×844 tactile, specs « *Mobile* » seulement).
 * Animations : reducedMotion pour stabiliser les screenshots.
 * WebServer : démarre `npm run dev` sur le port 3000 (vite.config.ts → server.port: 3000).
 * reuseExistingServer : true pour dev local (évite double-démarrage).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 8_000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    // [E2E-REDUCED-MOTION] L'en-tête de ce fichier ANNONÇAIT « Animations : reducedMotion pour
    // stabiliser les screenshots » depuis toujours — et la clé n'était nulle part dans `use` :
    // une phrase de COUVERTURE qui ne couvrait rien (`UN-TEST-QUI-VISE-UNE-SURFACE…`, variante
    // config). Ce que la promesse manquante coûte se lit dans le journal CI du 2026-09-21 :
    // `219 × waiting for element to be visible, enabled and stable / element is not stable`,
    // pendant les 120 s ENTIÈRES du test, sur le même bouton dans deux specs Futur.
    // ⚠️ MESURÉ, et c'est ce qui rend ce correctif non évident : la boîte du bouton est
    // bit-stable EN LOCAL — à 20× d'étranglement CPU comme réseau sortant coupé (trois
    // protocoles, `boundingBox` identique sur 120 échantillons). Le mouvement n'existe que sur
    // le runner. `prefers-reduced-motion` neutralise la cause CLASSE plutôt qu'un suspect :
    // `index.css` rabat TOUTE animation à 0,01 ms sous ce média, y compris le `translateY(20px)`
    // de `.animate-premium-in` que porte CHAQUE `Card` — donc celle qui contient ce bouton.
    // ⚠️ `contextOptions` et NON la racine de `use` : sur @playwright/test 1.60, `reducedMotion`
    // n'existe qu'au niveau contexte, et `npm run typecheck` refuse la forme racine (attrapé au
    // gate, pas en CI). Les projets ci-dessous étalent `devices[…]`, qui ne porte pas cette clé :
    // la fusion config→projet la conserve donc pour les deux.
    contextOptions: { reducedMotion: 'reduce' },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // [FUTUR-MOBILE-PR0] Les specs « *Mobile* » vivent dans le projet téléphone ci-dessous : ne
      // pas les jouer deux fois (elles forcent déjà leur propre viewport).
      testIgnore: /Mobile/,
    },
    {
      // [FUTUR-MOBILE-PR0] Projet TÉLÉPHONE (décision Marc 2026-09-10, refonte Futur mobile) :
      // 390×844 tactile, la géométrie exacte que Marc juge « inutilisable ». Réservé aux specs dont
      // le nom porte « Mobile » — la suite desktop reste la référence pour tout le reste, et un
      // second passage complet doublerait la durée du job E2E (~4 min).
      name: 'mobile-chrome',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
      testMatch: /Mobile/,
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
  snapshotPathTemplate: '{testDir}/__snapshots__/{testFilePath}/{arg}{ext}',
});
