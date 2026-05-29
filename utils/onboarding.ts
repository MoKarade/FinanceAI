// utils/onboarding.ts
// Décide si l'écran d'accueil (Onboarding 1er lancement) doit s'afficher.
//
// Extrait en fonction pure pour être testable. Règle clé depuis la sync Drive : on n'accueille
// JAMAIS un utilisateur qui a déjà des données. Un restore Drive sur un nouvel appareil / en
// navigation privée ne pose PAS le flag local `app_onboarding_done` → sans cette règle,
// l'utilisateur revoyait « le texte du début » malgré ses données restaurées (retour Marc 2026-05-29).

/**
 * @param onboardingDoneFlag valeur de `localStorage['app_onboarding_done']` (ou null).
 * @param hasMeaningfulData l'utilisateur a-t-il déjà des données (transactions ou actifs) ?
 * @returns true s'il faut afficher l'onboarding (vrai premier lancement uniquement).
 */
export function shouldShowOnboarding(onboardingDoneFlag: string | null, hasMeaningfulData: boolean): boolean {
    if (onboardingDoneFlag === 'true') return false; // onboarding déjà complété
    return !hasMeaningfulData; // pas de données → vrai 1er lancement → accueillir
}
