/**
 * Tests E2E — [FUTUR-ANCRE-AUJOURDHUI] Au repos, le panneau du jour montre AUJOURD'HUI.
 *
 * Défaut trouvé le 25/09/2026 (refonte S5) : depuis [FUTUR-DAILY-ROLLOVER], la courbe au jour
 * porte les jours réels du mois courant AVANT aujourd'hui (abscisses [0, x du jour)). L'ancre du
 * panneau prenait « le premier point d'abscisse ≥ 0 » : le 1er du mois. Le 25/09, le panneau
 * « Aujourd'hui » affichait le 01/09, et la valeur flottante sur la courbe s'écartait de la tuile
 * Patrimoine net de tous les mouvements du mois.
 *
 * Horloge fixée au 12 août (milieu de mois) : l'ancienne règle rendait le 01/08, la bonne le 12/08.
 */
import { test, expect } from '@playwright/test';
import { scriptBypassOnboarding, activateTestMode } from './helpers/setup';

const localChromium = process.env.PW_LOCAL_CHROMIUM;
if (localChromium) test.use({ launchOptions: { executablePath: localChromium } });

test.describe('Futur — ancre « Aujourd\'hui » du panneau du jour', () => {
  test.setTimeout(120_000);

  test('[FUTUR-ANCRE-AUJOURDHUI] au repos, le panneau porte la date du JOUR, pas le 1er du mois', async ({ page }) => {
    await page.clock.install({ time: new Date(2026, 7, 12, 14, 0, 0) });
    await page.addInitScript(scriptBypassOnboarding());
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await activateTestMode(page);
    await page.goto('/#FUTURE');
    await page.waitForLoadState('domcontentloaded');

    const voirDirect = page.getByRole('button', { name: /projection actuelle.*sans optimiser/i });
    await voirDirect.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
    if (await voirDirect.isVisible().catch(() => false)) await voirDirect.click();
    await page.locator('.recharts-cartesian-grid').first().waitFor({ state: 'visible', timeout: 15_000 });

    const panneau = page.locator('[data-panneau-jour]');
    await expect(panneau).toBeVisible();
    // Aucun jour épinglé : c'est bien l'ANCRE qui est montrée.
    await expect(page.locator('[data-jour-epingle]')).toHaveCount(0);
    await expect(panneau).toContainText('12/08/2026');
    await expect(panneau).not.toContainText('01/08/2026');
  });
});
