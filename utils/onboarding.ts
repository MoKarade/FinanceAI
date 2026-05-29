// utils/onboarding.ts
// Décide si l'écran d'accueil (Onboarding 1er lancement) doit s'afficher.
//
// Extrait en fonction pure pour être testable. Règle clé depuis la sync Drive : on n'accueille
// JAMAIS un utilisateur qui a déjà des données. Un restore Drive sur un nouvel appareil / en
// navigation privée ne pose PAS le flag local `app_onboarding_done` → sans cette règle,
// l'utilisateur revoyait « le texte du début » malgré ses données restaurées (retour Marc 2026-05-29).

/**
 * @param onboardingDoneFlag valeur de `localStorage['app_onboarding_done']` (ou null).
 * @param hasMeaningfulData l'utilisateur a-t-il déjà des données ?
 * @returns true s'il faut afficher l'onboarding (vrai premier lancement uniquement).
 */
export function shouldShowOnboarding(onboardingDoneFlag: string | null, hasMeaningfulData: boolean): boolean {
    if (onboardingDoneFlag === 'true') return false; // onboarding déjà complété
    return !hasMeaningfulData; // pas de données → vrai 1er lancement → accueillir
}

/** Forme minimale de l'état lue pour décider « a des données » (tolérante aux champs absents). */
interface MeaningfulDataState {
    transactions?: unknown[];
    assets?: unknown[];
    investmentTransactions?: unknown[];
    debts?: unknown[];
    savingsGoals?: unknown[];
    financialGoals?: unknown[];
    config?: { users?: Array<{ name?: string; netSalary?: number; grossSalary?: number }> };
}

/**
 * L'utilisateur a-t-il des données « réelles » ? Avant on ne regardait QUE transactions+actifs : une
 * restauration qui ramenait un profil/retraite sans transactions était vue « vide » → l'onboarding
 * s'affichait et, en se terminant, écrasait les profils + clés restaurés (bug Marc 2026-05-29).
 * Désormais : un tableau de données non vide OU un profil renseigné (nom ou salaire) compte.
 */
export function hasMeaningfulData(state: MeaningfulDataState | null | undefined): boolean {
    if (!state) return false;
    const arrays = [
        state.transactions, state.assets, state.investmentTransactions,
        state.debts, state.savingsGoals, state.financialGoals,
    ];
    if (arrays.some((a) => Array.isArray(a) && a.length > 0)) return true;
    const users = state.config?.users;
    return (
        Array.isArray(users) &&
        users.some((u) => (u?.name?.trim()?.length ?? 0) > 0 || (u?.netSalary ?? 0) > 0 || (u?.grossSalary ?? 0) > 0)
    );
}
