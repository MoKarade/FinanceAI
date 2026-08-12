/**
 * Tests E2E — [FUTUR-DAILY lot B étape 2] SÉLECTIONNER UN JOUR sur la courbe Futur.
 *
 * Demande de Marc (2026-08-11, correction de cap) : « je veux pas voir dans l'info bulle le détail
 * des jours de chaque mois, je veux pouvoir sélectionner chaque jour dans le graph ». La version
 * précédente listait les jours DANS l'infobulle — c'était lire, pas sélectionner.
 *
 * Ce qui est prouvé ici, en rendu RÉEL (jsdom rend le graphe en 0×0, donc rien de tout ceci n'est
 * testable en unitaire) :
 *   1. zoomer assez fort fait passer la courbe au JOUR — l'écran l'annonce ;
 *   2. cliquer dessus fige l'infobulle sur UN jour précis, daté au quantième ;
 *   3. deux clics à des abscisses différentes sélectionnent des jours DIFFÉRENTS (sinon « on peut
 *      sélectionner un jour » serait vrai en apparence et faux en pratique).
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

/** Zoome à la molette jusqu'à ce que la vue au jour s'active (ou épuise les essais). */
async function zoomIntoDays(page: Page, box: { x: number; y: number; width: number; height: number }) {
  const notice = page.getByText(/Vue au jour/);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  // ~28 crans suffisent en théorie (facteur 0,85 par cran, de ~450 points à 6). On en fait plus,
  // par salves, en ne sondant la visibilité que toutes les 10 salves : sonder à chaque cran coûtait
  // plus que le zoom lui-même et faisait expirer le test.
  for (let i = 0; i < 60; i++) {
    await page.mouse.wheel(0, -400);
    if (i % 10 === 9 && await notice.isVisible().catch(() => false)) return notice;
  }
  if (await notice.isVisible().catch(() => false)) return notice;
  throw new Error("Le zoom n'a jamais atteint la vue au jour");
}

