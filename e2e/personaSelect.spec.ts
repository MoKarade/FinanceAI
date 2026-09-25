/**
 * Tests E2E — Sélecteur de persona du mode test.
 *
 * Régression (rapportée par Marc 2× ) : choisir un persona dans la liste
 * doit l'APPLIQUER immédiatement (et activer le mode test au besoin). Le bug
 * laissait le persona précédent actif quand on sélectionnait « Léa » (seule)
 * sans cliquer un bouton → l'utilisateur voyait encore 2 salaires (couple).
 */
import { test } from '@playwright/test';
import { ecarterLeRail, scriptBypassOnboarding } from './helpers/setup';

test.describe('Mode test — sélecteur de persona', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(scriptBypassOnboarding());
    await page.goto('/#SETTINGS');
    await page.waitForLoadState('domcontentloaded');
    // ⚠️ Le pointeur n'a pas encore bougé de (0,0), donc il SURVOLE le rail, qui s'ouvre et
    // recouvre l'onglet visé. Voir `ecarterLeRail` — sans cet appel, le clic ci-dessous
    // expire au bout de 30 s en répétant « subtree intercepts pointer events ».
    await ecarterLeRail(page);
    // [S5-REFONTE-REGLAGES] La carte du mode test est toujours visible dans Réglages (colonne de droite).
  });

  /** Le bouton d'un persona dans la carte du mode test (nom = libellé + accroche, d'où la regex). */
  const persona = (page: import('@playwright/test').Page, nom: RegExp) =>
    page.getByRole('group', { name: /persona/i }).getByRole('button', { name: nom });

  test('choisir un persona seul (Léa) l\'applique immédiatement, sans bouton', async ({ page }) => {
    const lea = persona(page, /Léa/);
    await lea.waitFor({ state: 'visible', timeout: 8_000 });

    // Cliquer « Léa » directement dans la liste (le geste exact de Marc), mode test éteint.
    await lea.click();

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
    // D'abord un couple, puis bascule vers un persona seul.
    const couple = persona(page, /Couple à l'aise/);
    await couple.waitFor({ state: 'visible', timeout: 8_000 });
    await couple.click();
    await page.waitForFunction(() => document.body.innerText.includes('MODE TEST'), { timeout: 8_000 });

    await persona(page, /Karim/).click();
    await page.waitForFunction(
      () => document.body.innerText.includes('Karim'),
      { timeout: 8_000 },
    );
  });
});
