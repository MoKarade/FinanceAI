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
import { computeMonthlyActualAverages } from '../utils/budgetSync';
import { isCoupleMode } from './couple/netWorthByOwner';
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
interface FinancialSnapshot {
    netWorth: number;
    monthlyIncome: number;
    /** [INCOME-3WAY-SPLIT, audit 2026-07-16] Provenance du revenu : 'transactions' = moyenne RÉELLE
     *  (paie + divers, mois pleins — la même base que l'onglet Budget) ; 'declared' = repli sur le
     *  salaire saisi (aucun mois plein de transactions). Permet aux prompts/tools d'ÉTIQUETER le
     *  chiffre au lieu de faire raisonner l'IA sur un salaire d'onboarding que l'utilisateur ne voit
     *  plus (l'angle mort nommé par la leçon BUDGET-INCOME-REAL). Additif optionnel (compat claude.ts). */
    monthlyIncomeSource?: 'transactions' | 'declared';
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
    /** Épargne mensuelle = max(0, monthlyIncome − monthlyExpenses) — MÊME base de revenu que
     *  `monthlyIncome` (réelle ou déclarée, cf `monthlyIncomeSource`), sinon le payload se
     *  contredit lui-même (finding panel INCOME-3WAY-SPLIT : cashflow resté sur le déclaré). */
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
 *  - revenu mensuel = moyenne RÉELLE des transactions de revenu (paie + divers, même base que
 *    Budget), repli étiqueté sur le salaire déclaré sans mois plein (`monthlyIncomeSource`) ;
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
    // (Les intermédiaires investments/liquidity/totalDebt ont été absorbés par computePresentNetWorth —
    // locales mortes retirées, audit 2026-07-16.)
    // Source unique du NW présent (parité Dashboard/IA/moteur garantie par construction).
    const netWorth = computePresentNetWorth(state.initialBalances ?? {}, state.transactions ?? [], assets, fx, state.debts ?? []);

    const users = state.config?.users ?? [];
    // [INCOME-3WAY-SPLIT, audit 2026-07-16] Revenu = moyenne RÉELLE des transactions (paie + divers,
    // mois pleins, même base que l'onglet Budget — computeMonthlyActualAverages restreint aux
    // INCOME_CATEGORIES, remboursements exclus). Repli HONNÊTE sur le salaire déclaré s'il n'y a
    // aucun mois plein de transactions ; la provenance est exposée pour que les prompts étiquettent.
    // Avant : Σ netSalary d'onboarding → l'IA/MCP raisonnait sur un chiffre que l'utilisateur ne
    // voit plus depuis BUDGET-INCOME-REAL (contradiction déplacée).
    const realAvg = computeMonthlyActualAverages(state.transactions ?? []);
    const declaredIncome = (users[0]?.netSalary || 0) + (users[1]?.netSalary || 0);
    const useReal = realAvg.fullMonths > 0 && realAvg.incomeAvg > 0;
    const monthlyIncome = useReal ? realAvg.incomeAvg : declaredIncome;
    const monthlyIncomeSource: 'transactions' | 'declared' = useReal ? 'transactions' : 'declared';
    // [L4 audit 2026-06-17] Dépenses mensuelles NORMALISÉES par fréquence (annuel/trim/hebdo) et HORS
    // épargne, via le helper partagé — avant : Σ brute des cibles (un poste annuel compté ×12, faux pour IA/MCP).
    const monthlyExpenses = computeMonthlyBudgetAggregates(state.config, state.budgetItems ?? []).expenses;

    return {
        netWorth,
        monthlyIncome,
        monthlyIncomeSource,
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
        coupleMode: isCoupleMode(users), // [COUPLE-PREDICAT-COPIES] source unique
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

    return {
        ...snapshot,
        currency: 'CAD',
        liquidity: computeCurrentLiquidity(state.initialBalances ?? {}, state.transactions ?? []),
        investments: computeInvestmentsValue(assets, fx),
        accounts: computeAssetBreakdown(assets, fx),
        // Cashflow sur la MÊME base de revenu que snapshot.monthlyIncome (réelle, repli déclaré) —
        // l'ancien `budget.savings` restait sur Σ netSalary : `monthlyIncome − monthlyExpenses`
        // dans le même payload ne redonnait pas monthlyCashflow (contradiction interne pour l'IA).
        monthlyCashflow: Math.max(0, snapshot.monthlyIncome - snapshot.monthlyExpenses),
        totalDebt: computeTotalDebt(state.debts ?? []),
        userCount: (state.config?.users ?? []).filter((u) => u && (u.name || u.grossSalary)).length,
    };
}
