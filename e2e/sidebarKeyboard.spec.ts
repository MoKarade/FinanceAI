/**
 * Tests E2E — [D6-KBD] La sidebar au CLAVIER, en moteur de rendu RÉEL.
 *
 * Pourquoi e2e et pas jsdom : `visibility: hidden` (classe `invisible`) retire du tab-order —
 * mais jsdom ne calcule aucun style CSS, `getComputedStyle` y répond `visible` et le focus s'y
 * pose quand même (mesuré, audit #598). Seul un vrai navigateur prouve ce contrat.
 *
 * Prouvé ici :
 *   1. l'en-tête de groupe est FOCUSABLE au Tab même sidebar repliée (plus jamais disabled),
 *      et le focus déplie la sidebar ;
 *   2. Entrée replie le groupe → ses items sortent du tab-order (Tab depuis l'en-tête atterrit
 *      HORS du panneau replié) ;
 *   3. re-Entrée redéplie → Tab entre dans les items du groupe.
 */
import { test, expect, type Page } from '@playwright/test';
import { scriptBypassOnboarding, activateTestMode } from './helpers/setup';

const localChromium = process.env.PW_LOCAL_CHROMIUM;
if (localChromium) test.use({ launchOptions: { executablePath: localChromium } });

async function focusFirstGroupHeader(page: Page) {
  // Focus DIRECT sur l'en-tête (focus réel navigateur — même chemin que Tab) : le focus doit
  // déplier la sidebar (onFocus de l'aside), preuve du contrat « atteint = opérable ».
  const header = page.locator('aside button[aria-controls]').first();
  await header.focus();
  return header;
}

test.describe('Sidebar — pilotage clavier (D6-KBD)', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(scriptBypassOnboarding());
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await activateTestMode(page);
  });

  test('[D6-KBD] focus = sidebar dépliée ; replier un groupe sort ses items du tab-order', async ({ page }) => {
    const aside = page.locator('aside');
    await expect(aside).toBeVisible();

    const header = await focusFirstGroupHeader(page);
    await expect(header).toBeFocused(); // plus jamais disabled : le focus S'Y POSE
    await expect(aside).toHaveClass(/w-72/); // et le focus a DÉPLIÉ la sidebar

    const panelId = await header.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();

    // Groupe déplié (défaut) : Tab entre dans ses items.
    await expect(header).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Tab');
    const inPanelWhenOpen = await page.evaluate(
      (id) => !!document.activeElement?.closest(`#${CSS.escape(id!)}`), panelId,
    );
    expect(inPanelWhenOpen).toBe(true);

    // Replier (Entrée sur l'en-tête) : les items sortent du tab-order.
    await header.focus();
    await page.keyboard.press('Enter');
    await expect(header).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Tab');
    const inPanelWhenClosed = await page.evaluate(
      (id) => !!document.activeElement?.closest(`#${CSS.escape(id!)}`), panelId,
    );
    expect(inPanelWhenClosed).toBe(false); // Tab a SAUTÉ le panneau replié — le contrat que jsdom ne peut pas prouver

    // Redéplier : Tab rentre à nouveau.
    await header.focus();
    await page.keyboard.press('Enter');
    await expect(header).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Tab');
    const inPanelReopened = await page.evaluate(
      (id) => !!document.activeElement?.closest(`#${CSS.escape(id!)}`), panelId,
    );
    expect(inPanelReopened).toBe(true);
  });
});
