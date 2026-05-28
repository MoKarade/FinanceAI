/**
 * Helpers partagés entre les tests E2E FinanceAI.
 *
 * bypass_onboarding  — pose le flag localStorage qui saute l'écran de bienvenue.
 * activate_test_mode — injecte les fixtures Alex/Sam via le store Zustand.
 */
import { type Page } from '@playwright/test';

/**
 * Bypass l'onboarding en injectant le flag localStorage avant le chargement
 * de la page. À appeler via page.addInitScript() avant page.goto().
 */
export function scriptBypassOnboarding(): string {
  return `
    try {
      localStorage.setItem('app_onboarding_done', 'true');
    } catch (e) {
      // localStorage indisponible — ne bloque pas le test
    }
  `;
}

/**
 * Active le mode test (fixtures Alex/Sam) en naviguant vers l'onglet
 * Configuration → sous-onglet Sauvegarde (qui contient TestModePanel).
 *
 * Méthode UI choisie : plus robuste que page.evaluate() sur un module
 * ES bundlé (le store Zustand n'est pas exposé sur window).
 */
export async function activateTestMode(page: Page): Promise<void> {
  // Navigation vers Configuration via le hash
  await page.goto('/#SETTINGS');
  await page.waitForLoadState('domcontentloaded');

  // Cliquer le sous-onglet "Sauvegarde" (contient TestModePanel)
  const btnSauvegarde = page.getByRole('tab', { name: /Sauvegarde/i });
  await btnSauvegarde.waitFor({ state: 'visible', timeout: 10_000 });
  await btnSauvegarde.click();

  // Cliquer "Activer le mode test" — charge le persona par défaut (couple
  // Alex/Sam) IMMÉDIATEMENT. Le flux de confirmation à 2 étapes ("Oui, charger
  // les fixtures") a été retiré avec l'arrivée du sélecteur de personas
  // (le menu déroulant charge directement). Cf components/settings/TestModePanel.tsx.
  const btnActivate = page.getByRole('button', { name: 'Activer le mode test' });
  await btnActivate.waitFor({ state: 'visible', timeout: 8_000 });
  await btnActivate.click();

  // Attendre que le banner "MODE TEST" apparaisse (confirmation visuelle)
  await page.waitForFunction(
    () => document.body.innerText.includes('MODE TEST'),
    { timeout: 8_000 },
  );
}
