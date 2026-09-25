/**
 * Tests E2E — écran Futur en mobile/tablette (< 1024px), géométrie réelle (viewport 390×844
 * tactile, projet `mobile-chrome`).
 *
 * [FUTUR-NAV-TIROIRS] (2026-09-21) RÉÉCRITURE COMPLÈTE : ce fichier gardait le motif à QUATRE
 * SOUS-ONGLETS (`role="tablist"`, flèches du clavier, bascule de panneau) de la refonte mobile
 * PR0-PR5. Ce motif n'existe plus — la courbe (« Projection ») est désormais TOUJOURS affichée,
 * sans onglet à sélectionner ; Hypothèses/Plan d'action/Historique s'ouvrent chacun dans un TIROIR
 * (`ui/Drawer.tsx`, feuille du bas sous ce seuil) déclenché par un bouton indépendant — plus un
 * `tablist`, donc plus de flèches à parcourir entre eux (chaque bouton est un arrêt de Tab normal).
 *
 * Ce que ce fichier prouve maintenant, en géométrie réelle :
 *   1. la courbe est visible SANS le moindre geste de navigation (elle n'est plus DERRIÈRE un onglet) ;
 *   2. les trois boutons Hypothèses/Plan d'action/Historique s'atteignent au tap, ouvrent chacun un
 *      tiroir nommé, et Échap le referme en rendant le focus au déclencheur ;
 *   3. aucun état (amorçage, courbe révélée, chaque tiroir ouvert) ne provoque de défilement
 *      HORIZONTAL (`scrollWidth ≤ 390`) ;
 *   4. inventaire des cibles tactiles < 44 px dans `<main>` ET dans tout tiroir OUVERT (porté par
 *      `createPortal` hors de `<main>` — un audit qui ne regarderait que `<main>` serait aveugle au
 *      contenu affiché à l'écran dès qu'un tiroir est ouvert), mesurées PAR AXE.
 *
 * ⚠️ Le point 4 est un CLIQUET, RE-MESURÉ pour cette forme d'écran (jamais recopié de l'ancienne
 * mesure — `LE-REMEDE-PRESCRIT-PAR-UN-TICKET-SE-MESURE-COMME-SON-DEFAUT`) : voir
 * `PLAFOND_CIBLES_TROP_PETITES` pour la mesure et sa date.
 */
import { test, expect, type Page } from '@playwright/test';
import { scriptBypassOnboarding, activateTestMode } from './helpers/setup';

const localChromium = process.env.PW_LOCAL_CHROMIUM;
if (localChromium) test.use({ launchOptions: { executablePath: localChromium } });

test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

/** Les trois tiroirs, avec le libellé COURT du bouton (colonne empilée) et le TITRE fixe du tiroir. */
const TIROIRS = [
  // [S5-REFONTE-FUTUR] Carte « Outils » : un seul nom par tiroir, au bureau comme au téléphone.
  { bouton: 'Modifier les hypothèses', titre: 'Modifier les hypothèses' },
  { bouton: "Plan d'action", titre: "Plan d'action" },
  { bouton: 'Historique', titre: 'Historique' },
] as const;

/** Largeur de l'écran de référence — la seule que la refonte mobile vise (Marc, téléphone). */
const LARGEUR = 390;

/** Cible tactile minimale, par axe (WCAG 2.5.8 / Apple HIG). */
const CIBLE_MIN = 44;

