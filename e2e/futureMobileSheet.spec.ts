/**
 * Tests E2E — le PANNEAU DU JOUR sur téléphone, dans le flux du document.
 *
 * ⚠️ HISTOIRE DE CE FICHIER, et elle explique ce qu'il garde aujourd'hui. Il est né d'un retour de
 * Marc (2026-08-12) : « sur le tel c'est inutilisable trop petit trop cramped » — la boîte
 * flottante de 320 px recouvrait la moitié d'un écran de 390 px en restant illisible. La réponse
 * d'alors fut un BOTTOM SHEET : figer un jour ouvrait une feuille pleine largeur ancrée au bas du
 * viewport, avec un vrai bouton « Fermer » (« Échap » n'existe pas au doigt).
 *
 * `[FUTUR-PANNEAU-FIXE]` (2026-09-18) règle la cause plutôt que le symptôme : il n'y a plus
 * d'infobulle du tout. Le détail du jour est un panneau dans le FLUX du document, sous le graphe,
 * identique sur PC et sur téléphone — demande de Marc en toutes lettres. La feuille, le portail, la
 * bascule et le repositionnement n'ont donc plus d'objet, et les deux cas de ce fichier sont
 * INVERSÉS au même endroit (`UN-TEST-DE-LIMITE-S-INVERSE-IL-NE-SE-SUPPRIME-PAS`) : ils gardent
 * désormais ce que le panneau promet sur téléphone.
 *
 * Prouvé en géométrie réelle (viewport 390×844 tactile) :
 *   1. le panneau existe AVANT tout geste (état « aujourd'hui »), puis un tap épingle un jour ;
 *   2. il est dans le flux SOUS le graphe, en largeur pleine, avec ses quatre sections en ONGLETS ;
 *   3. le geste de RETOUR est visible et tactile (≥ 44 px), et il relâche sans rien faire
 *      disparaître ; 4. une rotation ne perd ni l'épingle ni le jour affiché ;
 *   5. la courbe elle-même reste plus haute qu'avant (≥ 55 dvh).
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
  const chart = page.getByRole('group', { name: /Courbe de vie/ });
  await expect(chart).toBeVisible({ timeout: 15_000 });
  await chart.scrollIntoViewIfNeeded();
  await page.locator('.recharts-cartesian-grid').first().waitFor({ state: 'visible', timeout: 15_000 });
  const box = await chart.boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

test.describe('Futur mobile — le panneau du jour, dans le flux', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(scriptBypassOnboarding());
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await activateTestMode(page);
    await page.goto('/#FUTURE');
    await page.waitForLoadState('domcontentloaded');
  });

  /**
   * ⚠️⚠️ INVERSION DES DEUX CAS DE CE FICHIER, et il faut lire pourquoi avant de croire qu'on a
   * perdu des protections.
   *
   * Ce fichier gardait le mode **bottom sheet** : sur téléphone, l'infobulle FIGÉE devenait une
   * feuille pleine largeur ancrée en bas, avec un bouton « Fermer » visible sans défiler. Ce mode
   * existait pour rattraper un défaut de la forme flottante — une boîte de 320 px qui recouvrait la
   * moitié d'un écran de téléphone en la rendant illisible (retour Marc, « trop cramped »). Le
   * second cas gardait le REPOSITIONNEMENT au basculement sheet ↔ flottant (rotation d'écran),
   * né d'un finding ÉLEVÉ : le portail remonté naissait à (0,0) et restait planté au coin.
   *
   * `[FUTUR-PANNEAU-FIXE]` (2026-09-18) supprime l'infobulle flottante : le détail du jour est un
   * PANNEAU dans le flux du document, sous le graphe, identique sur PC et sur téléphone (choix de
   * Marc : « un panneau fixe en dessous du graphe et pareil sur le téléphone »). Il n'y a donc plus
   * ni feuille, ni portail, ni bascule, ni position à recalculer — les deux exigences n'ont plus
   * d'objet.
   *
   * Ce qui les remplace, et que ces deux cas vérifient maintenant, c'est ce que le panneau PROMET
   * sur téléphone : il est dans le flux (pas ancré au bas du viewport), il occupe la largeur
   * disponible, il range ses quatre sections en ONGLETS, et il survit à une rotation sans rien
   * perdre — ni l'épingle, ni l'onglet ouvert.
   */
  test('[FUTUR-PANNEAU-FIXE] téléphone : le panneau est dans le FLUX sous le graphe, en ONGLETS', async ({ page }) => {
    const box = await chartBox(page);

    // La courbe mobile est plus HAUTE qu'avant (55dvh ≈ 464 px sur 844 ; l'ancien fixe = 380).
    expect(box.height).toBeGreaterThan(400);

    const panneau = page.locator('[data-panneau-jour]');
    // ⚠️ Le panneau est là AVANT tout geste : c'est le troisième état, celui qui n'existait pas
    // avec l'infobulle — au repos il montre AUJOURD'HUI.
    await expect(panneau).toBeAttached({ timeout: 5_000 });
    await expect(page.locator('[data-jour-epingle]')).toHaveCount(0);

    // Tap → épingle un jour. Les pastilles d'événement (denses au centre en mobile) ont leur
    // propre action (modale) : même motif d'évitement que futureDailySelect.
    const epingle = page.locator('[data-jour-epingle]');
    const modal = page.getByRole('dialog', { name: 'Détail du mois' });
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
      if (await epingle.count() > 0) break;
    }
    await expect(epingle).toHaveCount(1, { timeout: 5_000 });

    await panneau.scrollIntoViewIfNeeded();
    const pb = (await panneau.boundingBox())!;
    // Occupe la largeur disponible, sans être une feuille ancrée. [S5-REFONTE] Mesuré contre la zone de
    // contenu de <main> (marges de page ôtées) et non le viewport : les marges suivent les maquettes.
    const largeurContenu = await page.locator('main#main').evaluate((m) => {
      const cs = getComputedStyle(m);
      return m.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    });
    expect(pb.width).toBeGreaterThan(largeurContenu * 0.85);
    // ⚠️ DANS LE FLUX, donc SOUS le graphe : c'est la demande de Marc, et c'est aussi ce qui
    // distingue ce panneau de la feuille qu'il remplace (elle, collait au bas du viewport).
    expect(pb.y).toBeGreaterThanOrEqual(box.y);

    // Quatre ONGLETS (téléphone), pas quatre colonnes.
    const onglets = panneau.getByRole('tab');
    await expect(onglets).toHaveCount(4);
    await expect(panneau.getByRole('tabpanel')).toHaveCount(1); // un seul panneau monté

    // ⚠️ Le geste de RETOUR existe et il est VISIBLE : « Échap » n'existe pas au doigt.
    const retour = panneau.getByRole('button', { name: /Revenir à aujourd/ });
    await expect(retour).toBeVisible();
    const rb = (await retour.boundingBox())!;
    expect(rb.height).toBeGreaterThanOrEqual(43); // cible tactile ≥ 44 px (arrondi navigateur)
    await retour.tap();
    await expect(page.locator('[data-jour-epingle]')).toHaveCount(0);
    // Et le panneau RESTE : il retombe sur aujourd'hui, il ne disparaît pas.
    await expect(panneau).toBeAttached();
  });

  test('[FUTUR-PANNEAU-FIXE] rotation pendant un jour ÉPINGLÉ : rien n’est perdu', async ({ page }) => {
    // ⚠️ Ce cas remplace le garde-fou du repositionnement (finding ÉLEVÉ silent-failure #597) :
    // il n'y a plus de portail à remonter ni de position à recalculer, mais une rotation reste le
    // moment où une sélection peut se perdre en silence — le composant se re-rend, le breakpoint
    // change, et le panneau passe des onglets aux colonnes. C'est donc l'ÉPINGLE et le CONTENU
    // qui sont gardés, pas des coordonnées.
    const box = await chartBox(page);
    const panneau = page.locator('[data-panneau-jour]');
    const epingle = page.locator('[data-jour-epingle]');
    const modal = page.getByRole('dialog', { name: 'Détail du mois' });
    for (const [dx, dy] of [[box.width * 0.5, box.height * 0.78], [box.width * 0.3, box.height * 0.82], [box.width * 0.65, box.height * 0.75]] as Array<[number, number]>) {
      await page.touchscreen.tap(box.x + dx, box.y + dy);
      await page.waitForTimeout(500);
      if (await modal.isVisible().catch(() => false)) {
        await page.keyboard.press('Escape');
        await modal.waitFor({ state: 'hidden', timeout: 2_000 }).catch(() => {});
        continue;
      }
      if (await epingle.count() > 0) break;
    }
    await expect(epingle).toHaveCount(1, { timeout: 5_000 });
    const avant = await panneau.locator('[role="status"]').first().textContent();

    // « Rotation » : le viewport passe en paysage large (> 640px) → colonnes au lieu d'onglets.
    await page.setViewportSize({ width: 900, height: 700 });
    await page.waitForTimeout(400);

    await expect(epingle, 'la rotation ne doit pas relâcher l’épingle').toHaveCount(1);
    expect(await panneau.locator('[role="status"]').first().textContent()).toBe(avant);
    // Au-dessus du breakpoint, plus d'onglets : les quatre sections sont rendues ENSEMBLE.
    await expect(panneau.getByRole('tab')).toHaveCount(0);
    await expect(panneau.locator('section')).toHaveCount(4);
  });
});
