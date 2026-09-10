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