/**
 * ⚠️ MESURÉ le 2026-09-21 sur cette forme d'écran (barre de tiroirs + graphe toujours visible,
 * `[FUTUR-NAV-TIROIRS]`) : **49** (repos + 3 tiroirs, sur `mobile-chrome` 390×844). L'ANCIENNE
 * valeur (59, motif à onglets) ne pouvait PAS être recopiée : la forme de l'écran a changé, donc ce
 * qu'elle mesure a changé (`UN-SEUIL-ECRIT-AVANT-SA-MESURE-EST-UN-CHIFFRE-INVENTE`). L'essentiel de
 * la dette mesurée est PRÉ-EXISTANT (le radiogroup `Pill size="sm"` « Données Réelles/Sandbox »,
 * dimensionné à 24 px pour WCAG 2.5.8 AA — pas les 44 px du plancher interne de ce fichier —,
 * répété dans chaque état où il apparaît, dont les 3 tiroirs).
 * Chaque PR qui rétrécit la dette DOIT abaisser ce plafond ; à 0, inverser en règle.
 *
 * ⚠️⚠️ RE-MESURÉ le 21/09 (`[FUTUR-NAV-TIROIRS bandeau]`) : **57**. Delta EXPLIQUÉ, pas une dérive
 * silencieuse : le bandeau KPI de la barre latérale n'avait qu'UN tooltip conditionnel (« Patrimoine »,
 * quand `estateNetWorth` est non nul) — les libellés raccourcis (« Patrimoine »/« Succès »/
 * « Vitalité ») en portent maintenant TROIS, pour garder le texte complet accessible malgré le
 * libellé court. Le tooltip « Aide sur ce montant » est le MÊME cercle de 16 px, WCAG-exempté
 * (`KPIStat.tsx`, commentaire `[A11Y-TOUCH-TARGET-TINY]` : cible EN LIGNE dans un bloc de texte,
 * WCAG 2.5.8 AA n'exige pas 44 px ici) — pas un nouveau motif, le MÊME motif répété 3× au lieu de
 * 1×, dans les 4 états walkés par ce test (+2 × 4 = +8, exactement l'écart mesuré).
 *
 * [S5-REFONTE-FUTUR] 57 → 28, mesuré (390 px) : les tuiles KPI et leurs cercles d'aide « ? » ont
 * quitté l'écran (maquette F-mobile) et le commutateur « Données réelles / Bac à sable » passe à
 * 44 px (−2 par état × 4 états). Ce qui reste est DANS les tiroirs.
 */
const PLAFOND_CIBLES_TROP_PETITES = 28;