test.describe('Futur — sélection d’un JOUR sur la courbe', () => {
  // Le zoom se fait cran par cran depuis la vue complète : plus long qu'un test d'UI ordinaire.
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(scriptBypassOnboarding());
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await activateTestMode(page);
    await page.goto('/#FUTURE');
    await page.waitForLoadState('domcontentloaded');
  });

  test('[FUTUR-DAILY-REACH] le bouton « Jour » atteint la vue au jour EN UN CLIC', async ({ page }) => {
    // ⚠️ Ce test existe parce que la fonctionnalité était livrée, testée, déployée — et malgré tout
    // INATTEIGNABLE pour Marc (« j'arrive toujours pas à voir jour par jour »). Le test de zoom
    // ci-dessous prouvait que la vue au jour EXISTE ; il ne prouvait pas qu'un humain puisse y
    // arriver, puisqu'il déclenchait la molette 60 fois de suite. Ici on prouve le CHEMIN : un clic.
    await chartBox(page);
    await page.getByRole('button', { name: 'Jour', exact: true }).click();
    await expect(page.getByText(/Vue au jour/)).toBeVisible({ timeout: 10_000 });
    // [FUTUR-DAILY-FULL] L'écran ne s'excuse plus de masquer les comptes : il annonce que TOUS les
    // montants sont ceux du jour. L'ancienne assertion cherchait « répartition entre tes comptes »,
    // la phrase du bandeau qui expliquait pourquoi les aires disparaissaient — elle est PÉRIMÉE.
    await expect(page.getByText(/tous les montants sont ceux de ce/)).toBeVisible();

    // [FUTUR-DAILY-INFOBULLE-ONLY] Le tableau jour-par-jour sous la courbe a été RETIRÉ (demande
    // Marc : « juste dans l'infobulle […] pas de nouvel onglet ou quoi »). Ces textes étaient les
    // siens — s'ils réapparaissent, quelqu'un a réintroduit une deuxième surface de détail.
    await expect(page.getByText('Détail jour par jour')).toHaveCount(0);
    await expect(page.getByText(/Zoome davantage pour voir le détail/)).toHaveCount(0);

    // [FUTUR-DAILY-ZOOM-DEEP] On peut zoomer PLUS que la fenêtre du bouton (demande Marc : « je veux
    // pouvoir zoommer un peu plus pour pouvoir voir les jours individuels »). Sonde MESURABLE : la
    // table sr-only échantillonne au-delà de 40 lignes — à ~150 jours sa légende dit « échantillonnés
    // sur N » ; une fois descendu à ~1 mois (≤ 40 jours), la mention DISPARAÎT. Avant ce lot, le
    // plancher de zoom bloquait à ~150 jours : cette assertion était INATTEIGNABLE, donc elle
    // discrimine par construction.
    await expect(page.getByText(/échantillonnés sur/)).toBeVisible();
    // ⚠️ RE-SCROLLER puis RE-MESURER après le clic (leçon d'hier, même fichier) : le bandeau
    // « Vue au jour » décale la page, et le centre du graphe peut sortir du viewport — une molette
    // hors viewport ne zoome RIEN, silencieusement (mesuré : la fenêtre restait à 153 jours).
    const zoomChart = page.getByRole('img', { name: /Courbe de vie/ });
    await zoomChart.scrollIntoViewIfNeeded();
    const zoomBox = (await zoomChart.boundingBox())!;
    const wheelY = Math.max(24, Math.min(zoomBox.y + zoomBox.height / 2, (page.viewportSize()?.height ?? 720) - 24));
    await page.mouse.move(zoomBox.x + zoomBox.width / 2, wheelY);
    for (let i = 0; i < 30; i++) {
      await page.mouse.wheel(0, -400);
      if (i % 5 === 4 && await page.getByText(/échantillonnés sur/).count() === 0) break;
    }
    await expect(page.getByText(/Vue au jour/)).toBeVisible();
    await expect(page.getByText(/échantillonnés sur/)).toHaveCount(0);
  });

  test('zoomer fort passe la courbe au jour, et un clic fige UN jour précis', async ({ page }) => {
    const box = await chartBox(page);
    const notice = await zoomIntoDays(page, box);

    // L'écran DIT ce qu'il montre : les montants du jour, et ce qui reste réparti faute de date.
    await expect(notice).toBeVisible();
    await expect(page.getByText(/tous les montants sont ceux de ce/)).toBeVisible();

    // [FUTUR-DAILY-FULL] LE VRAI LIVRABLE, mesuré et pas déduit : les aires par compte sont RENDUES
    // en vue jour. C'est ce qui manquait — le moteur ne ventilait qu'au mois, donc la vue au jour ne
    // portait que la valeur nette et l'écran masquait les comptes. Une assertion sur le seul texte
    // du bandeau resterait verte si la ventilation ne produisait rien.
    await expect(page.locator('.recharts-area-area').first()).toBeVisible();
    expect(await page.locator('.recharts-area').count()).toBeGreaterThan(1);

    const frozen = page.locator('[data-frozen-tooltip]');
    const modal = page.getByRole('dialog', { name: 'Détail du mois' });

    // ⚠️ RE-MESURER le graphe APRÈS le zoom : les 60 crans de molette finissent par défiler la page
    // une fois le plancher de zoom atteint, donc la boîte d'avant est périmée.
    //
    // ⚠️ ET SURTOUT — ce clic à 80 % de la hauteur tombe DANS les aires empilées, volontairement.
    // C'est la garde de `[FUTUR-CLICK-AREA]` : sur une aire (`path.recharts-area-area`), le
    // navigateur ne dispatche AUCUN événement `click` (recharts re-rend le path entre le
    // pointerdown et le pointerup), alors qu'il en dispatche un sur l'espace vide du graphe.
    // Cliquer sur la partie colorée de la courbe ne figeait donc jamais l'infobulle — un défaut
    // ANTÉRIEUR à la vue au jour, resté invisible parce que ce test cliquait dans le vide au-dessus
    // de la pile. Si quelqu'un repasse le conteneur de `pointerup` à `click`, ce test échoue.
    const zoomedBox = (await page.getByRole('img', { name: /Courbe de vie/ }).boundingBox())!;
    const y = Math.min(zoomedBox.y + zoomedBox.height * 0.8, (page.viewportSize()?.height ?? 720) - 24);

    // Clique à deux abscisses ÉLOIGNÉES et relève la date figée à chaque fois.
    const dates: string[] = [];
    for (const fx of [0.25, 0.75]) {
      await page.mouse.click(zoomedBox.x + zoomedBox.width * fx, y);
      if (await modal.isVisible().catch(() => false)) {
        await page.keyboard.press('Escape');
        await modal.waitFor({ state: 'hidden', timeout: 2_000 }).catch(() => {});
        await page.mouse.click(zoomedBox.x + zoomedBox.width * fx, y - 30);
      }
      await expect(frozen).toBeVisible({ timeout: 5_000 });
      const txt = (await frozen.textContent()) ?? '';
      // Un point QUOTIDIEN porte une date NUMÉRIQUE complète — « lun. 14/09/2026 » — alors qu'un
      // point mensuel n'a que « janv. 2030 ». Ce sont les barres obliques qui prouvent qu'on a
      // sélectionné un JOUR : Marc a signalé DEUX fois que le libellé ne montrait « pas le jour »,
      // d'abord en ISO (illisible), puis avec un mois abrégé (trop proche du libellé mensuel).
      const m = txt.match(/\b\d{2}\/\d{2}\/\d{4}\b/);
      expect(m, `aucune date au jour dans l'infobulle figée (fx=${fx}) : ${txt.slice(0, 200)}`).not.toBeNull();
      dates.push(m![0]);
      await page.keyboard.press('Escape');
      await frozen.waitFor({ state: 'hidden', timeout: 2_000 }).catch(() => {});
    }

    // Deux abscisses éloignées = deux jours DIFFÉRENTS. Sans cette assertion, un composant qui
    // renverrait toujours le même jour passerait le test précédent.
    expect(dates[0]).not.toBe(dates[1]);
  });

  test('[FUTUR-DAILY-SELECT-PATH] depuis la vue LARGE : clic sur un mois → « Voir ce mois jour par jour » → vue au jour → « Lendemain » avance d’un jour exactement', async ({ page }) => {
    // ⚠️ Ce test rejoue le scénario EXACT de Marc (capture 2026-08-12 : infobulle « mai 2027 »,
    // « je peux pas selectionner de jour juste un mois ») : il est en vue large, il clique, il veut
    // un jour. Avant ce lot, RIEN au moment du clic n'offrait le chemin — la vue au jour exigeait
    // de zoomer sous 6 mois d'abord, un seuil invisible (3e occurrence de UX-UNREACHABLE).
    const box = await chartBox(page);
    const frozen = page.locator('[data-frozen-tooltip]');
    const modal = page.getByRole('dialog', { name: 'Détail du mois' });

    // 1. Vue LARGE (aucun zoom) : clic dans les aires → infobulle MENSUELLE figée.
    const y = Math.min(box.y + box.height * 0.8, (page.viewportSize()?.height ?? 720) - 24);
    await page.mouse.click(box.x + box.width * 0.35, y);
    if (await modal.isVisible().catch(() => false)) {
      await page.keyboard.press('Escape');
      await modal.waitFor({ state: 'hidden', timeout: 2_000 }).catch(() => {});
      await page.mouse.click(box.x + box.width * 0.35, y - 30);
    }
    await expect(frozen).toBeVisible({ timeout: 5_000 });

    // 1bis. [FUTUR-TOOLTIP-STICKY-ACTIONS] Le bouton est VISIBLE SANS DÉFILER dans l'infobulle.
    // ⚠️ `getByRole().click()` seul ne prouve RIEN ici : Playwright SCROLLE l'élément en vue avant
    // de cliquer — c'est exactement comme ça que le pied sous le pli est resté invisible pour Marc
    // (capture 2026-08-12 : contenu réel > 480 px, boutons jamais vus) pendant que l'e2e passait.
    // On mesure donc la GÉOMÉTRIE avant tout scroll : le bas du bouton doit tenir dans la boîte
    // visible du tooltip. NB : ne discrimine que si le contenu déborde `max-h-[480px]` — le verrou
    // permanent est le test unitaire des classes sticky ; ceci est la vérification d'effet.
    const zoomBtn = frozen.getByRole('button', { name: /Voir ce mois jour par jour/ });
    const btnBox = (await zoomBtn.boundingBox())!;
    const tipBox = (await frozen.boundingBox())!;
    expect(btnBox.y + btnBox.height, 'le pied d’actions dépasse la zone visible du tooltip figé')
      .toBeLessThanOrEqual(tipBox.y + tipBox.height + 2);

    // 2. Le chemin est OFFERT dans l'infobulle : un clic → vue au jour, centrée sur CE mois.
    await zoomBtn.click();
    await expect(page.getByText(/Vue au jour/)).toBeVisible({ timeout: 10_000 });
    // L'infobulle mensuelle est RELÂCHÉE (la garder figée au-dessus d'une courbe au jour mentirait).
    await expect(frozen).toBeHidden();

    // 3. Clic sur la courbe au jour → un JOUR figé, daté au quantième.
    const zoomedBox = (await page.getByRole('img', { name: /Courbe de vie/ }).boundingBox())!;
    const y2 = Math.min(zoomedBox.y + zoomedBox.height * 0.8, (page.viewportSize()?.height ?? 720) - 24);
    await page.mouse.click(zoomedBox.x + zoomedBox.width * 0.5, y2);
    if (await modal.isVisible().catch(() => false)) {
      await page.keyboard.press('Escape');
      await modal.waitFor({ state: 'hidden', timeout: 2_000 }).catch(() => {});
      await page.mouse.click(zoomedBox.x + zoomedBox.width * 0.5, y2 - 30);
    }
    await expect(frozen).toBeVisible({ timeout: 5_000 });
    const d1 = ((await frozen.textContent()) ?? '').match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
    expect(d1, 'aucune date au jour après « Voir ce mois jour par jour »').not.toBeNull();

    // 4. « Lendemain » avance d'EXACTEMENT un jour — la sélection fine ne demande plus de viser
    //    au pixel (un jour ≈ 6 px à ~150 jours affichés, mesuré à la sonde).
    await frozen.getByRole('button', { name: /Lendemain/ }).click();
    await expect(frozen).toBeVisible();
    const d2 = ((await frozen.textContent()) ?? '').match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
    expect(d2).not.toBeNull();
    const toUtc = (m: RegExpMatchArray) => Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    expect(toUtc(d2!) - toUtc(d1!)).toBe(24 * 3600 * 1000);
  });
});
