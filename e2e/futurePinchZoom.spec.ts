/**
 * Tests E2E — [FUTUR-DAILY-TOUCH] PINCEMENT 2 doigts sur la courbe Futur (rendu et gestes RÉELS).
 *
 * Demande de Marc (2026-08-12) : « je veux pouvoir zoomer parce que pour l'instant sur le tel
 * c'est inutilisable trop petit trop cramped impossible ». Cadrage validé : tous les graphes
 * (le hook partagé `useTimeChartZoom` couvre les 9 consommateurs), 2 doigts = zoom du graphe,
 * 1 doigt = la page scrolle.
 *
 * Le pincement est synthétisé par le protocole CDP (`Input.synthesizePinchGesture`) dans un
 * contexte TACTILE (`hasTouch`) : ce sont de VRAIS événements touch qui traversent tout le
 * pipeline (touch-action posé par le hook, listeners non-passifs, preventDefault) — pas un
 * appel direct aux handlers.
 *
 * Prouvé ici :
 *   1. écarter les doigts = la fenêtre se resserre (le préset « Tout » perd son état actif) ;
 *   2. le geste inverse ramène vers la vue large ;
 *   3. la fin du pincement ne FIGE PAS un jour (le lever du 2e doigt émettait un pointerup
 *      crédible — garde isPinchActive) ;
 *   4. un glisser VERTICAL à 1 doigt scrolle la PAGE (touch-action: pan-y réellement respecté).
 */
import { test, expect, type Page } from '@playwright/test';
import { scriptBypassOnboarding, activateTestMode } from './helpers/setup';

const localChromium = process.env.PW_LOCAL_CHROMIUM;
if (localChromium) test.use({ launchOptions: { executablePath: localChromium } });

// Contexte téléphone : tactile + viewport mobile (le scénario exact de Marc).
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

/** Le préset « Tout » est actif (bg-primary) UNIQUEMENT en vue complète — c'est l'observable
 *  d'`isZoomed` côté écran, sans lire l'état React. */
function toutIsActive(page: Page) {
  return page.getByRole('button', { name: 'Tout', exact: true })
    .evaluate((el) => el.className.includes('bg-primary'));
}

/**
 * ⚠️ [E2E-PINCH-ZOOM-FLAKE] Ne JAMAIS lire `toutIsActive` d'un seul échantillon après un geste.
 *
 * MESURÉ le 2026-08-24 (sonde, 3/3 identiques) : juste après le `touchmove` à 2 doigts, le préset
 * « Tout » est ENCORE actif — la bascule met **2,1 à 2,3 s** (2301 / 2124 / 2174 ms). `scheduleRange`
 * du hook passe par `requestAnimationFrame`, puis la fenêtre re-tranche toute la série et React
 * re-rend : c'est du CALCUL, pas une frame.
 *
 * Le test passait quand même, par ACCIDENT : pendant ce recalcul le bouton se détache, donc
 * `getByRole(...).evaluate` re-tentait et lisait la classe d'APRÈS. Quand il ne se détache pas
 * (runner chargé, ordonnancement différent), la lecture unique renvoie l'état d'AVANT — c'est
 * l'échec vu 3 fois d'affilée en CI le 2026-08-24 (run 32788363471, tentative 1), VERT au rejeu du
 * MÊME sha. Attendre une TRANSITION se fait par `expect.poll` ; vérifier une NON-transition exige
 * au contraire de laisser passer le budget mesuré avant de lire.
 */
const BUDGET_BASCULE_MS = 4_000; // ~2× la bascule mesurée (2,3 s max)

/** La transition a EU LIEU (ré-échantillonne jusqu'au budget — jamais un tir unique). */
function attendreTout(page: Page, actif: boolean) {
  return expect.poll(() => toutIsActive(page), { timeout: BUDGET_BASCULE_MS + 4_000 }).toBe(actif);
}

async function pinch(page: Page, x: number, y: number, scaleFactor: number) {
  const client = await page.context().newCDPSession(page);
  // ⚠️ gestureSourceType: 'touch' OBLIGATOIRE : « default » choisit la source de la PLATEFORME —
  // en desktop headless c'est la molette (ctrl+wheel / wheel), et le test validerait alors le
  // chemin souris déjà couvert ailleurs, pas le tactile (mesuré : le glisser « default » ne
  // bougeait rien parce qu'il émettait du wheel que le hook preventDefault).
  await client.send('Input.synthesizePinchGesture', { x, y, scaleFactor, relativeSpeed: 600, gestureSourceType: 'touch' });
  await client.detach();
  await page.waitForTimeout(250); // laisse les frames rAF du hook committer
}

