/**
 * Tests E2E — [FUTUR-DAILY lot B] L'axe X du graphe Futur est NUMÉRIQUE, et ses ancrages restent
 * alignés sur la zone de tracé.
 *
 * POURQUOI EN E2E ET PAS EN UNITAIRE : la position d'un `ReferenceLine` est calculée par l'échelle
 * de recharts au rendu, avec un vrai viewport (jsdom rend le graphe en 0×0). Un désalignement de
 * l'axe est INVISIBLE en unitaire et SILENCIEUX à l'écran — le graphe reste beau, il ment juste
 * d'un mois. C'est le risque exact qui rendait ce chantier délicat.
 *
 * Les deux invariants ci-dessous ont été prouvés DISCRIMINANTS par mesure dans trois états
 * (valeurs en coordonnées SVG, zone de tracé x ∈ [70, 1056]) :
 *
 *   état                              frontière x=0   bande passé (x, largeur)
 *   axe catégoriel (avant)            123,38          70 ; 54,35     → invariant 1 ÉCHOUE (écart 0,97)
 *   axe numérique SANS domaine        316,50          283,22 ; 33,28 → invariant 2 ÉCHOUE (bande décalée)
 *   axe numérique AVEC domaine        122,51          70 ; 52,51     → les deux passent
 *
 * Le domaine explicite n'est donc pas une précaution de style : sans lui, recharts part de 0 et tout
 * le préfixe PASSÉ (monthIndex négatifs) est écrasé à droite, jalons compris.
 */
import { test, expect } from '@playwright/test';
import { scriptBypassOnboarding, activateTestMode } from './helpers/setup';

// Env cloud : le @playwright/test du repo attend une révision chromium plus récente que la
// préinstallée → pointer sur le binaire présent (même motif que futureIcons.spec.ts).
const localChromium = process.env.PW_LOCAL_CHROMIUM;
if (localChromium) test.use({ launchOptions: { executablePath: localChromium } });

test.describe('Futur — ancrages de l’axe X numérique', () => {
  test('la bande du passé part du bord du tracé et finit EXACTEMENT sur la frontière', async ({ page }) => {
    await page.addInitScript(scriptBypassOnboarding());
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await activateTestMode(page);
    await page.goto('/#FUTURE');
    await page.waitForLoadState('domcontentloaded');

    const voirDirect = page.getByRole('button', { name: /projection actuelle.*sans optimiser/i });
    await voirDirect.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
    if (await voirDirect.isVisible().catch(() => false)) await voirDirect.click();

    await page.locator('.recharts-cartesian-grid').first().waitFor({ state: 'visible', timeout: 15_000 });
    await page.locator('.recharts-area-area, .recharts-area path').first().waitFor({ state: 'attached', timeout: 15_000 });
    await page.locator('.recharts-reference-area-rect').first().waitFor({ state: 'attached', timeout: 15_000 });

    const geom = await page.evaluate(() => {
      const num = (el: Element | null, a: string) => (el ? Number(el.getAttribute(a)) : NaN);
      // Une ligne de grille HORIZONTALE donne la zone de tracé : elle la traverse de bord à bord.
      const gridLine = document.querySelector('.recharts-cartesian-grid-horizontal line');
      const areaRect = document.querySelector('.recharts-reference-area-rect');
      // Les `ReferenceLine` VERTICALES (x1 === x2) : la frontière passé/futur est la plus à gauche.
      const verticals = Array.from(document.querySelectorAll('line.recharts-reference-line-line'))
        .map((l) => ({ x1: Number(l.getAttribute('x1')), x2: Number(l.getAttribute('x2')) }))
        .filter((l) => Number.isFinite(l.x1) && l.x1 === l.x2)
        .map((l) => l.x1)
        .sort((a, b) => a - b);
      return {
        plotLeft: num(gridLine, 'x1'),
        plotRight: num(gridLine, 'x2'),
        areaX: num(areaRect, 'x'),
        areaW: num(areaRect, 'width'),
        firstVertical: verticals[0],
      };
    });

    expect(geom.plotRight).toBeGreaterThan(geom.plotLeft);
    expect(Number.isFinite(geom.firstVertical)).toBe(true);

    // (1) La bande du passé COMMENCE au bord gauche du tracé. Échoue si le domaine de l'axe ne
    //     couvre pas les monthIndex NÉGATIFS : tout le passé serait alors repoussé vers la droite.
    expect(Math.abs(geom.areaX - geom.plotLeft)).toBeLessThan(1);

    // (2) Elle FINIT exactement sur la frontière « Passé réel ⟵ ». Zone et ligne sont deux ancrages
    //     INDÉPENDANTS (`ReferenceArea x2={0}` et `ReferenceLine x={0}`) : leur coïncidence prouve
    //     que l'axe place une même abscisse au même endroit, quel que soit le type d'ancrage.
    expect(Math.abs((geom.areaX + geom.areaW) - geom.firstVertical)).toBeLessThan(0.5);

    // La bande doit avoir une largeur RÉELLE — sinon les deux tests ci-dessus seraient vrais par
    // dégénérescence (une bande de largeur nulle collée au bord passerait tout).
    expect(geom.areaW).toBeGreaterThan(5);
  });
});
