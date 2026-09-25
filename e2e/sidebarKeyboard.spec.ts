/**
 * Tests E2E — la barre latérale au CLAVIER, en moteur de rendu RÉEL.
 *
 * [S5-REFONTE-R1] La barre est désormais TOUJOURS dépliée (232 px, texte) : plus de rail au
 * survol ni d'accordéon (l'ancien contrat [D6-KBD] « atteint = opérable » portait sur eux).
 * Reste à prouver, dans un vrai navigateur (jsdom ne calcule ni visibilité ni tab-order) :
 *   1. chaque item de la nav ET la carte Profil sont atteignables au Tab, dans l'ordre affiché ;
 *   2. Entrée sur un item ouvre la page correspondante.
 */
import { test, expect } from '@playwright/test';
import { scriptBypassOnboarding, activateTestMode } from './helpers/setup';

const localChromium = process.env.PW_LOCAL_CHROMIUM;
if (localChromium) test.use({ launchOptions: { executablePath: localChromium } });

const ORDRE = ['Futur', 'Transactions', 'Budget', 'Dettes', 'Placements', 'Retraite', 'Immobilier', 'Enfants', 'Projets de vie', 'Impôts', 'Assistant', 'Réglages'];

test.describe('Barre latérale — pilotage clavier (S5-REFONTE-R1)', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(scriptBypassOnboarding());
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await activateTestMode(page);
  });

  test('Tab parcourt tous les items puis la carte Profil ; Entrée ouvre la page', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Navigation principale' });
    await nav.getByRole('button', { name: 'Futur' }).focus();
    const vus: string[] = [];
    for (let i = 0; i < ORDRE.length; i++) {
      vus.push(((await page.evaluate(() => document.activeElement?.textContent)) ?? '').trim());
      await page.keyboard.press('Tab');
    }
    expect(vus).toEqual(ORDRE);
    // Après « Réglages », le focus atteint la carte Profil (pied de barre).
    expect((await page.evaluate(() => document.activeElement?.textContent)) ?? '').toContain('Profil');

    await nav.getByRole('button', { name: 'Budget' }).focus();
    await page.keyboard.press('Enter');
    await expect(nav.getByRole('button', { name: 'Budget' })).toHaveAttribute('aria-current', 'page');
  });
});
