/**
 * Helpers partagés entre les tests E2E FinanceAI.
 *
 * bypass_onboarding  — pose le flag localStorage qui saute l'écran de bienvenue.
 * activate_test_mode — injecte les fixtures Alex/Sam via le store Zustand.
 */
import { type Page } from '@playwright/test';
// ⚠️ Le script est INJECTÉ comme source dans la page : il ne peut pas importer le registre, il
// l'INTERPOLE. C'est la seule forme possible ici, et elle garde la source unique.
import { STORAGE_KEYS } from '../../utils/storageKeys';

/**
 * Bypass l'onboarding en injectant le flag localStorage avant le chargement
 * de la page. À appeler via page.addInitScript() avant page.goto().
 */
export function scriptBypassOnboarding(): string {
  return `
    try {
      localStorage.setItem('${STORAGE_KEYS.onboardingDone}', 'true');
    } catch (e) {
      // localStorage indisponible — ne bloque pas le test
    }
  `;
}

/**
 * Éloigne le pointeur du rail de navigation AVANT toute interaction.
 *
 * ⚠️ LA SOURIS DE PLAYWRIGHT DÉMARRE EN (0,0) — c'est-à-dire SUR le rail. Celui-ci s'ouvre au
 * survol (`isSidebarOpen = (hovered || focused) && !dismissed`, `components/Layout.tsx`) et, par
 * décision assumée (« l'expansion overlay le contenu sans push, pas de jump »), il RECOUVRE les
 * 288 px de gauche (`w-72`) alors que le contenu ne commence qu'à 64 px (`md:ml-16`). Tout
 * contrôle situé dans cette bande devient donc inatteignable au clic tant que le pointeur n'a
 * pas bougé : Playwright réessaie pendant 30 s en répétant « subtree intercepts pointer events »,
 * puis le test expire.
 *
 * Ce n'est PAS le contournement d'un défaut de l'app : un humain qui survole le rail le voit
 * s'ouvrir et déplace sa souris. Ce que le helper reproduit, c'est ce geste-là.
 *
 * MESURÉ le 2026-09-21 sur `main` (4f1466b4), sans aucun changement applicatif :
 * `futureAxis.spec.ts` échoue 3 fois sur 3 (30 s chacune) avec le pointeur en (0,0), et passe
 * une fois le pointeur écarté. Le même mécanisme faisait expirer le job E2E de la CI à son
 * plafond de 30 minutes. Suite complète : 18 tests traités en 29 min et TOUS en échec avant,
 * **52 passés / 2 échoués en 7,4 min** après — les 2 restants étant le MÊME défaut dans un
 * spec qui ne passe pas par `activateTestMode` (d'où l'export).
 *
 * ⚠️ RÈGLE, et c'est pour ça qu'il est EXPORTÉ : tout spec qui clique un contrôle situé dans
 * les 288 px de gauche APRÈS un `goto` doit l'appeler d'abord. Le premier clic d'une page
 * neuve est toujours concerné, puisque le pointeur n'a pas encore bougé de (0,0).
 */
export async function ecarterLeRail(page: Page): Promise<void> {
  const vp = page.viewportSize();
  if (!vp) return;
  await page.mouse.move(vp.width - 5, Math.floor(vp.height / 2));
}

/**
 * Active le mode test (fixtures Alex/Sam) depuis l'onglet Réglages, dont la
 * colonne de droite porte la carte du mode test (TestModePanel).
 *
 * Méthode UI choisie : plus robuste que page.evaluate() sur un module
 * ES bundlé (le store Zustand n'est pas exposé sur window).
 */
export async function activateTestMode(page: Page): Promise<void> {
  // Navigation vers Configuration via le hash
  await page.goto('/#SETTINGS');
  await page.waitForLoadState('domcontentloaded');
  await ecarterLeRail(page);

  // [S5-REFONTE-REGLAGES] La carte du mode test est TOUJOURS visible dans Réglages (colonne de droite) :
  // plus de sous-onglet « Profil » à ouvrir d'abord.
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
