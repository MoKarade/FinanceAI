/**
 * Tests E2E — Assertions KPI ciblées (mode test, valeurs connues)
 *
 * Avec les fixtures Alex/Sam activées :
 * - Patrimoine total affiché sur le Dashboard et valeur > 0
 * - Coussin d'urgence (HealthIndicator, onglet Budget → sous-onglet « Santé » depuis PH4-D) affiche un nombre de mois > 0
 *
 * Ce test aurait attrapé le bug récent où le coussin restait à 0
 * (computeCurrentLiquidity non appelé, clés initialBalances incorrectes).
 */
import { test, expect } from '@playwright/test';
import { scriptBypassOnboarding, activateTestMode } from './helpers/setup';

// [REFONTE-NAV Lot 1] L'Accueil est retiré : #DASHBOARD redirige vers la courbe Future,
// qui porte désormais les chiffres de tête (FutureKpiStrip). Le beforeEach passe VOLONTAIREMENT
// par #DASHBOARD : il vérifie la redirection legacy en plus des KPI.
test.describe('KPI Futur — mode test (fixtures Alex/Sam)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(scriptBypassOnboarding());
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await activateTestMode(page);
    // Deep-link legacy → doit atterrir sur le Futur (URL réécrite).
    await page.goto('/#DASHBOARD');
    await page.waitForLoadState('domcontentloaded');
  });

  test('patrimoine net > 0 affiché sur le Futur (via redirection #DASHBOARD)', async ({ page }) => {
    // Attendre que le contenu principal soit rendu
    await expect(page.locator('#main h1').first()).toBeVisible({ timeout: 10_000 });

    // La redirection legacy a réécrit l'URL.
    await expect(page).toHaveURL(/#FUTURE/);

    // Bandeau KPI compact au-dessus de la courbe (FutureKpiStrip).
    const patrimoineStat = page.locator('#main').getByText(/patrimoine net/i).first();
    await expect(patrimoineStat).toBeVisible({ timeout: 8_000 });

    // La valeur est dans le même bloc KPIStat — chercher un montant en $
    // Pattern : valeur financière au format "XX XXX $" ou "X,XXX.XX $"
    const valeurPatrimoine = page.locator('#main').getByText(/[\d\s,]+\s*\$/).first();
    await expect(valeurPatrimoine).toBeVisible({ timeout: 5_000 });

    const texteValeur = await valeurPatrimoine.innerText();
    // Extraire le nombre (supprimer espaces, $, virgules)
    const nombre = parseFloat(texteValeur.replace(/[\s$, ]/g, '').replace(',', '.'));
    expect(nombre, `Patrimoine doit être > 0, reçu: "${texteValeur}"`).toBeGreaterThan(0);
  });

  test("coussin d'urgence affiche un nombre de mois > 0", async ({ page }) => {
    // [PH4-D] HealthIndicator DÉPLACÉ : Dashboard → onglet Budget, sous-onglet « Santé ».
    await page.goto('/#BUDGET');
    await page.waitForLoadState('domcontentloaded');
    await page.getByRole('tab', { name: 'Santé', exact: true }).click();
    // Attendre le composant HealthIndicator (titre "Santé financière")
    const titreHealth = page.locator('#main').getByText('Santé financière').first();
    await expect(titreHealth).toBeVisible({ timeout: 10_000 });

    // La métrique "Coussin d'urgence" affiche "X.XX mois" comme valeur brute
    // Le format dans HealthIndicator.tsx : `${formatNumber(emergencyMonths, { decimals: 2 })} mois`
    const labelCoussin = page.locator('#main').getByText(/coussin/i).first();
    await expect(labelCoussin).toBeVisible({ timeout: 5_000 });

    // La valeur "X.XX mois" apparaît dans le même groupe
    const valeurMois = page.locator('#main').getByText(/\d+[.,]\d+\s*mois/i).first();
    await expect(valeurMois).toBeVisible({ timeout: 5_000 });

    const texte = await valeurMois.innerText();
    // Extraire le nombre de mois
    const moisMatch = texte.match(/(\d+[.,]\d+)/);
    expect(moisMatch, `Format inattendu pour les mois: "${texte}"`).not.toBeNull();
    const mois = parseFloat((moisMatch![1] ?? '0').replace(',', '.'));
    expect(mois, `Coussin d'urgence doit être > 0 mois, reçu: "${texte}"`).toBeGreaterThan(0);
  });
});