test.describe('Futur — pincement 2 doigts (contexte tactile réel)', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(scriptBypassOnboarding());
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await activateTestMode(page);
    await page.goto('/#FUTURE');
    await page.waitForLoadState('domcontentloaded');
  });

  test('[FUTUR-DAILY-TOUCH] écarter = zoom, geste inverse = dézoom, sans figer de jour', async ({ page }) => {
    const box = await chartBox(page);
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    expect(await toutIsActive(page)).toBe(true); // vue complète au départ

    // Écarter les doigts (scaleFactor > 1) → la fenêtre se resserre.
    await pinch(page, cx, cy, 3);
    await attendreTout(page, false);

    // La fin du pincement n'a PAS figé de jour (le lever du 2e doigt émet un pointerup crédible).
    await expect(page.locator('[data-frozen-tooltip]')).toHaveCount(0);

    // Resserrer (scaleFactor < 1) → retour vers la vue large. ⚠️ Gestes MODÉRÉS (0,5 ×3) : le
    // synthétiseur CDP est VERTICAL et un dézoom démarre doigts ÉCARTÉS — à 0,25 l'écart de
    // départ dépasse la boîte du graphe (380 px de haut), les touches naissent HORS du conteneur
    // et le hook ne voit rien (mesuré par sonde : 0,25 inerte, 0,5 ×3 revient à « Tout » actif).
    await pinch(page, cx, cy, 0.5);
    await pinch(page, cx, cy, 0.5);
    await pinch(page, cx, cy, 0.5);
    await attendreTout(page, true);
  });

  test('[FUTUR-DAILY-TOUCH] un doigt n’est JAMAIS capturé par le graphe (contrat pan-y)', async ({ page }) => {
    // ⚠️ Pourquoi pas « le scroll bouge » : mesuré par sonde, `synthesizeScrollGesture` tactile ne
    // défile RIEN dans cette émulation headless, même HORS du graphe (aucun conteneur défilable,
    // window inerte des deux côtés) — l'observable de scroll mesurerait l'émulation, pas le hook.
    // Le contrat du hook, lui, est testable de bout en bout : 1 doigt = événements NON annulés
    // (le navigateur garde la main pour scroller) + touch-action pan-y ; 2 doigts = annulés.
    await chartBox(page);
    const dispatchTouches = (types: Array<[string, Array<[number, number]>]>) =>
      page.evaluate((seq) => {
        const el = document.querySelector('.chart-fullscreen') as HTMLElement;
        const r = el.getBoundingClientRect();
        return seq.map(([type, pts]) => {
          const e = new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            touches: (pts as Array<[number, number]>).map(([dx, dy], i) => new Touch({
              identifier: i, target: el, clientX: r.left + dx, clientY: r.top + dy,
            })),
          });
          el.dispatchEvent(e);
          return e.defaultPrevented;
        });
      }, types);

    expect(await page.evaluate(() =>
      getComputedStyle(document.querySelector('.chart-fullscreen') as HTMLElement).touchAction,
    )).toBe('pan-y'); // vertical 1 doigt = le NAVIGATEUR scrolle

    // 1 doigt : événements JAMAIS annulés (le scroll de page reste possible), rien ne zoome,
    // rien ne se fige.
    const solo = await dispatchTouches([
      ['touchstart', [[100, 100]]], ['touchmove', [[100, 160]]], ['touchend', []],
    ]);
    expect(solo).toEqual([false, false, false]);
    // ⚠️ Lecture APRÈS le budget de bascule : lue immédiatement, cette assertion serait vraie
    // même si un zoom était en train de se committer (cf. l'en-tête de `attendreTout`).
    await page.waitForTimeout(BUDGET_BASCULE_MS);
    expect(await toutIsActive(page)).toBe(true);
    await expect(page.locator('[data-frozen-tooltip]')).toHaveCount(0);

    // 2 doigts : annulés (le geste appartient au graphe) — et il zoome RÉELLEMENT
    // (« Tout » perd son état actif : preuve que le pincement construit a traversé le hook).
    const duo = await dispatchTouches([
      ['touchstart', [[80, 100], [120, 100]]], ['touchmove', [[40, 100], [160, 100]]],
    ]);
    expect(duo).toEqual([true, true]);
    await attendreTout(page, false);
  });
});
