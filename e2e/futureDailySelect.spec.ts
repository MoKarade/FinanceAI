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

/**
 * Clique dans les aires en évitant la modale des pastilles d'événement (garde CLICK-AREA).
 *
 * ⚠️ [FUTUR-PANNEAU-FIXE 2026-09-18] Le marqueur est `[data-jour-epingle]` et NON plus
 * `[data-frozen-tooltip]`, et ce n'est pas un renommage. Le panneau du jour est désormais TOUJOURS
 * présent sous le graphe : chercher sa PRÉSENCE ne prouverait plus rien, ces tests seraient verts
 * pour la mauvaise raison. Ce qui s'observe, c'est l'état ÉPINGLÉ, que le panneau publie sur sa
 * racine quand un jour a été choisi par un clic (ou par les flèches).
 * ⚠️ Corollaire : « relâché » ne se lit plus par `toBeHidden` (le panneau reste, il retombe sur
 * aujourd'hui) mais par la DISPARITION DE L'ATTRIBUT — donc `toHaveCount(0)` sur le sélecteur.
 */
async function clickAndFreeze(page: Page, x: number, y: number, zone = 'clic') {
  const frozen = page.locator('[data-jour-epingle]');
  const modal = page.getByRole('dialog', { name: 'Détail du mois' });
  let cx = x;
  let cy = y;
  await page.mouse.click(cx, cy);
  if (await modal.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
    await modal.waitFor({ state: 'hidden', timeout: 2_000 }).catch(() => {});
    cy = y - 30;
    await page.mouse.click(cx, cy);
  }
  // [E2E-FUTUR-CLICK-ANYWHERE-INSTABLE] Ce test rougit par intermittence en CI (3 essais sur 3,
  // `main` d4f7a723 puis b083c700) et passe 25 fois sur 25 en local (Chromium complet ET headless
  // shell, test seul ET fichier entier) : la cause n'est pas mesurable d'ici. Plutôt que relancer
  // à l'aveugle, l'échec NOMME ce qui a reçu le clic — `elementFromPoint` au point exact : un
  // bouton ou une surface par-dessus (le gestionnaire ignore un clic sur un bouton), ou un élément
  // hors du conteneur du graphe (le `pointerup` n'y arrive pas). Aucune donnée de l'app n'est lue
  // au-delà du nœud touché (mode test, persona fictif).
  if (!(await frozen.isVisible().catch(() => false))) {
    const sousLePointeur = await page.evaluate(([px, py]) => {
      const el = document.elementFromPoint(px, py);
      if (!el) return 'aucun élément';
      const decrire = (n: Element) => `${n.tagName.toLowerCase()}${n.id ? `#${n.id}` : ''}`
        + `${n.getAttribute('role') ? `[role=${n.getAttribute('role')}]` : ''}`
        + `${n.getAttribute('aria-label') ? `[aria-label="${n.getAttribute('aria-label')}"]` : ''}`
        + ` .${String(n.getAttribute('class') ?? '').trim().split(/\s+/).slice(0, 4).join('.')}`;
      const bouton = el.closest('button, a, [role="button"]');
      const graphe = el.closest('[role="img"]');
      return `${decrire(el)} | bouton ancêtre : ${bouton ? decrire(bouton) : 'aucun'}`
        + ` | dans le graphe : ${graphe ? 'oui' : 'NON'}`;
    }, [cx, cy]);
    await expect(frozen, `aucun jour épinglé au ${zone} (${Math.round(cx)}, ${Math.round(cy)}) — sous le pointeur : ${sousLePointeur}`).toBeVisible({ timeout: 5_000 });
  }
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
    // ⚠️ [FUTUR-NOTES-COMPACTES 2026-09-21] On observe l'ÉTAT (`data-note="methode"`, la pastille
    // qui n'existe QUE si la courbe est au jour), plus le LIBELLÉ « Courbe au jour » : Marc a fait
    // retirer ce pavé, et un test qui vise une prose se périme au premier changement de forme
    // (`UN-TEST-QUI-VISE-UNE-SURFACE-PAR-SON-CHEMIN-SE-PERIME`). Le FAIT défendu est le même.
    await expect(page.locator('[data-note="methode"]')).toBeAttached({ timeout: 10_000 });
    // Les chemins intermédiaires retirés ne doivent PAS réapparaître :
    // ⚠️ [FUTUR-PANNEAU-FIXE 2026-09-18] PORTÉE RESSERRÉE, et c'est un faux positif corrigé, pas un
    // assouplissement. Cette assertion visait le bouton « Jour » de l'ANCIEN chemin intermédiaire
    // (« zoomer sur ce mois pour voir les jours »), retiré par `[FUTUR-DAILY-NATIVE]`. Le panneau du
    // jour porte désormais un réglage de PAS dont un cran s'appelle aussi « Jour » — un contrôle
    // sans aucun rapport, qui faisait rougir la garde sur un lot qui ne touchait pas son objet
    // (`UN-TEST-QUI-ROUGIT-SUR-UN-LOT-QUI-NE-TOUCHE-PAS-SON-OBJET-MESURAIT-UN-PROXY`). On exclut
    // donc le panneau, et la garde reste entière ailleurs : un chemin intermédiaire qui
    // réapparaîtrait vivrait dans les contrôles du graphe, pas dans le panneau.
    await expect(page.locator('button:not([data-panneau-jour] button)', { hasText: /^Jour$/ })).toHaveCount(0);
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
      expect(m, `aucune date au jour dans le panneau épinglé en vue LARGE (fx=${fx}) : ${txt.slice(0, 200)}`).not.toBeNull();
      dates.push(m![0]);
      await page.keyboard.press('Escape');
      await expect(frozen).toHaveCount(0, { timeout: 2_000 });
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
    // [E2E-FUTUR-CLICK-ANYWHERE-INSTABLE] Le bandeau FIXE « Mode test activé » (42 px mesurés, en
    // haut du viewport) recouvre le haut du graphe dès que celui-ci défile sous lui : le clic « ciel
    // vide » à 8 % tombait alors sur le bandeau, jamais sur le graphe — un faux rouge de GÉOMÉTRIE,
    // pas une zone morte de l'app (le bandeau n'existe qu'en mode test). Mesuré en local : haut du
    // graphe à 70 px, donc 122 px au clic, hors du bandeau — d'où un test vert partout sauf là où la
    // mise en page place le graphe plus haut. On vise le ciel SOUS tout bandeau fixe.
    const bandeau = await page.getByRole('status', { name: 'Mode test activé' }).boundingBox().catch(() => null);
    const hautVisible = Math.max(box.y, bandeau ? bandeau.y + bandeau.height : 0) + 8;
    const spots: Array<[string, number, number]> = [
      ['ciel vide au-dessus de la pile', box.x + box.width * 0.6, Math.max(box.y + box.height * 0.08, hautVisible)],
      ['bande basse près de l\'axe des dates', box.x + box.width * 0.45, Math.min(box.y + box.height * 0.93, vpH - 24)],
      ['marge gauche (axe des montants)', box.x + 10, box.y + box.height * 0.5],
    ];
    for (const [nom, x, y] of spots) {
      const frozen = await clickAndFreeze(page, x, y, nom);
      const txt = (await frozen.textContent()) ?? '';
      expect(txt.match(DAY_RE), `zone morte au clic : ${nom} — ${txt.slice(0, 120)}`).not.toBeNull();
      await page.keyboard.press('Escape');
      await expect(frozen).toHaveCount(0, { timeout: 2_000 });
    }
  });

  test('[D6-GRAPH] AU CLAVIER : Entrée sur le graphe fige le jour d\'aujourd\'hui, Échap relâche et restitue le focus', async ({ page }) => {
    // Le seul chaînon qui manquait au clavier : le PREMIER geste (figer un jour sans souris).
    // Après l'épingle, le panneau est déjà complet au clavier (Veille/Lendemain,
    // « Détail complet », Échap) — couverts par les tests souris ci-dessus qui empruntent les
    // mêmes boutons. Ici on prouve : focus → Entrée → jour DATÉ figé → Échap → relâché ET focus
    // restitué au graphe (le hook comptait sur la focusabilité du conteneur — désormais tabIndex 0).
    await chartBox(page);
    const chart = page.getByRole('img', { name: /Courbe de vie/ });
    await chart.focus();
    await expect(chart).toBeFocused();
    await page.keyboard.press('Enter');
    const frozen = page.locator('[data-jour-epingle]');
    await expect(frozen).toBeVisible({ timeout: 5_000 });
    const txt = (await frozen.textContent()) ?? '';
    expect(txt.match(DAY_RE), `le gel clavier n'a pas figé un jour daté : ${txt.slice(0, 160)}`).not.toBeNull();
    await page.keyboard.press('Escape');
    await expect(frozen).toHaveCount(0, { timeout: 2_000 });
    await expect(chart, 'le focus doit revenir au graphe au relâchement (restitution du hook)').toBeFocused();
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
    await expect(page.locator('[data-note="methode"]')).toBeAttached();
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
    await expect(page.locator('[data-note="methode"]')).toBeAttached({ timeout: 10_000 });
    // `FluxImpots` n'existe que les jours d'échéance (~1/an sur ~30 ans) : quelques dizaines de
    // rects au plus. ~11 000 rects = la Bar lit la série entière, la garde `dailyAll` a sauté.
    const rects = await page.locator('.recharts-bar-rectangle').count();
    expect(rects, `${rects} rects rendus par la Bar des impôts — un par jour au lieu d'un par échéance`).toBeLessThan(80);
  });
});
