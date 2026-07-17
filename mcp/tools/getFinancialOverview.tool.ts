// mcp/tools/getFinancialOverview.tool.ts
// Lot 1 — Q&A « data-aware » : vue d'ensemble du patrimoine RÉEL de l'utilisateur.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppState } from '../../types';
import { buildFinancialOverview } from '../../services/financialSnapshot';
import { jsonContent, withState, type StateProvider } from './_dataAware';

export const registerGetFinancialOverview = (server: McpServer, getState: StateProvider): void => {
    server.tool(
        'get_financial_overview',
        "Vue d'ensemble des finances RÉELLES de l'utilisateur (lue depuis son état FinanceAI) : " +
        'patrimoine net, liquidités, valeur des placements, ventilation par compte (CELI/REER/CELIAPP/' +
        'REEE/non-enregistré/crypto), revenu et dépenses mensuels, cashflow (épargne) mensuel, dette ' +
        "totale, dettes principales et objectifs actifs. Aucun paramètre : répond sur l'état chargé.",
        {},
        async () => withState(getState, (state: AppState) => {
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
    );
};
