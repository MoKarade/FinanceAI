/**
 * Tests E2E — [FUTUR-MOBILE-PR0] Le FILET de la refonte mobile de l'onglet Futur, posé AVANT tout
 * changement de mise en page (décision Marc 2026-09-10 : « 6 PR incrémentales, filet d'abord »).
 *
 * Trois faits mesurés en géométrie réelle (viewport 390×844 tactile, projet `mobile-chrome`) :
 *   1. les QUATRE sous-onglets (Projection / Hypothèses / Plan d'action / Historique) s'atteignent au
 *      tap ET au clavier (flèches du `tablist`), et chacun montre son panneau ;
 *   2. aucun sous-onglet ne provoque de défilement HORIZONTAL (`scrollWidth ≤ 390`) — avant ET après
 *      révélation de la courbe ;
 *   3. inventaire des cibles tactiles < 44 px dans tout `<main>` (bandeau d'onglets, en-tête, KPI, panneau),
 *      mesurées PAR AXE (jamais le max des deux, leçon `UNE-GARDE-QUI-REDUIT-DEUX-DIMENSIONS-A-UNE-MESURE-LE-MAUVAIS-OBJET`).
 *
 * ⚠️ Le point 3 est un CLIQUET, pas une interdiction : la refonte n'a pas commencé, donc des cibles
 * trop petites EXISTENT aujourd'hui (voir `PLAFOND_CIBLES_TROP_PETITES`, mesuré et daté). Le cliquet
 * refuse toute NOUVELLE cible trop petite et rougit quand la dette baisse — pour qu'on descende le
 * plafond dans la même PR (`UN-INVENTAIRE-DE-DETTE-DOIT-SAVOIR-MOURIR`). Une garde née rouge se
 * livre non bloquante avec sa raison datée, jamais en `skip` silencieux
 * (`REJOUER-L-OUTIL-ELARGI-AVANT-DE-CROIRE-QU-IL-N-Y-A-RIEN`).
 */
import { test, expect, type Page } from '@playwright/test';
import { scriptBypassOnboarding, activateTestMode } from './helpers/setup';

const localChromium = process.env.PW_LOCAL_CHROMIUM;
if (localChromium) test.use({ launchOptions: { executablePath: localChromium } });

test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

/** Les quatre sous-onglets, dans l'ordre du bandeau (`FUTURE_SUB_TABS`). */
const SOUS_ONGLETS = ['Projection', 'Hypothèses', "Plan d'action", 'Historique'] as const;

/** Largeur de l'écran de référence — la seule que la refonte vise (Marc, téléphone). */
const LARGEUR = 390;

/** Cible tactile minimale, par axe (WCAG 2.5.8 / Apple HIG). */
const CIBLE_MIN = 44;

/**
 * ⚠️ MESURÉ le 2026-09-10 sur `main` (7cb74e44) : 93 (65 dans les panneaux + 7 × 4 hors panneau —
 * détail dans BACKLOG.md). `[FUTUR-MOBILE-PR2]` a fait passer le bouton plein écran de 38 à 44 px
 * sur mobile → **92**. `[FUTUR-MOBILE-PR3]` a replié les 16 chips de légende dans un tiroir fermé
 * par défaut (plus comptées tant qu'il n'est pas ouvert) → **76**. `[FUTUR-MOBILE-PR5]` (2026-09-11)
 * a agrandi les leviers de l'amorçage, le CTA « Trouver la meilleure stratégie », le lien « voir
 * directement », les pastilles d'Historique et la case « Marquer comme fait » du Plan d'action →
 * **59** (re-mesuré 2× à l'identique). Le nombre s'obtient d'abord, l'assertion s'écrit ensuite
 * (`UN-SEUIL-ECRIT-AVANT-SA-MESURE-EST-UN-CHIFFRE-INVENTE`).
 * Chaque PR de la refonte qui rétrécit la dette DOIT abaisser ce plafond ; à 0, inverser en règle.
 */
const PLAFOND_CIBLES_TROP_PETITES = 59;

