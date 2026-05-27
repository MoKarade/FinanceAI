/**
 * Tests E2E — Navigation et smoke par onglet
 *
 * Pour chaque onglet principal, vérifie :
 * - Aucune erreur JavaScript non-gérée (pageerror)
 * - L'onglet affiche au moins un titre visible (pas d'écran blanc/crash)
 *
 * Prérequis : mode test activé (fixtures Alex/Sam) pour avoir du contenu stable.
 */
import { test, expect } from '@playwright/test';
import { scriptBypassOnboarding, activateTestMode } from './helpers/setup';

/** Onglets à valider avec le texte attendu dans le titre de page */
const ONGLETS: Array<{ hash: string; nomAttendu: string }> = [
  { hash: 'DASHBOARD',     nomAttendu: "Vue d'ensemble" },
  { hash: 'TRANSACTIONS',  nomAttendu: 'Transactions' },
  { hash: 'BUDGET',        nomAttendu: 'Budget' },
  { hash: 'DEBT',          nomAttendu: 'Dette' },
  { hash: 'INVESTMENTS',   nomAttendu: 'Investissements' },
  { hash: 'FUTURE',        nomAttendu: 'Futur' },
  { hash: 'RETIREMENT',    nomAttendu: 'Retraite' },
  { hash: 'TAX',           nomAttendu: 'Impôts' },
];

test.describe('Navigation — smoke par onglet (mode test)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(scriptBypassOnboarding());
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await activateTestMode(page);
  });

  for (const { hash, nomAttendu } of ONGLETS) {
    test(`onglet ${hash} — aucune erreur, titre visible`, async ({ page }) => {
      const erreurs: string[] = [];
      page.on('pageerror', (err) => erreurs.push(err.message));

      await page.goto(`/#${hash}`);
      await page.waitForLoadState('domcontentloaded');

      // Attendre qu'un h1 visible dans le contenu principal (#main) apparaisse.
      // La sidebar a aussi un h1 masqué (CSS hidden) — on cible #main pour l'éviter.
      const titre = page.locator('#main h1').first();
      await expect(titre).toBeVisible({ timeout: 10_000 });

      // Le titre doit contenir le texte attendu (insensible à la casse)
      const texte = await titre.innerText();
      expect(texte.toLowerCase()).toContain(nomAttendu.toLowerCase());

      // Aucune erreur JavaScript non-gérée
      expect(erreurs, `Erreurs JS sur l'onglet ${hash}`).toHaveLength(0);
    });
  }
});
