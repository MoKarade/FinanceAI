/**
 * Tests E2E — Sélecteur de persona du mode test.
 *
 * Régression (rapportée par Marc 2× ) : choisir un persona dans le menu déroulant
 * doit l'APPLIQUER immédiatement (et activer le mode test au besoin). Le bug
 * laissait le persona précédent actif quand on sélectionnait « Léa » (seule)
 * sans cliquer un bouton → l'utilisateur voyait encore 2 salaires (couple).
 */
import { test } from '@playwright/test';
import { scriptBypassOnboarding } from './helpers/setup';

test.describe('Mode test — sélecteur de persona', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(scriptBypassOnboarding());
    await page.goto('/#SETTINGS');
    await page.waitForLoadState('domcontentloaded');
    // TestModePanel vit désormais dans le sous-onglet « Système & diagnostics »
    // (déplacé hors de « Sauvegarde » lors du regroupement UI).
    await page.getByRole('tab', { name: /Système/i }).click();
  });

  test('choisir un persona seul (Léa) l\'applique immédiatement, sans bouton', async ({ page }) => {
    const select = page.getByRole('combobox', { name: 'Choisir un persona de test' });
    await select.waitFor({ state: 'visible', timeout: 8_000 });

    // Sélectionner « Léa » directement dans la liste (le geste exact de Marc).
    // Par valeur = id du persona (stable, typé string).
    await select.selectOption('lea-fauchee');

    // Le banner doit confirmer que LÉA est le persona ACTIF (donc la sélection
    // a bien été appliquée). Sans le fix, le mode test ne s'activait pas →
    // ce waitForFunction expirait.
    await page.waitForFunction(
      () => {
        const t = document.body.innerText;
        return t.includes('MODE TEST') && t.includes('Léa');
      },
      { timeout: 8_000 },
    );
  });

  test('bascule couple → seul : le persona seul devient actif', async ({ page }) => {
    const select = page.getByRole('combobox', { name: 'Choisir un persona de test' });
    await select.waitFor({ state: 'visible', timeout: 8_000 });

    // D'abord un couple, puis bascule vers un persona seul.
    await select.selectOption('couple-confort');
    await page.waitForFunction(() => document.body.innerText.includes('MODE TEST'), { timeout: 8_000 });

    await select.selectOption('karim-immigre');
    await page.waitForFunction(
      () => document.body.innerText.includes('Karim'),
      { timeout: 8_000 },
    );
  });
});