async function ouvrirFutur(page: Page) {
  await page.addInitScript(scriptBypassOnboarding());
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await activateTestMode(page);
  await page.goto('/#FUTURE');
  await page.waitForLoadState('domcontentloaded');
  // [FUTUR-NAV-TIROIRS] Le témoin de chargement n'est plus le bandeau d'onglets (disparu) : le
  // bouton « Modifier les hypothèses » (carte Outils) est présent dans les DEUX états (amorçage et
  // courbe révélée).
  await expect(page.getByRole('button', { name: 'Modifier les hypothèses', exact: true })).toBeVisible({ timeout: 15_000 });
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
 * Inventaire des contrôles interactifs VISIBLES dont un axe est < 44 px.
 *
 * Portée : `<main>` UNION tout `[role="dialog"]` ouvert. [FUTUR-NAV-TIROIRS] Les trois tiroirs sont
 * portés par `createPortal(document.body)` — hors de `<main>` structurellement — mais restent ce que
 * l'utilisateur voit et touche à l'écran ; un audit borné à `<main>` serait aveugle à leur contenu
 * dès qu'un tiroir est ouvert (même défaut que borner au `tabpanel` seul, corrigé lors de PR0).
 * Mesure séparée largeur / hauteur — un `Math.max` verrait 44×22 comme 44×44.
 */
async function ciblesTropPetites(page: Page): Promise<string[]> {
  return page.evaluate(({ min, sel }) => {
    const racines = [document.querySelector('main'), ...Array.from(document.querySelectorAll('[role="dialog"]'))]
      .filter((n): n is Element => !!n);
    if (racines.length === 0) throw new Error('Ni <main> ni tiroir ouvert : le recenseur ne peut rien mesurer');
    const out: string[] = [];
    const vus = new Set<Element>();
    for (const racine of racines) {
      for (const el of Array.from(racine.querySelectorAll<HTMLElement>(sel))) {
        if (vus.has(el)) continue; // un contrôle du tiroir n'est jamais aussi descendant de <main>, mais deux tiroirs ouverts pourraient partager un sélecteur générique
        vus.add(el);
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue; // masqué ou hors flux
        // `sr-only` (Tailwind) : contrôle clippé à 1×1 px derrière un libellé VISIBLE qui le porte.
        if (el.classList.contains('sr-only')) continue;
        if (el.closest('[hidden], [aria-hidden="true"]')) continue;
        if (getComputedStyle(el).visibility === 'hidden') continue;
        // Tolérance d'un demi-pixel : un rayon SVG de 22 rend 43,99 px, pas 44.
        const tropEtroit = r.width < min - 0.5;
        const tropBas = r.height < min - 0.5;
        if (!tropEtroit && !tropBas) continue;
        const nom = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || el.tagName)
          .replace(/\s+/g, ' ').trim().slice(0, 40);
        out.push(`${el.tagName.toLowerCase()} « ${nom} » ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
    }
    return out;
  }, { min: CIBLE_MIN, sel: SELECTEUR_CONTROLES });
}

/** Anti-vacuité du recenseur : combien de contrôles il VOIT (même portée, même sélecteur). */
async function nombreDeControles(page: Page): Promise<number> {
  return page.evaluate((sel) => {
    const racines = [document.querySelector('main'), ...Array.from(document.querySelectorAll('[role="dialog"]'))]
      .filter((n): n is Element => !!n);
    return racines.reduce((n, r) => n + r.querySelectorAll(sel).length, 0);
  }, SELECTEUR_CONTROLES);
}

test.describe('Futur mobile — tiroirs et courbe toujours visible', () => {
  test.setTimeout(180_000);

  test.beforeEach(async ({ page }) => {
    await ouvrirFutur(page);
  });

  test('[FUTUR-NAV-TIROIRS] la courbe est visible SANS le moindre geste de navigation', async ({ page }) => {
    // ⚠️ C'est la différence structurelle avec l'ancien motif à onglets : « Projection » n'est plus
    // un onglet parmi d'autres qu'il faut sélectionner, c'est l'état par défaut de l'écran.
    await revelerCourbe(page);
    // Aucun tiroir ouvert : la courbe reste visible, rien ne la recouvre.
    for (const { titre } of TIROIRS) {
      await expect(page.getByRole('dialog', { name: titre })).toHaveCount(0);
    }
    await expect(page.getByRole('img', { name: /Courbe de vie/ })).toBeVisible();
  });

  test('[FUTUR-NAV-TIROIRS] les trois boutons ouvrent chacun un tiroir nommé, Échap le referme au bon déclencheur', async ({ page }) => {
    for (const { bouton, titre } of TIROIRS) {
      const declencheur = page.getByRole('button', { name: bouton, exact: true });
      await expect(declencheur).toBeVisible();
      await declencheur.click();
      const dialog = page.getByRole('dialog', { name: titre });
      await expect(dialog).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      // Le focus revient au bouton qui a ouvert le tiroir (même contrat que `ui/Modal.tsx`).
      await expect(declencheur).toBeFocused();
    }
  });

  test('[FUTUR-NAV-TIROIRS] aucun état ne déborde en largeur (scrollWidth ≤ 390)', async ({ page }) => {
    const mesures: Record<string, number> = {};
    mesures['amorçage'] = await largeurDefilable(page);
    await revelerCourbe(page);
    mesures['courbe révélée'] = await largeurDefilable(page);
    for (const { bouton, titre } of TIROIRS) {
      await page.getByRole('button', { name: bouton, exact: true }).click();
      await expect(page.getByRole('dialog', { name: titre })).toBeVisible();
      await page.waitForTimeout(300); // laisse le contenu (lazy pour Historique) se poser
      mesures[`tiroir ${titre}`] = await largeurDefilable(page);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: titre })).toHaveCount(0);
    }
    const debordants = Object.entries(mesures).filter(([, w]) => w > LARGEUR);
    expect(debordants, `États qui débordent : ${JSON.stringify(mesures)}`).toEqual([]);
  });

  test('[FUTUR-NAV-TIROIRS] cliquet : pas de NOUVELLE cible tactile < 44 px (mesure par axe)', async ({ page }) => {
    await revelerCourbe(page);
    const inventaire: string[] = [];
    // État de repos (aucun tiroir ouvert) : la courbe, le panneau du jour, les trois déclencheurs.
    expect(await nombreDeControles(page), 'Le recenseur ne voit presque rien au repos').toBeGreaterThan(5);
    for (const c of await ciblesTropPetites(page)) inventaire.push(`[repos] ${c}`);
    for (const { bouton, titre } of TIROIRS) {
      await page.getByRole('button', { name: bouton, exact: true }).click();
      await expect(page.getByRole('dialog', { name: titre })).toBeVisible();
      await page.waitForTimeout(300);
      expect(await nombreDeControles(page), `Le recenseur ne voit presque rien sous « ${titre} »`).toBeGreaterThan(5);
      for (const c of await ciblesTropPetites(page)) inventaire.push(`[${titre}] ${c}`);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: titre })).toHaveCount(0);
    }
    // L'inventaire complet est joint au rapport : c'est lui que chaque PR future consulte.
    await test.info().attach('cibles-trop-petites.txt', { body: inventaire.join('\n'), contentType: 'text/plain' });
    expect(inventaire.length, `Cibles < 44 px (${inventaire.length}) :\n${inventaire.join('\n')}`)
      .toBeLessThanOrEqual(PLAFOND_CIBLES_TROP_PETITES);
    expect(inventaire.length, `Dette mesurée ${inventaire.length} < plafond ${PLAFOND_CIBLES_TROP_PETITES} : abaisse PLAFOND_CIBLES_TROP_PETITES`)
      .toBeGreaterThanOrEqual(PLAFOND_CIBLES_TROP_PETITES - 3);
  });
});