async function ouvrirFutur(page: Page) {
  await page.addInitScript(scriptBypassOnboarding());
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await activateTestMode(page);
  await page.goto('/#FUTURE');
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByRole('tablist', { name: 'Vue Future' })).toBeVisible({ timeout: 15_000 });
}

function onglet(page: Page, nom: (typeof SOUS_ONGLETS)[number]) {
  return page.getByRole('tablist', { name: 'Vue Future' }).getByRole('tab', { name: nom });
}

async function largeurDefilable(page: Page): Promise<number> {
  return page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth));
}

/** Révèle la courbe (bouton « sans optimiser ») si l'écran d'amorçage est affiché. */
async function revelerCourbe(page: Page) {
  const voirDirect = page.getByRole('button', { name: /projection actuelle.*sans optimiser/i });
  await voirDirect.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
  if (await voirDirect.isVisible().catch(() => false)) await voirDirect.click();
  await expect(page.getByRole('img', { name: /Courbe de vie/ })).toBeVisible({ timeout: 20_000 });
}

/** Sélecteur des contrôles interactifs — UNE seule écriture, partagée par le recenseur et son anti-vacuité. */
const SELECTEUR_CONTROLES = 'button, a[href], input, select, textarea, [role="button"], [role="tab"], [role="switch"], [role="checkbox"], [role="slider"]';

/**
 * Inventaire des contrôles interactifs VISIBLES de l'onglet Futur dont un axe est < 44 px.
 * Portée : tout `<main>` (bandeau de sous-onglets, en-tête, KPI ET panneau actif) — le bandeau est un
 * FRÈRE du panneau, pas un descendant : borner au `tabpanel` laissait hors mesure le contrôle le plus
 * touché de l'écran (revue silent-failure-hunter, PR0). Mesure séparée largeur / hauteur — un
 * `Math.max` verrait 44×22 comme 44×44.
 */
