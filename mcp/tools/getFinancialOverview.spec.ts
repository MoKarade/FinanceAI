// mcp/tools/getFinancialOverview.spec.ts
// [ARCH-AITOOLS-SPLIT] SPEC pur (browser-safe) — logique VERBATIM de l'ancien tool, sans SDK MCP.
// Enregistrement serveur : getFinancialOverview.tool.ts. Parité app/MCP : tests/aiTools/registryParity.

import type { AppState } from '../../types';
import { buildFinancialOverview } from '../../services/financialSnapshot';
import { jsonContent, withState } from './_dataAware';
import type { ReadToolSpec } from './_toolSpec';

// `satisfies` (pas une annotation) : préserve les types concrets → inférence server.tool correcte.
export const getFinancialOverviewSpec = {
    kind: 'read',
    name: 'get_financial_overview',
    description:
        "Vue d'ensemble des finances RÉELLES de l'utilisateur (lue depuis son état FinanceAI) : " +
        'patrimoine net, liquidités, valeur des placements, ventilation par compte (CELI/REER/CELIAPP/' +
        'REEE/non-enregistré/crypto), revenu et dépenses mensuels, cashflow (épargne) mensuel, dette ' +
        "totale, dettes principales et objectifs actifs. Aucun paramètre : répond sur l'état chargé.",
    inputSchema: {},
    handler: async (_args, getState) => withState(getState, (state: AppState) => {
        const o = buildFinancialOverview(state);
        return jsonContent({
            currency: o.currency,
            netWorth: Math.round(o.netWorth),
            liquidity: Math.round(o.liquidity),
            investments: Math.round(o.investments),
            accounts: {
                celi: Math.round(o.accounts.celi),
                reer: Math.round(o.accounts.reer),
                reee: Math.round(o.accounts.reee),
                nonReg: Math.round(o.accounts.nonReg),
                crypto: Math.round(o.accounts.crypto),
            },
            monthlyIncome: Math.round(o.monthlyIncome),
            // Provenance du revenu : 'transactions' = moyenne réelle (même base que Budget),
            // 'declared' = salaire d'onboarding (repli sans historique). Sans cette étiquette,
            // l'IA prendrait un salaire déclaré pour le revenu réel (BUDGET-INCOME-REAL).
            monthlyIncomeSource: o.monthlyIncomeSource,
            monthlyExpenses: Math.round(o.monthlyExpenses),
            monthlyCashflow: Math.round(o.monthlyCashflow),
            totalDebt: Math.round(o.totalDebt),
            currentAge: o.currentAge,
            retirementAge: o.retirementAge,
            coupleMode: o.coupleMode,
            topDebts: o.topDebts.map((d) => ({ name: d.name, balance: Math.round(d.balance), rate: d.rate })),
            activeGoals: o.activeGoals.map((g) => ({
                name: g.name,
                targetAmount: Math.round(g.targetAmount),
                currentAmount: Math.round(g.currentAmount),
                deadline: g.deadline,
            })),
        });
    }),
} satisfies ReadToolSpec<Record<string, never>>;
