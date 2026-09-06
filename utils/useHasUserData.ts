// P1 — Selector central pour détecter si l'utilisateur a saisi ses données.
//
// Tant que cette fonction retourne `false`, AUCUNE recommandation IA / score /
// projection / action ne doit s'afficher. Le but : éviter de montrer des
// chiffres pseudo-pertinents calculés sur des defaults factices.
//
// Critères "utilisateur a saisi" :
//   - User 1 a un nom non vide ET (salaire brut > 0 OU salaire net > 0), OU
//   - Au moins 1 actif (Asset) avec quantité > 0, OU
//   - Au moins 1 transaction importée, OU
//   - Au moins 1 objectif financier explicite
//
// Si UN SEUL de ces critères est vrai → on considère que l'utilisateur a
// commencé à saisir → on affiche les widgets d'action.

import { useFinanceStore } from '../store/useFinanceStore';

interface UserDataStatus {
    /** `true` si l'utilisateur a saisi au moins une donnée significative */
    hasData: boolean;
    /** Détail de chaque critère pour debug / messages contextuels */
    hasProfile: boolean;
    hasAssets: boolean;
    hasTransactions: boolean;
    hasGoals: boolean;
}

/**
 * Hook React : retourne `true` si l'utilisateur a saisi au moins une donnée
 * permettant aux widgets d'action (IA, scores, projections) d'être pertinents.
 *
 * @example
 *   const { hasData, hasProfile } = useHasUserData();
 *   if (!hasData) return <EmptyStatePrompt />;
 */
export function useHasUserData(): UserDataStatus {
    const config = useFinanceStore(s => s.config);
    const assetsCount = useFinanceStore(s => (s.assets?.length ?? 0));
    const transactionsCount = useFinanceStore(s => (s.transactions?.length ?? 0));
    const goalsCount = useFinanceStore(s => (s.financialGoals?.length ?? 0));

    const u1 = config?.users?.[0];
    const hasProfile = Boolean(
        u1?.name?.trim() &&
        ((u1.grossSalary ?? 0) > 0 || (u1.netSalary ?? 0) > 0),
    );
    const hasAssets = assetsCount > 0;
    const hasTransactions = transactionsCount > 0;
    const hasGoals = goalsCount > 0;

    return {
        hasData: hasProfile || hasAssets || hasTransactions || hasGoals,
        hasProfile,
        hasAssets,
        hasTransactions,
        hasGoals,
    };
}

/**
 * Variante non-React (pour appels conditionnels en dehors d'un composant).
 */
export function getHasUserDataSnapshot(): UserDataStatus {
    const state = useFinanceStore.getState();
    const u1 = state.config?.users?.[0];
    const hasProfile = Boolean(
        u1?.name?.trim() &&
        ((u1.grossSalary ?? 0) > 0 || (u1.netSalary ?? 0) > 0),
    );
    const hasAssets = (state.assets?.length ?? 0) > 0;
    const hasTransactions = (state.transactions?.length ?? 0) > 0;
    const hasGoals = (state.financialGoals?.length ?? 0) > 0;
    return {
        hasData: hasProfile || hasAssets || hasTransactions || hasGoals,
        hasProfile,
        hasAssets,
        hasTransactions,
        hasGoals,
    };
}
