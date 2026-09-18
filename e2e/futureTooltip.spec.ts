/**
 * Tests E2E — ÉPINGLER un jour sur le graphe Futur.
 *
 * ⚠️ [FUTUR-PANNEAU-FIXE 2026-09-18] CE FICHIER A CHANGÉ DE SUJET, et il faut lire pourquoi avant
 * de croire qu'on a perdu des protections. Il testait l'infobulle FLOTTANTE : « clic = fige », « un
 * mousemove ne la déplace plus », « Échap ferme ». Ces trois exigences existaient parce que
 * l'infobulle SUIVAIT le curseur — elle pouvait se déplacer sous la souris et disparaître.
 *
 * L'infobulle n'existe plus : le détail du jour est rendu par un PANNEAU FIXE dans le flux du
 * document, sous le graphe. Deux des trois exigences n'ont donc plus d'objet (rien ne flotte, rien
 * ne se ferme) — mais celle qui COMPTE, elle, survit et se mesure mieux : une fois un jour ÉPINGLÉ,
 * **le jour affiché ne change plus au survol**. C'est exactement l'irritant que Marc a coché (« elle
 * disparaît / bouge quand je veux la lire »), et c'était invérifiable tant que le test regardait des
 * coordonnées de boîte plutôt que la DATE affichée.
 *
 * Cas couverts :
 *  - clic = épingle (le panneau publie `data-jour-epingle`) ;
 *  - survol APRÈS l'épingle : la date affichée NE BOUGE PAS (invariant clé, réécrit) ;
 *  - Échap relâche — le panneau RESTE et retombe sur aujourd'hui, il ne disparaît pas ;
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
    // ⚠️ `[data-jour-epingle]` et non la présence du panneau : le panneau est TOUJOURS là, donc
    // seule l'ÉPINGLE est observable.
    const frozen = page.locator('[data-jour-epingle]');
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
    throw new Error('Aucun clic en zone vide n\'a épinglé de jour');
  }

  test('clic = épingle · le survol ne change plus le jour · Échap relâche sans rien faire disparaître', async ({ page }) => {
    const box = await chartBox(page);
    const frozen = await freezeViaClick(page, box);
    await expect(frozen).toBeVisible();

    // ⚠️ L'INVARIANT RÉÉCRIT, et c'est celui qui décrit l'irritant de Marc. L'ancienne version
    // comparait des COORDONNÉES de boîte — une mesure qui n'a plus de sens pour un panneau dans le
    // flux (il ne peut pas bouger) et qui, surtout, ne disait rien de ce qu'on LIT dedans. Ici on
    // survole franchement ailleurs sur la courbe et on exige que la DATE affichée soit identique.
    const dateEpinglee = await frozen.locator('[role="status"]').first().textContent();
    const texteAvant = (await frozen.textContent()) ?? '';
    await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.3);
    await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.5);
    await page.waitForTimeout(300); // laisser le temps à un survol de se propager, s'il le pouvait
    expect(await frozen.locator('[role="status"]').first().textContent()).toBe(dateEpinglee);
    expect((await frozen.textContent()) ?? '').toBe(texteAvant);

    // ⚠️ Échap RELÂCHE, il ne ferme pas : le panneau reste à l'écran et retombe sur aujourd'hui.
    // Un panneau qui se viderait sur Échap serait un écran qui perd son contenu sans qu'on ait rien
    // demandé — c'est la différence de fond avec l'infobulle qu'il remplace.
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-jour-epingle]')).toHaveCount(0, { timeout: 5_000 });
    await expect(page.locator('[data-panneau-jour]')).toBeVisible();
  });

  test('jour épinglé → « Détail complet » ouvre la modale (coexistence)', async ({ page }) => {
    const box = await chartBox(page);
    const frozen = await freezeViaClick(page, box);
    await frozen.getByRole('button', { name: /Détail complet/ }).click();
    // La modale exhaustive (aria-label distinct du tooltip figé).
    await expect(page.getByRole('dialog', { name: 'Détail du mois' })).toBeVisible({ timeout: 5_000 });
  });
});
