// services/financialSnapshot.ts
//
// Lot 0 — vue d'ensemble financière PURE dérivée de l'AppState.
//
// Le snapshot « FinancialSnapshot » (patrimoine net, revenus/dépenses mensuels,
// soldes par compte, âge, dettes, objectifs) était construit DANS un composant
// React (`components/sidebar/NextBestAction.tsx`) à partir du store. On l'extrait
// ici en fonction pure, en réutilisant les agrégats déjà purs de
// `services/portfolio.ts`. Réutilisable par le serveur MCP (`get_financial_overview`)
// et par l'app, sans dépendance React ni `@anthropic-ai/sdk`.
//
// IMPORTANT : `FinancialSnapshot` est ré-déclaré STRUCTURELLEMENT ici (même forme
// que `services/claude.ts`) pour NE PAS importer `claude.ts` côté MCP — ce module
// tire le SDK Anthropic, inutile (et lourd) pour des tools « données pures ».
// La compatibilité de forme est verrouillée par un test.

import type { AppState } from '../types';
import {
    computeAssetBreakdown,
    computeInvestmentsValue,
    computeCurrentLiquidity,
    computeMonthlyBudgetAggregates,
    computeTotalDebt,
    computePresentNetWorth,
    type AssetBreakdown,
} from './portfolio';

/**
 * Forme alignée sur `FinancialSnapshot` de `services/claude.ts` (entrée de
 * `getNextBestActions`). Conserver les deux en phase (test de compatibilité).
 */
export interface FinancialSnapshot {
    netWorth: number;
    monthlyIncome: number;
    monthlyExpenses: number;
    celiBalance: number;
    reerBalance: number;
    currentAge: number;
    retirementAge: number;
    topDebts: Array<{ name: string; balance: number; rate: number }>;
    activeGoals: Array<{ name: string; targetAmount: number; currentAmount: number; deadline: string }>;
    projectedNetWorth20y?: number;
    coupleMode?: boolean;
}

/** Vue d'ensemble enrichie pour le tool MCP `get_financial_overview`. */
export interface FinancialOverview extends FinancialSnapshot {
    currency: 'CAD';
    /** Liquidités (cash de tous les comptes). */
    liquidity: number;
    /** Valeur marché totale des placements (CAD). */
    investments: number;
    /** Ventilation des placements par type de compte (CAD). */
    accounts: AssetBreakdown;
    /** Épargne mensuelle = max(0, revenu − dépenses budgétées). */
    monthlyCashflow: number;
    /** Dette totale (Σ soldes dus). */
    totalDebt: number;
    /** Nombre d'utilisateurs configurés (1 = solo, 2 = couple). */
    userCount: number;
}

/**
 * Construit un `FinancialSnapshot` PUR à partir de l'AppState. Réplique
 * fidèlement la logique de `NextBestAction.tsx` :
 *  - patrimoine net = source unique `computePresentNetWorth` (placements + liquidités − dettes) ;
 *  - revenu mensuel = Σ netSalary des utilisateurs (les salaires sont MENSUELS
 *    dans le store) ;
 *  - dépenses mensuelles = Σ budgetItems NORMALISÉS par fréquence et HORS épargne
 *    (via `computeMonthlyBudgetAggregates`, fix L4 audit 2026-06-17) ;
 *  - soldes CELI/REER = valeur des placements de ce type ;
 *  - patrimoine projeté à +20 ans : si `lastProjection` fourni, lit le point
 *    correspondant (sinon undefined).
 */
export function buildFinancialSnapshot(
    state: AppState,
    opts?: { projectedNetWorth20y?: number },
): FinancialSnapshot {
    const fx = state.fxRates ?? {};
    const assets = state.assets ?? [];
    const breakdown = computeAssetBreakdown(assets, fx);
    const investments = computeInvestmentsValue(assets, fx);
    const liquidity = computeCurrentLiquidity(state.initialBalances ?? {}, state.transactions ?? []);
    const totalDebt = computeTotalDebt(state.debts ?? []);
    // Source unique du NW présent (parité Dashboard/IA/moteur garantie par construction).
    const netWorth = computePresentNetWorth(state.initialBalances ?? {}, state.transactions ?? [], assets, fx, state.debts ?? []);

    const users = state.config?.users ?? [];
    // `netSalary` est en MENSUEL dans le store (cf Budget.tsx / Retirement.tsx).
    const monthlyIncome = (users[0]?.netSalary || 0) + (users[1]?.netSalary || 0);
    // [L4 audit 2026-06-17] Dépenses mensuelles NORMALISÉES par fréquence (annuel/trim/hebdo) et HORS
    // épargne, via le helper partagé — avant : Σ brute des cibles (un poste annuel compté ×12, faux pour IA/MCP).
    const monthlyExpenses = computeMonthlyBudgetAggregates(state.config, state.budgetItems ?? []).expenses;

    return {
        netWorth,
        monthlyIncome,
        monthlyExpenses,
        celiBalance: breakdown.celi,
        reerBalance: breakdown.reer,
        currentAge: users[0]?.age || 30,
        retirementAge: state.retirementGoal?.targetAge || 65,
        topDebts: (state.debts ?? [])
            .slice(0, 3)
            .map((d) => ({ name: d.name, balance: d.balance, rate: d.interestRate })),
        activeGoals: (state.financialGoals ?? [])
            .filter((g) => !g.completed)
            .slice(0, 3)
            .map((g) => ({
                name: g.name,
                targetAmount: g.targetAmount,
                currentAmount: g.manualCurrentAmount || 0,
                deadline: g.deadline,
            })),
        projectedNetWorth20y: opts?.projectedNetWorth20y,
        coupleMode: Boolean(users[1]?.name && users[1].name.trim() !== ''),
    };
}

/**
 * Vue d'ensemble enrichie (overview) pour le MCP : le snapshot + liquidités,
 * placements, ventilation par compte, cashflow mensuel normalisé (budget) et
 * dette totale. Utilise les agrégats budgétaires NORMALISÉS par fréquence
 * (`computeMonthlyBudgetAggregates`) pour le cashflow, plus précis que la somme
 * brute du snapshot historique.
 */
export function buildFinancialOverview(
    state: AppState,
    opts?: { projectedNetWorth20y?: number },
): FinancialOverview {
    const snapshot = buildFinancialSnapshot(state, opts);
    const fx = state.fxRates ?? {};
    const assets = state.assets ?? [];
    const budget = computeMonthlyBudgetAggregates(state.config, state.budgetItems ?? []);

    return {
        ...snapshot,
        currency: 'CAD',
        liquidity: computeCurrentLiquidity(state.initialBalances ?? {}, state.transactions ?? []),
        investments: computeInvestmentsValue(assets, fx),
        accounts: computeAssetBreakdown(assets, fx),
        monthlyCashflow: budget.savings,
        totalDebt: computeTotalDebt(state.debts ?? []),
        userCount: (state.config?.users ?? []).filter((u) => u && (u.name || u.grossSalary)).length,
    };
}
