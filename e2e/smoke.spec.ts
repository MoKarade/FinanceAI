/**
 * Test smoke E2E — ETAPE 1 (gate)
 * Vérifie que l'application démarre et affiche du contenu sur le Dashboard.
 */
import { test, expect } from '@playwright/test';
import { scriptBypassOnboarding } from './helpers/setup';

test.describe('Smoke — chargement initial', () => {
  test.beforeEach(async ({ page }) => {
    // Bypass onboarding avant tout chargement
    await page.addInitScript(scriptBypassOnboarding());
  });

  test("l'app charge sur le Dashboard sans erreur bloquante", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Un élément de l'app doit être visible (le layout)
    await expect(page.locator('body')).not.toBeEmpty();

    // Pas d'erreur JavaScript non-gérée
    expect(consoleErrors).toHaveLength(0);
  });
});
