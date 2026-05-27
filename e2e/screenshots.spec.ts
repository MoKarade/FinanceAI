/**
 * Tests E2E — Screenshots baselines
 *
 * 1er run : crée les images de référence dans e2e/__snapshots__/.
 * Runs suivants : compare les captures actuelles aux baselines.
 *
 * Onglets couverts : Dashboard, Futur, Retraite, Enfant (ChildPlanning).
 *
 * Les fichiers de snapshots sont commités dans le dépôt
 * (voir .gitignore : test-results/ et playwright-report/ exclus,
 * mais e2e/__snapshots__/ inclus).
 */
import { test, expect } from '@playwright/test';
import { scriptBypassOnboarding, activateTestMode } from './helpers/setup';

test.describe('Screenshots baselines (mode test)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(scriptBypassOnboarding());
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await activateTestMode(page);
  });

  test('Dashboard — baseline screenshot', async ({ page }) => {
    await page.goto('/#DASHBOARD');
    // Attendre le rendu du titre de page principal
    await expect(page.locator('#main h1').first()).toBeVisible({ timeout: 10_000 });
    // Laisser les transitions CSS se terminer (reducedMotion activé mais layout peut bouger)
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('dashboard.png', {
      fullPage: false,
      maxDiffPixelRatio: 0.02,
    });
  });

  test('Futur — baseline screenshot', async ({ page }) => {
    await page.goto('/#FUTURE');
    await expect(page.locator('#main h1').first()).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('futur.png', {
      fullPage: false,
      maxDiffPixelRatio: 0.02,
    });
  });

  test('Retraite — baseline screenshot', async ({ page }) => {
    await page.goto('/#RETIREMENT');
    await expect(page.locator('#main h1').first()).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('retraite.png', {
      fullPage: false,
      maxDiffPixelRatio: 0.02,
    });
  });

  test('Enfant (ChildPlanning) — baseline screenshot', async ({ page }) => {
    await page.goto('/#CHILD');
    await expect(page.locator('#main h1').first()).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('enfant.png', {
      fullPage: false,
      maxDiffPixelRatio: 0.02,
    });
  });
});
