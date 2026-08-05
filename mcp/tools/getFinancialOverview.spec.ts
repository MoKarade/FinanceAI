// mcp/tools/getFinancialOverview.spec.ts
// [ARCH-AITOOLS-SPLIT] SPEC pur (browser-safe) — logique VERBATIM de l'ancien tool, sans SDK MCP.
// Enregistrement serveur : getFinancialOverview.tool.ts. Parité app/MCP : tests/aiTools/registryParity.

import type { AppState } from '../../types';
import { buildFinancialOverview } from '../../services/financialSnapshot';
import { syncHealthFromState } from '../../services/fintable/syncHealth';
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
        "totale, dettes principales et objectifs actifs. Aucun paramètre : répond sur l'état chargé. " +
        "Inclut syncHealth : FRAÎCHEUR de l'import bancaire (ok / stale / error / never). Si le statut " +
        "n'est pas « ok », le DIRE avant de commenter des montants — ils peuvent être figés depuis des " +
        'jours ; `reason` nomme déjà la cause probable.',
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
            // [Finding panel ai-reviewer 2026-07-21] Faits utilisateur EXACTS requis par les
            // calculateurs (get_tax_room exige birthYear/arrivalYear, exposés NULLE PART ailleurs) —
            // sans eux, le modèle devait les APPROXIMER depuis currentAge (espace CELI faux présenté
            // avec confiance). `name` passe par le scrub USER_TEXT_KEYS comme partout.
            userFacts: (state.config?.users ?? [])
                .filter((u) => u && (u.name || u.grossSalary))
                .map((u) => ({
                    name: u.name,
                    birthYear: u.birthYear ?? null,
                    canadaArrivalYear: u.canadaArrivalYear ?? null,
                })),
            topDebts: o.topDebts.map((d) => ({ name: d.name, balance: Math.round(d.balance), rate: d.rate })),
            activeGoals: o.activeGoals.map((g) => ({
                name: g.name,
                targetAmount: Math.round(g.targetAmount),
                currentAmount: Math.round(g.currentAmount),
                deadline: g.deadline,
            })),
            // [FINTABLE-STALE-ALERT] Santé de l'import bancaire — exposée ICI parce que son absence
            // a coûté 5 jours : le 2026-08-05, l'import de Marc était gelé et AUCUN tool ne
            // permettait de s'en apercevoir à distance ; il a fallu qu'il le remarque lui-même.
            // Toute réponse portant des montants doit dire si ces montants sont encore FRAIS.
            syncHealth: (() => {
                const h = syncHealthFromState(state, Date.now());
                return {
                    status: h.status,
                    lastTransactionDate: h.lastTransactionDate,
                    daysSinceLastTransaction: h.daysSinceLastTransaction,
                    hoursSinceLastSync: h.hoursSinceLastSync,
                    staleThresholdDays: h.staleThresholdDays,
                    lastError: h.lastError,
                    reason: h.reason,
                };
            })(),
        });
    }),
} satisfies ReadToolSpec<Record<string, never>>;
