/**
 * Tests E2E — [FUTUR-DAILY-ROLLOVER] Le passé de la courbe SUIT LE CALENDRIER.
 *
 * Demande de Marc (2026-08-12) : « ça doit se mettre à jour à chaque jour pour le passé ».
 * Scénario exact prouvé ici, avec l'horloge Playwright : l'app reste OUVERTE, minuit passe,
 * le timer horaire partagé tire — et la frontière « Aujourd'hui » avance d'un jour SANS
 * rechargement. Avant ce lot, `todayIso` était figé au montage : la frontière réel/projeté
 * restait au jour de l'ouverture pour toujours.
 *
 * ⚠️ La mesure se fait en fenêtre ZOOMÉE (preset « Aujourd'hui », ~7 mois) : un jour y fait
 * ~5 px. En vue « Tout » (30 ans), un jour ≈ 0,03 px — l'assertion serait vacueuse.
 */
import { test, expect } from '@playwright/test';
import { scriptBypassOnboarding, activateTestMode } from './helpers/setup';

const localChromium = process.env.PW_LOCAL_CHROMIUM;
if (localChromium) test.use({ launchOptions: { executablePath: localChromium } });

/** Abscisse écran du label « Aujourd'hui » (texte SVG du RefLineLabel). */
async function todayLabelX(page: import('@playwright/test').Page): Promise<number> {
  const label = page.locator('svg text', { hasText: "Aujourd'hui" }).first();
  await expect(label).toBeVisible({ timeout: 15_000 });
  const box = (await label.boundingBox())!;
  return box.x;
}

test.describe('Futur — rollover quotidien de la frontière réel/projeté', () => {
  test.setTimeout(120_000);

  test('[FUTUR-DAILY-ROLLOVER] minuit passe, app OUVERTE → « Aujourd\'hui » avance d\'un jour', async ({ page }) => {
    // Horloge contrôlée AVANT tout script de l'app : 21 h, un soir quelconque.
    await page.clock.install({ time: new Date(2026, 7, 12, 21, 0, 0) });
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

    // Fenêtre resserrée autour du présent : le preset clavier « Aujourd'hui » (~7 mois).
    // ⚠️ Ciblé par `title` : le toggle de légende (masquer la ligne) porte le MÊME nom visible.
    await page.getByTitle("Fenêtre d'environ 6 mois centrée sur aujourd'hui").click();
    await page.locator('.recharts-area-area, .recharts-area path').first().waitFor({ state: 'attached', timeout: 15_000 });

    const xBefore = await todayLabelX(page);

    // Minuit passe (21 h → 01 h) : le tick HORAIRE partagé tire pendant l'avance.
    await page.clock.fastForward('04:00:00');

    // La frontière a avancé d'environ UN jour de largeur de fenêtre (~7 mois ≈ 215 jours
    // visibles) : strictement > 0 et < 3 largeurs de jour (tolérance re-layout).
    await expect
      .poll(async () => (await todayLabelX(page)) - xBefore, { timeout: 10_000 })
      .toBeGreaterThan(0.5);
    const delta = (await todayLabelX(page)) - xBefore;
    const grid = (await page.locator('.recharts-cartesian-grid').first().boundingBox())!;
    const oneDayPx = grid.width / 215;
    expect(delta).toBeLessThan(oneDayPx * 3);
  });
});