async function ciblesTropPetites(page: Page): Promise<string[]> {
  return page.evaluate(({ min, sel }) => {
    const racine = document.querySelector('main');
    if (!racine) throw new Error('Aucun <main> : le recenseur ne peut rien mesurer');
    if (!racine.querySelector('[role="tabpanel"]')) throw new Error('Aucun tabpanel rendu pour ce sous-onglet');
    const out: string[] = [];
    for (const el of Array.from(racine.querySelectorAll<HTMLElement>(sel))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue; // masqué ou hors flux
      // `sr-only` (Tailwind) : contrôle clippé à 1×1 px derrière un libellé VISIBLE qui le porte — ce n'est
      // pas une cible tactile (mesuré : les deux radios du mode de simulation). Reconnu par sa CLASSE,
      // jamais par sa taille : un vrai contrôle effondré à 2 px doit rester dans l'inventaire.
      if (el.classList.contains('sr-only')) continue;
      if (el.closest('[hidden], [aria-hidden="true"]')) continue;
      if (getComputedStyle(el).visibility === 'hidden') continue;
      // Tolérance d'un demi-pixel : un rayon SVG de 22 rend 43,99 px, pas 44 (mesuré sur les
      // pastilles d'événements, 5 faux positifs sans elle).
      const tropEtroit = r.width < min - 0.5;
      const tropBas = r.height < min - 0.5;
      if (!tropEtroit && !tropBas) continue;
      const nom = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || el.tagName)
        .replace(/\s+/g, ' ').trim().slice(0, 40);
      out.push(`${el.tagName.toLowerCase()} « ${nom} » ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    return out;
  }, { min: CIBLE_MIN, sel: SELECTEUR_CONTROLES });
}

/** Anti-vacuité du recenseur : combien de contrôles il VOIT dans `<main>` (même sélecteur). */
async function nombreDeControles(page: Page): Promise<number> {
  return page.evaluate((sel) => document.querySelector('main')?.querySelectorAll(sel).length ?? 0, SELECTEUR_CONTROLES);
}

test.describe('Futur mobile — filet PR0 (390×844)', () => {
  test.setTimeout(180_000);

  test.beforeEach(async ({ page }) => {
    await ouvrirFutur(page);
  });

  test('[FUTUR-MOBILE-PR0] les quatre sous-onglets sont atteignables au tap et montrent leur panneau', async ({ page }) => {
    for (const nom of SOUS_ONGLETS) {
      const tab = onglet(page, nom);
      await expect(tab).toBeVisible();
      const box = (await tab.boundingBox())!;
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      // Un seul panneau, dont l'identité suit l'onglet actif (cf FutureProjection.tsx).
      const panneau = page.getByRole('tabpanel');
      await expect(panneau).toHaveCount(1);
      await expect(panneau).toHaveAttribute('aria-labelledby', await tab.getAttribute('id') ?? '');
    }
  });

  test('[FUTUR-MOBILE-PR0] les flèches du clavier parcourent les quatre sous-onglets (motif SubTabs)', async ({ page }) => {
    const premier = onglet(page, SOUS_ONGLETS[0]);
    await premier.focus();
    await expect(premier).toHaveAttribute('aria-selected', 'true');
    for (const nom of SOUS_ONGLETS.slice(1)) {
      await page.keyboard.press('ArrowRight');
      await expect(onglet(page, nom)).toHaveAttribute('aria-selected', 'true');
      await expect(onglet(page, nom)).toBeFocused();
    }
    // Contrôle : ArrowRight sur le dernier revient au premier (le clavier boucle).
    await page.keyboard.press('ArrowRight');
    await expect(premier).toHaveAttribute('aria-selected', 'true');
  });

  test('[FUTUR-MOBILE-PR0] aucun sous-onglet ne déborde en largeur (scrollWidth ≤ 390), avant et après la courbe', async ({ page }) => {
    const mesures: Record<string, number> = {};
    // Avant révélation : écran d'amorçage (composeur de leviers + stress-tests).
    mesures['Projection (amorçage)'] = await largeurDefilable(page);
    await revelerCourbe(page);
    for (const nom of SOUS_ONGLETS) {
      await onglet(page, nom).click();
      await expect(onglet(page, nom)).toHaveAttribute('aria-selected', 'true');
      await page.waitForTimeout(300); // laisse le panneau (lazy) se poser
      mesures[nom] = await largeurDefilable(page);
    }
    const debordants = Object.entries(mesures).filter(([, w]) => w > LARGEUR);
    expect(debordants, `Sous-onglets qui débordent : ${JSON.stringify(mesures)}`).toEqual([]);
  });

  test('[FUTUR-MOBILE-PR0] cliquet : pas de NOUVELLE cible tactile < 44 px (mesure par axe)', async ({ page }) => {
    await revelerCourbe(page);
    const inventaire: string[] = [];
    for (const nom of SOUS_ONGLETS) {
      await onglet(page, nom).click();
      await expect(onglet(page, nom)).toHaveAttribute('aria-selected', 'true');
      await page.waitForTimeout(300);
      // Anti-vacuité PAR sous-onglet, avec le sélecteur du recenseur : un panneau où il ne verrait rien
      // rendrait « 0 offender » = « parfait » (mesuré : chaque sous-onglet expose > 5 contrôles).
      expect(await nombreDeControles(page), `Le recenseur ne voit presque rien sous « ${nom} »`).toBeGreaterThan(5);
      for (const c of await ciblesTropPetites(page)) inventaire.push(`[${nom}] ${c}`);
    }
    // L'inventaire complet est joint au rapport : c'est lui que chaque PR de la refonte consulte.
    await test.info().attach('cibles-trop-petites.txt', { body: inventaire.join('\n'), contentType: 'text/plain' });
    expect(inventaire.length, `Cibles < 44 px (${inventaire.length}) :\n${inventaire.join('\n')}`)
      .toBeLessThanOrEqual(PLAFOND_CIBLES_TROP_PETITES);
    // Dette réduite → abaisser le plafond dans la MÊME PR (un cliquet qui ne suit pas son compte n'est plus une protection).
    expect(inventaire.length, `Dette mesurée ${inventaire.length} < plafond ${PLAFOND_CIBLES_TROP_PETITES} : abaisse PLAFOND_CIBLES_TROP_PETITES`)
      .toBeGreaterThanOrEqual(PLAFOND_CIBLES_TROP_PETITES - 3);
  });
});
