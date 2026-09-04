/**
 * Tests E2E — [FUTUR-DAILY-NATIVE] SÉLECTIONNER UN JOUR sur la courbe Futur, DIRECTEMENT.
 *
 * Demande de Marc (2026-08-12, après QUATRE itérations d'affordances intermédiaires) : « je veux
 * pas un bouton je veux pouvoir selectionner sur la courbe direct ». Cadrage validé 3/3 : clic =
 * jour PARTOUT (même vue 30 ans), survol = jour, courbe TRACÉE au jour. Les chemins intermédiaires
 * (bouton « Jour », bouton « Voir ce mois jour par jour », seuil de 6 mois) ont été RETIRÉS.
 *
 * Ce qui est prouvé ici, en rendu RÉEL (jsdom rend le graphe en 0×0, rien de tout ceci n'est
 * testable en unitaire) :
 *   1. dès l'arrivée, SANS AUCUN ZOOM, la courbe est au jour et l'écran le dit ;
 *   2. un clic en vue LARGE fige UN jour précis, daté au quantième (JJ/MM/AAAA) ;
 *   3. deux abscisses éloignées = deux jours DIFFÉRENTS (sinon « sélectionner un jour » serait
 *      vrai en apparence et faux en pratique) ;
 *   4. « Lendemain » avance d'exactement un jour — sans re-viser au pixel ;
 *   5. le zoom continue de fonctionner et la courbe reste au jour à toute fenêtre ;
 *   6. gardes de POIDS : la Bar des impôts ne rend pas ~11 000 rects à hauteur nulle.
 */
import { test, expect, type Page } from '@playwright/test';
import { scriptBypassOnboarding, activateTestMode } from './helpers/setup';

// Env cloud : le @playwright/test du repo attend une révision chromium plus récente que la
// préinstallée → pointer sur le binaire présent (même motif que futureIcons.spec.ts).
const localChromium = process.env.PW_LOCAL_CHROMIUM;
if (localChromium) test.use({ launchOptions: { executablePath: localChromium } });

