// hooks/useFinancialSignals.ts
//
// [ASSISTANT-HUB] Signaux financiers pour les cartes de l'onglet Assistant — DIRECTEMENT
// `computeFinancialSignals` (mcp/financialSignals.ts, pur, partagé avec le tool MCP
// `get_next_best_actions`) : UN seul moteur de signaux pour toute l'app, zéro appel LLM,
// zéro cache — toujours frais (remplace l'ancien widget Haiku « exactement 3 actions »
// + cache 1h, source des recommandations périmées/fabriquées).
//
// ⚠️ Sélecteurs ÉTROITS : la liste des tranches lues DOIT couvrir tout ce que
// computeFinancialSignals/buildFinancialOverview consomme — verrouillé par le test de parité
// narrow↔full (tests/hooks/useFinancialSignals.test.ts, classe BUDGET-MONTH-NAV : un champ
// manquant = cartes silencieusement figées).

import { useMemo } from 'react';
import { useFinanceStore } from '../store/useFinanceStore';
import { computeFinancialSignals, type FinancialSignals } from '../mcp/financialSignals';
import type { AppState } from '../types';

/** Tranches d'AppState consommées par computeFinancialSignals (exportées pour le test de parité). */
export const SIGNAL_STATE_KEYS = [
    'assets', 'fxRates', 'initialBalances', 'transactions', 'debts', 'config',
    'budgetItems', 'retirementGoal', 'financialGoals',
] as const;

export function useFinancialSignals(): FinancialSignals {
    const assets = useFinanceStore((s) => s.assets);
    const fxRates = useFinanceStore((s) => s.fxRates);
    const initialBalances = useFinanceStore((s) => s.initialBalances);
    const transactions = useFinanceStore((s) => s.transactions);
    const debts = useFinanceStore((s) => s.debts);
    const config = useFinanceStore((s) => s.config);
    const budgetItems = useFinanceStore((s) => s.budgetItems);
    const retirementGoal = useFinanceStore((s) => s.retirementGoal);
    const financialGoals = useFinanceStore((s) => s.financialGoals);

    return useMemo(
        () => computeFinancialSignals({
            assets, fxRates, initialBalances, transactions, debts, config, budgetItems,
            retirementGoal, financialGoals,
        } as AppState),
        [assets, fxRates, initialBalances, transactions, debts, config, budgetItems,
            retirementGoal, financialGoals],
    );
}
