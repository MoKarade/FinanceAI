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
    // ⚠️ [E2E-REDUCED-MOTION] ATTENDRE que le panneau soit RÉELLEMENT caché avant de taper Tab.
    // `aria-expanded="false"` est posé par React ; `visibility: hidden` — le mécanisme qui sort
    // les items du tab-order (voir le commentaire [D6-KBD] de `Layout.tsx`) — arrive une FRAME
    // plus tard sous `prefers-reduced-motion` : le bloc de `index.css` force
    // `transition-duration: 0.01ms` sur `*`, donc `visibility` devient une propriété TRANSITIONNÉE
    // (transition DISCRÈTE : elle bascule à la FIN de la durée, si courte soit-elle) au lieu de
    // basculer dans le même tick. Mesuré : `#nav-group-*` à `hidden` pendant que son enfant lit
    // encore `visible`, et Tab entre dans le panneau. Le CONTRAT testé n'a pas bougé — c'est le
    // MOMENT de la lecture qui était faux (`UN-TEST-E2E-QUI-LIT-UN-ETAT-UNE-SEULE-FOIS…`).
    const panneau = page.locator(`[id="${panelId}"]`); // ⚠️ `CSS.escape` n'existe pas côté runner Node
    await expect(panneau.locator('button').first()).toBeHidden(); // l'ITEM, pas le panneau : c'est lui que Tab voit
    await page.keyboard.press('Tab');
    const inPanelWhenClosed = await page.evaluate(
      (id) => !!document.activeElement?.closest(`#${CSS.escape(id!)}`), panelId,
    );
    expect(inPanelWhenClosed).toBe(false); // Tab a SAUTÉ le panneau replié — le contrat que jsdom ne peut pas prouver

    // Redéplier : Tab rentre à nouveau.
    await header.focus();
    await page.keyboard.press('Enter');
    await expect(header).toHaveAttribute('aria-expanded', 'true');
    await expect(panneau.locator('button').first()).toBeVisible(); // symétrique : même frame de retard au DÉPLIAGE
    await page.keyboard.press('Tab');
    const inPanelReopened = await page.evaluate(
      (id) => !!document.activeElement?.closest(`#${CSS.escape(id!)}`), panelId,
    );
    expect(inPanelReopened).toBe(true);
  });
});