async function chartBox(page: Page) {
  const voirDirect = page.getByRole('button', { name: /projection actuelle.*sans optimiser/i });
  await voirDirect.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
  if (await voirDirect.isVisible().catch(() => false)) await voirDirect.click();
  const chart = page.getByRole('img', { name: /Courbe de vie/ });
  await expect(chart).toBeVisible({ timeout: 15_000 });
  await chart.scrollIntoViewIfNeeded();
  await page.locator('.recharts-cartesian-grid').first().waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('.recharts-area-area, .recharts-area path').first().waitFor({ state: 'attached', timeout: 15_000 });
  const box = await chart.boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

/** Clique dans les aires en évitant la modale des pastilles d'événement (garde CLICK-AREA). */
async function clickAndFreeze(page: Page, x: number, y: number) {
  const frozen = page.locator('[data-frozen-tooltip]');
  const modal = page.getByRole('dialog', { name: 'Détail du mois' });
  await page.mouse.click(x, y);
  if (await modal.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
    await modal.waitFor({ state: 'hidden', timeout: 2_000 }).catch(() => {});
    await page.mouse.click(x, y - 30);
  }
  await expect(frozen).toBeVisible({ timeout: 5_000 });
  return frozen;
}

const DAY_RE = /\b(\d{2})\/(\d{2})\/(\d{4})\b/;

test.describe('Futur — sélection d’un JOUR directement sur la courbe (natif)', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(scriptBypassOnboarding());
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await activateTestMode(page);
    await page.goto('/#FUTURE');
    await page.waitForLoadState('domcontentloaded');
  });

  test('[FUTUR-DAILY-NATIVE] vue LARGE, ZÉRO zoom : la courbe est au jour, un clic fige un jour daté, deux clics = deux jours', async ({ page }) => {
    const box = await chartBox(page);

    // 1. L'écran annonce la courbe au jour D'EMBLÉE — aucun seuil, aucun bouton à connaître.
    await expect(page.getByText(/Courbe au jour/)).toBeVisible({ timeout: 10_000 });
    // Les chemins intermédiaires retirés ne doivent PAS réapparaître :
    await expect(page.getByRole('button', { name: 'Jour', exact: true })).toHaveCount(0);
    await expect(page.getByText(/Vue au jour indisponible/)).toHaveCount(0);

    // 2-3. Deux clics à des abscisses éloignées, en vue 30 ans, SANS zoomer : deux JOURS distincts.
    // ⚠️ Le clic à 80 % de hauteur tombe DANS les aires empilées, volontairement (garde
    // [FUTUR-CLICK-AREA] : `pointerup`, pas `click` — recharts re-rend le path sous le pointeur).
    const y = Math.min(box.y + box.height * 0.8, (page.viewportSize()?.height ?? 720) - 24);
    const dates: string[] = [];
    for (const fx of [0.25, 0.75]) {
      const frozen = await clickAndFreeze(page, box.x + box.width * fx, y);
      const txt = (await frozen.textContent()) ?? '';
      // Les barres obliques prouvent le JOUR (« lun. 14/09/2026 ») — un point mensuel n'a que
      // « janv. 2030 », et Marc a signalé deux fois un libellé qui « ne montre pas le jour ».
      const m = txt.match(DAY_RE);
      expect(m, `aucune date au jour dans l'infobulle figée en vue LARGE (fx=${fx}) : ${txt.slice(0, 200)}`).not.toBeNull();
      dates.push(m![0]);
      await page.keyboard.press('Escape');
      await frozen.waitFor({ state: 'hidden', timeout: 2_000 }).catch(() => {});
    }
    expect(dates[0]).not.toBe(dates[1]);
  });

  test('[FUTUR-CLICK-ANYWHERE] le clic fige un jour PARTOUT dans la zone du graphe — ciel vide, bord des axes, pas seulement le tracé', async ({ page }) => {
    // Retour Marc 2026-08-12 : « je dois cliquer exactement sur la courbe, je veux pouvoir cliquer
    // n'importe où ». Le mécanisme résout le jour par l'ABSCISSE seule (resolvePointByX sur le
    // conteneur entier, pointerup) — ce test PROUVE qu'aucune zone morte ne subsiste : le CIEL
    // au-dessus de la pile (l'ordonnée n'y croise aucune aire), la bande BASSE près de l'axe des
    // dates, et la marge GAUCHE (l'abscisse y est clampée au premier jour visible). Le tracé
    // lui-même est déjà couvert par le test « deux clics = deux jours » (y = 80 %).
    const box = await chartBox(page);
    const vpH = page.viewportSize()?.height ?? 720;
    const spots: Array<[string, number, number]> = [
      ['ciel vide au-dessus de la pile', box.x + box.width * 0.6, box.y + box.height * 0.08],
      ['bande basse près de l\'axe des dates', box.x + box.width * 0.45, Math.min(box.y + box.height * 0.93, vpH - 24)],
      ['marge gauche (axe des montants)', box.x + 10, box.y + box.height * 0.5],
    ];
    for (const [nom, x, y] of spots) {
      const frozen = await clickAndFreeze(page, x, y);
      const txt = (await frozen.textContent()) ?? '';
      expect(txt.match(DAY_RE), `zone morte au clic : ${nom} — ${txt.slice(0, 120)}`).not.toBeNull();
      await page.keyboard.press('Escape');
      await frozen.waitFor({ state: 'hidden', timeout: 2_000 }).catch(() => {});
    }
  });

  test('[FUTUR-DAILY-NATIVE] vue LARGE : « Lendemain » avance d’exactement un jour, et le pied d’actions est visible sans défiler', async ({ page }) => {
    // Le scénario EXACT de Marc, sans étape intermédiaire : vue 30 ans, clic → jour figé → flèche.
    const box = await chartBox(page);
    const y = Math.min(box.y + box.height * 0.8, (page.viewportSize()?.height ?? 720) - 24);
    const frozen = await clickAndFreeze(page, box.x + box.width * 0.35, y);
    const d1 = ((await frozen.textContent()) ?? '').match(DAY_RE);
    expect(d1, 'le clic en vue large n’a pas figé un jour daté').not.toBeNull();

    // [FUTUR-TOOLTIP-STICKY-ACTIONS] GÉOMÉTRIE avant tout scroll : le pied d'actions tient dans la
    // boîte visible du tooltip (Playwright scrolle avant de cliquer — un `click()` vert ne prouve
    // aucune visibilité ; leçon de la veille, même écran).
    const nextBtn = frozen.getByRole('button', { name: /Lendemain/ });
    const btnBox = (await nextBtn.boundingBox())!;
    const tipBox = (await frozen.boundingBox())!;
    expect(btnBox.y + btnBox.height, 'le pied d’actions dépasse la zone visible du tooltip figé')
      .toBeLessThanOrEqual(tipBox.y + tipBox.height + 2);

    await nextBtn.click();
    await expect(frozen).toBeVisible();
    const d2 = ((await frozen.textContent()) ?? '').match(DAY_RE);
    expect(d2).not.toBeNull();
    const toUtc = (m: RegExpMatchArray) => Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    expect(toUtc(d2!) - toUtc(d1!)).toBe(24 * 3600 * 1000);
  });

  test('[FUTUR-DAILY-NATIVE] zoomé : toujours au jour, aires par compte rendues, clic dans les aires OK', async ({ page }) => {
    const box = await chartBox(page);
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    for (let i = 0; i < 40; i++) await page.mouse.wheel(0, -400);

    // La courbe reste au jour (elle l'était déjà) et les aires par compte sont RENDUES.
    await expect(page.getByText(/Courbe au jour/)).toBeVisible();
    await expect(page.locator('.recharts-area-area').first()).toBeVisible();
    expect(await page.locator('.recharts-area').count()).toBeGreaterThan(1);

    // Clic DANS les aires après zoom (la boîte a pu bouger — re-mesurer).
    const zoomedBox = (await page.getByRole('img', { name: /Courbe de vie/ }).boundingBox())!;
    const y = Math.min(zoomedBox.y + zoomedBox.height * 0.8, (page.viewportSize()?.height ?? 720) - 24);
    const frozen = await clickAndFreeze(page, zoomedBox.x + zoomedBox.width * 0.5, y);
    expect(((await frozen.textContent()) ?? '').match(DAY_RE)).not.toBeNull();
  });

  test('[FUTUR-DAILY-NATIVE] garde de POIDS : la Bar des impôts ne rend pas un rect par jour', async ({ page }) => {
    await chartBox(page);
    await expect(page.getByText(/Courbe au jour/)).toBeVisible({ timeout: 10_000 });
    // `FluxImpots` n'existe que les jours d'échéance (~1/an sur ~30 ans) : quelques dizaines de
    // rects au plus. ~11 000 rects = la Bar lit la série entière, la garde `dailyAll` a sauté.
    const rects = await page.locator('.recharts-bar-rectangle').count();
    expect(rects, `${rects} rects rendus par la Bar des impôts — un par jour au lieu d'un par échéance`).toBeLessThan(80);
  });
});
