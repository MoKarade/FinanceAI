/**
 * Tests E2E — [R3] Tooltip FIGEABLE du graphe Futur.
 *
 * Le clic sur le graphe FIGE l'infobulle (au lieu d'ouvrir directement la modale) :
 * elle reste ancrée pour comparer/scroller. Cas couverts (plan § R3) :
 *  - clic = fige (l'infobulle apparaît, ancrée) ;
 *  - un mousemove APRÈS le figeage ne la déplace plus (invariant clé) ;
 *  - Échap ferme ;
 *  - le bouton « Détail complet » ouvre la modale exhaustive (coexistence).
 *
 * Le figeage utilise la résolution géométrique du clic (pas le survol Recharts) →
 * robuste en headless.
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

  // Renvoie la box du conteneur du graphe, une fois la grille Recharts rendue.
  // Le graphe est GATED derrière l'optimiseur de stratégie : on clique d'abord
  // « vois directement ta projection actuelle (sans optimiser) » pour le révéler.
  async function chartBox(page: Page) {
    // Le panneau optimiseur monte juste après la navigation : on ATTEND le bouton
    // (isVisible() ne patiente pas) avant de cliquer pour révéler le graphe.
    const voirDirect = page.getByRole('button', { name: /projection actuelle.*sans optimiser/i });
    await voirDirect.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
    if (await voirDirect.isVisible().catch(() => false)) {
      await voirDirect.click();
    }
    const chart = page.getByRole('img', { name: /Courbe de vie/ });
    await expect(chart).toBeVisible({ timeout: 15_000 });
    // Le graphe est sous la ligne de flottaison → le ramener dans le viewport pour
    // que les coords de page.mouse tombent dessus.
    await chart.scrollIntoViewIfNeeded();
    await page.locator('.recharts-cartesian-grid').first().waitFor({ state: 'visible', timeout: 15_000 });
    const box = await chart.boundingBox();
    expect(box).not.toBeNull();
    return box!;
  }

  // Point de clic GARANTI dans le viewport ET dans le graphe (le graphe peut être
  // plus haut que le viewport). Évite le milieu-haut où les pastilles d'événement
  // collent à la courbe (elles stopPropagation → ouvriraient la modale).
  function safePoint(page: Page, box: { x: number; y: number; width: number; height: number }) {
    const vp = page.viewportSize() ?? { width: 1280, height: 720 };
    const x = box.x + box.width * 0.5;
    const yWanted = box.y + box.height * 0.6;
    const y = Math.min(yWanted, vp.height - 24);
    return { x, y };
  }

  test('clic = fige (ancré) · mousemove ne déplace plus · Échap ferme', async ({ page }) => {
    const box = await chartBox(page);
    const { x, y } = safePoint(page, box);
    await page.mouse.click(x, y);

    const frozen = page.locator('[data-frozen-tooltip]');
    await expect(frozen).toBeVisible({ timeout: 5_000 });

    const before = await frozen.boundingBox();
    // Bouger la souris (dans le viewport) → le tooltip FIGÉ ne bouge pas (invariant R3).
    await page.mouse.move(x + 80, Math.max(box.y + 20, y - 80));
    await page.mouse.move(x - 80, y);
    const after = await frozen.boundingBox();
    expect(after!.x).toBeCloseTo(before!.x, 0);
    expect(after!.y).toBeCloseTo(before!.y, 0);

    await page.keyboard.press('Escape');
    await expect(frozen).toBeHidden({ timeout: 5_000 });
  });

  test('tooltip figé → « Détail complet » ouvre la modale (coexistence)', async ({ page }) => {
    const box = await chartBox(page);
    const { x, y } = safePoint(page, box);
    await page.mouse.click(x, y);

    const frozen = page.locator('[data-frozen-tooltip]');
    await expect(frozen).toBeVisible({ timeout: 5_000 });

    await frozen.getByRole('button', { name: /Détail complet/ }).click();
    // La modale exhaustive (aria-label distinct du tooltip figé).
    await expect(page.getByRole('dialog', { name: 'Détail du mois' })).toBeVisible({ timeout: 5_000 });
  });
});
