/**
 * Tests E2E — [FUTUR-MOBILE-LAYOUT] L'infobulle figée devient un BOTTOM SHEET sur téléphone.
 *
 * Retour Marc (2026-08-12) : « sur le tel c'est inutilisable trop petit trop cramped ». La boîte
 * flottante de 288 px recouvrait la moitié d'un écran de 390 px en restant illisible. Sur
 * téléphone, figer un jour ouvre désormais un panneau PLEINE LARGEUR ancré en bas, avec un
 * vrai bouton « Fermer » (« Échap pour fermer » n'existe pas au doigt).
 *
 * Prouvé en géométrie réelle (viewport 390×844 tactile) :
 *   1. tap sur la courbe → le sheet occupe TOUTE la largeur et touche le bas de l'écran ;
 *   2. le bouton « Fermer » est VISIBLE sans scroll (leçon sticky-footer : géométrie, pas click) ;
 *   3. « Fermer » ferme ; 4. la courbe elle-même est plus haute qu'avant (≥ 55 dvh).
 */
import { test, expect, type Page } from '@playwright/test';
import { scriptBypassOnboarding, activateTestMode } from './helpers/setup';

const localChromium = process.env.PW_LOCAL_CHROMIUM;
if (localChromium) test.use({ launchOptions: { executablePath: localChromium } });

test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

async function chartBox(page: Page) {
  const voirDirect = page.getByRole('button', { name: /projection actuelle.*sans optimiser/i });
  await voirDirect.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
  if (await voirDirect.isVisible().catch(() => false)) await voirDirect.click();
  const chart = page.getByRole('img', { name: /Courbe de vie/ });
  await expect(chart).toBeVisible({ timeout: 15_000 });
  await chart.scrollIntoViewIfNeeded();
  await page.locator('.recharts-cartesian-grid').first().waitFor({ state: 'visible', timeout: 15_000 });
  const box = await chart.boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

test.describe('Futur mobile — infobulle figée en bottom sheet', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(scriptBypassOnboarding());
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await activateTestMode(page);
    await page.goto('/#FUTURE');
    await page.waitForLoadState('domcontentloaded');
  });

  test('[FUTUR-MOBILE-LAYOUT] tap = sheet pleine largeur ancré en bas, Fermer visible et fonctionnel', async ({ page }) => {
    const box = await chartBox(page);

    // La courbe mobile est plus HAUTE qu'avant (55dvh ≈ 464 px sur 844 ; l'ancien fixe = 380).
    expect(box.height).toBeGreaterThan(400);

    // Tap → fige un jour → sheet. Les pastilles d'événement (denses au centre en mobile) ont
    // leur propre action (modale) : même motif d'évitement que futureDailySelect.
    const sheet = page.locator('[data-frozen-tooltip]');
    const modal = page.getByRole('dialog', { name: 'Détail du mois' });
    // Viser SOUS la bande d'icônes-jalons (denses le long de la courbe en mobile) : dans les
    // aires empilées du bas. Après chaque tap, LAISSER l'UI retomber avant de vérifier — vérifier
    // trop tôt relançait un tap pendant l'ouverture de la modale (mesuré : modale plein écran
    // restée ouverte en fin de boucle).
    const spots: Array<[number, number]> = [
      [box.width * 0.5, box.height * 0.78],
      [box.width * 0.3, box.height * 0.82],
      [box.width * 0.65, box.height * 0.75],
      [box.width * 0.45, box.height * 0.6],
    ];
    for (const [dx, dy] of spots) {
      await page.touchscreen.tap(box.x + dx, box.y + dy);
      await page.waitForTimeout(500);
      if (await modal.isVisible().catch(() => false)) {
        await page.keyboard.press('Escape');
        await modal.waitFor({ state: 'hidden', timeout: 2_000 }).catch(() => {});
        continue;
      }
      if (await sheet.isVisible().catch(() => false)) break;
    }
    await expect(sheet).toBeVisible({ timeout: 5_000 });

    const sb = (await sheet.boundingBox())!;
    const viewport = page.viewportSize()!;
    // Pleine largeur, ancré en BAS de l'écran (tolérance 2 px de bordure/arrondi).
    expect(sb.width).toBeGreaterThan(viewport.width - 4);
    expect(sb.y + sb.height).toBeGreaterThan(viewport.height - 2);

    // « Fermer » VISIBLE par géométrie, SANS scroll (leçon FUTUR-TOOLTIP-STICKY-ACTIONS : un
    // click() de Playwright scrollerait et masquerait un bouton sous le pli).
    const fermer = page.getByRole('button', { name: /Fermer l'infobulle/ });
    await expect(fermer).toBeVisible();
    const fb = (await fermer.boundingBox())!;
    expect(fb.y + fb.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(fb.y).toBeGreaterThanOrEqual(sb.y);
    expect(fb.height).toBeGreaterThanOrEqual(43); // cible tactile ≥ 44 px (arrondi navigateur)

    await fermer.tap();
    await expect(sheet).toHaveCount(0);
  });
});
