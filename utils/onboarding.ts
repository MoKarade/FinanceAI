// utils/onboarding.ts
// Décide si l'écran d'accueil (Onboarding 1er lancement) doit s'afficher.
//
// Extrait en fonction pure pour être testable. Règle clé depuis la sync Drive : on n'accueille
// JAMAIS un utilisateur qui a déjà des données. Un restore Drive sur un nouvel appareil / en
// navigation privée ne pose PAS le flag local `app_onboarding_done` → sans cette règle,
// l'utilisateur revoyait « le texte du début » malgré ses données restaurées (retour Marc 2026-05-29).

/**
 * Signaux de synchronisation qui prouvent que l'utilisateur a DÉJÀ un compte (donc : jamais
 * l'écran d'accueil, même si les données locales ne sont pas encore arrivées du Drive).
 */
interface OnboardingSyncSignals {
    /** Une méta Drive locale existe (un compte a déjà été connecté sur cet appareil). */
    connectedBefore?: boolean;
    /** Connecté au Drive dans cette session. */
    syncConnected?: boolean;
    /** Un pull est en cours (les données arrivent). */
    syncBusy?: boolean;
    /** Le blob Drive est chiffré et attend la passphrase (coffre verrouillé). */
    needsPassphrase?: boolean;
}

/**
 * @param onboardingDoneFlag valeur de `localStorage['app_onboarding_done']` (ou null).
 * @param hasMeaningfulData l'utilisateur a-t-il déjà des données ?
 * @param sync signaux de sync (compte Drive existant / pull en cours / coffre verrouillé).
 * @returns true s'il faut afficher l'onboarding (vrai premier lancement uniquement).
 */
export function shouldShowOnboarding(
    onboardingDoneFlag: string | null,
    hasMeaningfulData: boolean,
    sync: OnboardingSyncSignals = {},
): boolean {
    if (onboardingDoneFlag === 'true') return false; // onboarding déjà complété
    if (hasMeaningfulData) return false; // a déjà des données → pas un 1er lancement
    // Utilisateur de RETOUR : un compte Drive existe / une sync est en cours / le coffre est verrouillé
    // → on n'affiche JAMAIS l'accueil (les vraies données vont arriver). Évite le flash d'onboarding
    // avant le pull, et le prompt de passphrase masqué derrière l'accueil (retours Marc).
    if (sync.connectedBefore || sync.syncConnected || sync.syncBusy || sync.needsPassphrase) return false;
    return true; // pas de données, pas de compte → vrai 1er lancement → accueillir
}

/** Forme minimale de l'état lue pour décider « a des données » (tolérante aux champs absents). */
type MeaningfulDataState = Partial<Record<DataArrayKey, unknown[]>> & {
    config?: { users?: Array<{ name?: string; netSalary?: number; grossSalary?: number }> };
};

/**
 * Liste CANONIQUE des tableaux de données utilisateur. Source unique partagée entre l'onboarding
 * (`hasMeaningfulData`) et la sync (`computeIsEmpty` dans syncOrchestrator), pour éviter la
 * divergence qui faisait afficher l'onboarding sur des données que la sync refusait d'écraser
 * (revue archi 2026-05-29). On EXCLUT `realEstateGoals`/`childGoals` : ils contiennent 1 entrée
 * par défaut → ne comptent pas comme « données saisies ».
 */
const DATA_ARRAY_KEYS = [
    'transactions', 'assets', 'investmentTransactions', 'debts',
    'financialGoals', 'budgetItems', 'travelGoals', 'lifeEvents', 'insurancePolicies',
    'rentalProperties', 'privateBusinesses', 'charitableGoals',
] as const;
type DataArrayKey = (typeof DATA_ARRAY_KEYS)[number];

/**
 * L'utilisateur a-t-il des données « réelles » ? Avant on ne regardait QUE transactions+actifs : une
 * restauration qui ramenait un profil/retraite sans transactions était vue « vide » → l'onboarding
 * s'affichait et, en se terminant, écrasait les profils + clés restaurés (bug Marc 2026-05-29).
 * Désormais : un tableau de données non vide (liste canonique) OU un profil renseigné (nom/salaire).
 */
export function hasMeaningfulData(state: MeaningfulDataState | null | undefined): boolean {
    if (!state) return false;
    if (DATA_ARRAY_KEYS.some((k) => Array.isArray(state[k]) && (state[k] as unknown[]).length > 0)) return true;
    const users = state.config?.users;
    return (
        Array.isArray(users) &&
        users.some((u) => (u?.name?.trim()?.length ?? 0) > 0 || (u?.netSalary ?? 0) > 0 || (u?.grossSalary ?? 0) > 0)
    );
}
