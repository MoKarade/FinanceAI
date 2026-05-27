import { defineConfig, devices } from '@playwright/test';

/**
 * Configuration Playwright pour les tests E2E de FinanceAI.
 *
 * Projets : chromium uniquement (headless).
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
