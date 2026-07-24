/**
 * Tests E2E — [FUTUR-ICONS-RICH] Icônes-jalons du graphe Futur (demande Marc « quasi aucune icône »).
 *
 * Prouve EN RENDU RÉEL (Recharts a besoin d'un vrai viewport — le preview headless le rend en 0×0) que le
 * graphe affiche de NOMBREUSES pastilles cliquables, dont les jalons dérivés (RRQ/PSV/retraits/impôts) +
 * ceux du moteur (retraite/FIRE). Chaque icône = `<g role="button" aria-label="Événement : ...">`.
 *
 * Le persona de test (couple, `activateTestMode`) a un horizon de projection qui atteint la retraite →
 * RRQ/PSV/retraits/règlements d'impôt annuels doivent apparaître.
 */
import { test, expect } from '@playwright/test';
import { scriptBypassOnboarding, activateTestMode } from './helpers/setup';

// Env cloud : le @playwright/test du repo attend une révision chromium plus récente que la préinstallée →
// pointer sur le binaire présent (leçon CHAT-PAGE-CONTEXT « PW_LOCAL_CHROMIUM »).
const localChromium = process.env.PW_LOCAL_CHROMIUM;
if (localChromium) test.use({ launchOptions: { executablePath: localChromium } });

test.describe('Futur — icônes-jalons (FUTUR-ICONS-RICH)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(scriptBypassOnboarding());
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await activateTestMode(page);
    await page.goto('/#FUTURE');
    await page.waitForLoadState('domcontentloaded');
  });

  test('le graphe affiche de nombreuses icônes-jalons (RRQ/PSV/retraits/impôts)', async ({ page }) => {
    const voirDirect = page.getByRole('button', { name: /projection actuelle.*sans optimiser/i });
    await voirDirect.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
    if (await voirDirect.isVisible().catch(() => false)) await voirDirect.click();
    const chart = page.getByRole('img', { name: /Courbe de vie/ });
    await expect(chart).toBeVisible({ timeout: 15_000 });
    await chart.scrollIntoViewIfNeeded();
    await page.locator('.recharts-cartesian-grid').first().waitFor({ state: 'visible', timeout: 15_000 });
    await page.locator('.recharts-area-area, .recharts-area path').first().waitFor({ state: 'attached', timeout: 15_000 });

    const icons = page.getByRole('button', { name: /^Événement :/ });
    // Laisse Recharts poser les ReferenceDots.
    await icons.first().waitFor({ state: 'attached', timeout: 15_000 });
    const labelsText = await icons.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || ''));
    // eslint-disable-next-line no-console
    console.log(`[FUTUR-ICONS-RICH] ${labelsText.length} icônes:`, JSON.stringify(labelsText));

    // AVANT le fix : ~0-2 icônes (seuls les lifeEvents one-time du moteur). APRÈS : bien plus.
    expect(labelsText.length).toBeGreaterThanOrEqual(4);
    const joined = labelsText.join(' | ');
    expect(joined).toMatch(/RRQ|PSV/);   // rentes publiques (jalons dérivés)
    expect(joined).toMatch(/retrait/i);  // retraits REER/CELI
    expect(joined).toMatch(/impôt/i);    // règlement d'impôt annuel
  });
});
