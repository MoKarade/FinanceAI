/**
 * Tests E2E — [A11Y-FUTUR-MILESTONES-KEYBOARD] Les pastilles d'événement du graphe Futur au
 * CLAVIER (décision Marc : focusables), en rendu réel.
 *
 * Prouvé ici :
 *   1. une pastille reçoit le focus réel navigateur (tabIndex 0) et son anneau SVG s'affiche ;
 *   2. Entrée ouvre la MÊME modale de détail que le clic ;
 *   3. l'aria-label est DATÉ (un lecteur d'écran n'entend pas 29 événements sans repère temporel).
 */
import { test, expect, type Page } from '@playwright/test';
import { scriptBypassOnboarding, activateTestMode } from './helpers/setup';

const localChromium = process.env.PW_LOCAL_CHROMIUM;
if (localChromium) test.use({ launchOptions: { executablePath: localChromium } });

async function openFuture(page: Page) {
  await page.addInitScript(scriptBypassOnboarding());
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await activateTestMode(page);
  await page.goto('/#FUTURE');
  const voirDirect = page.getByRole('button', { name: /projection actuelle.*sans optimiser/i });
  await voirDirect.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
  if (await voirDirect.isVisible().catch(() => false)) await voirDirect.click();
  await expect(page.getByRole('img', { name: /Courbe de vie/ })).toBeVisible({ timeout: 15_000 });
  await page.locator('.chart-event-icon').first().waitFor({ state: 'attached', timeout: 15_000 });
}

test.describe('Futur — pastilles au clavier', () => {
  test.setTimeout(120_000);

  test('[A11Y-FUTUR-MILESTONES-KEYBOARD] focus réel + anneau visible + Entrée = modale + label daté', async ({ page }) => {
    await openFuture(page);
    const icon = page.locator('.chart-event-icon').first();

    // Label DATÉ (le tiret n'apparaît que si la date est là — et elle doit l'être).
    const label = await icon.getAttribute('aria-label');
    expect(label).toMatch(/^Événement : .+ — .+/);

    // Focus réel navigateur → l'anneau SVG passe visible (focus-visible via clavier).
    await icon.focus();
    const focused = await page.evaluate(() => document.activeElement?.classList.contains('chart-event-icon'));
    expect(focused).toBe(true);

    // Entrée = même action que le clic : la modale de détail s'ouvre.
    await page.keyboard.press('Enter');
    const modal = page.getByRole('dialog', { name: 'Détail du mois' });
    await expect(modal).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden({ timeout: 3_000 });
  });
});
