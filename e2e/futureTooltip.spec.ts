/**
 * Tests E2E — [R3] Tooltip FIGEABLE du graphe Futur.
 *
 * Le clic sur une ZONE VIDE du graphe FIGE l'infobulle (au lieu d'ouvrir la modale) :
 * elle reste ancrée pour comparer/scroller. Cas couverts (plan § R3) :
 *  - clic = fige (l'infobulle apparaît, ancrée) ;
 *  - un mousemove APRÈS le figeage ne la déplace plus (invariant clé) ;
 *  - Échap ferme ;
 *  - le bouton « Détail complet » ouvre la modale exhaustive (coexistence).
 *
 * ⚠️ Coexistence : un clic sur une PASTILLE d'événement ouvre la MODALE (pas le gel)
 * — `freezeViaClick` essaie donc plusieurs X (et ferme la modale si on touche une
 * pastille) jusqu'à trouver une zone vide qui fige. La bannière de consentement est
 * neutralisée par `scriptBypassOnboarding` (sinon elle intercepte les clics du bas).
 */
import { test, expect, type Page } from '@playwright/test';
import { scriptBypassOnboarding, activateTestMode } from './helpers/setup';

test.describe('Futur — tooltip figeable (R3)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(scriptBypassOnboarding());
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await activateTestMode(page); // couple Alex/Sam → projection calculée
    await page.goto('/#FUTURE');
    await page.waitForLoadState('domcontentloaded');
  });

  // Box du conteneur du graphe, une fois la grille ET une série Recharts rendues
  // (= chart correctement dimensionné, plus le warning width(-1) transitoire).
  async function chartBox(page: Page) {
    const voirDirect = page.getByRole('button', { name: /projection actuelle.*sans optimiser/i });
    await voirDirect.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
    if (await voirDirect.isVisible().catch(() => false)) await voirDirect.click();
    const chart = page.getByRole('img', { name: /Courbe de vie/ });
    await expect(chart).toBeVisible({ timeout: 15_000 });
    await chart.scrollIntoViewIfNeeded();
    await page.locator('.recharts-cartesian-grid').first().waitFor({ state: 'visible', timeout: 15_000 });
    // attendre qu'au moins une aire empilée soit tracée (chart dimensionné, pas -1×-1).
    await page.locator('.recharts-area-area, .recharts-area path').first().waitFor({ state: 'attached', timeout: 15_000 });
    const box = await chart.boundingBox();
    expect(box).not.toBeNull();
    return box!;
  }

  // Fige le tooltip via un clic sur une ZONE VIDE. Essaie plusieurs X à un Y bas
  // (sous les pastilles, qui collent à la courbe) ; si un clic ouvre la modale
  // (pastille touchée), on la ferme et on réessaie ailleurs. Retourne quand figé.
  async function freezeViaClick(page: Page, box: { x: number; y: number; width: number; height: number }) {
    const frozen = page.locator('[data-frozen-tooltip]');
    const modal = page.getByRole('dialog', { name: 'Détail du mois' });
    const vh = page.viewportSize()?.height ?? 720;
    const y = Math.min(box.y + box.height * 0.8, vh - 24); // bas du graphe = pas de pastilles
    for (const fx of [0.5, 0.32, 0.68, 0.2, 0.8, 0.42, 0.6]) {
      await page.mouse.click(box.x + box.width * fx, y);
      if (await frozen.isVisible().catch(() => false)) return frozen;
      if (await modal.isVisible().catch(() => false)) {
        await page.keyboard.press('Escape');
        await modal.waitFor({ state: 'hidden', timeout: 2_000 }).catch(() => {});
      }
    }
    throw new Error('Aucun clic en zone vide n\'a figé le tooltip');
  }

  test('clic = fige (ancré) · mousemove ne déplace plus · Échap ferme', async ({ page }) => {
    const box = await chartBox(page);
    const frozen = await freezeViaClick(page, box);
    await expect(frozen).toBeVisible();

    const before = await frozen.boundingBox();
    // Bouger la souris (dans le viewport) → le tooltip FIGÉ ne bouge pas (invariant R3).
    await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.3);
    await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.5);
    const after = await frozen.boundingBox();
    expect(after!.x).toBeCloseTo(before!.x, 0);
    expect(after!.y).toBeCloseTo(before!.y, 0);

    await page.keyboard.press('Escape');
    await expect(frozen).toBeHidden({ timeout: 5_000 });
  });

  test('tooltip figé → « Détail complet » ouvre la modale (coexistence)', async ({ page }) => {
    const box = await chartBox(page);
    const frozen = await freezeViaClick(page, box);
    await frozen.getByRole('button', { name: /Détail complet/ }).click();
    // La modale exhaustive (aria-label distinct du tooltip figé).
    await expect(page.getByRole('dialog', { name: 'Détail du mois' })).toBeVisible({ timeout: 5_000 });
  });
});
