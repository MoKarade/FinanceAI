// mcp/tools/getRetirementOutlook.tool.ts
// Lot 1 — perspective retraite / FIRE sur les VRAIES données.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AppState } from '../../types';
import { calculateFutureProjection } from '../../services/projection';
import type { ProjectionChartPoint } from '../../services/projection/types';
import { buildSimulationParamsFromState } from '../../services/projection/buildSimulationParams';
import { jsonContent, withState, type StateProvider } from './_dataAware';

const inputSchema = {
    monteCarlo: z.boolean().default(true)
        .describe('Active Monte Carlo pour la probabilité de réussite (défaut: true).'),
};

/** 1er point de la phase retraite (isRetired) — sert à lire les rentes mensuelles. */
function firstRetiredPoint(chartData: ProjectionChartPoint[]): ProjectionChartPoint | undefined {
    return chartData.find((d) => d.isRetired === true);
}

/** Âge au 1er mois où la valeur nette atteint la cible FIRE (sinon null). */
function fireAgeOf(chartData: ProjectionChartPoint[]): number | null {
    const d = chartData.find((p) => (p.FireTarget || 0) > 0 && (p.NetWorth || 0) >= (p.FireTarget || 0));
    return d ? (d.age ?? null) : null;
}

export const registerGetRetirementOutlook = (server: McpServer, getState: StateProvider): void => {
    server.tool(
        'get_retirement_outlook',
        "Perspective de RETRAITE et d'indépendance financière (FIRE) sur les vraies données de " +
        "l'utilisateur. Renvoie l'âge cible de retraite, l'âge FIRE atteignable, le revenu de retraite " +
        "projeté EN DOLLARS D'AUJOURD'HUI (RRQ/PSV + pensions privées au début de la retraite, déflatés " +
        "de l'inflation pour être comparables à la cible), la cible de revenu, un verdict de " +
        'suffisance, et (Monte Carlo) la probabilité de réussite + indice de vitalité financière.',
        inputSchema,
        async ({ monteCarlo }) => withState(getState, (state: AppState) => {
            const params = buildSimulationParamsFromState(state);
            const result = calculateFutureProjection(params, monteCarlo, 0); // BASE
            const chartData = result.chartData ?? [];

            const retired = firstRetiredPoint(chartData);

            // Les rentes/revenus du moteur sont en dollars NOMINAUX (futurs, p. ex.
            // 2064). On les ramène en dollars d'AUJOURD'HUI pour les comparer à la
            // cible (saisie en $ d'aujourd'hui) — sinon on compare des pommes (revenu
            // 2064) à des oranges (cible 2026). Déflateur cohérent avec le moteur :
            // realNetWorth/NetWorth = 1/expenseMultiplier au mois de la retraite
            // (cf monthlyOutput.ts), avec repli sur (1+inflation)^années.
            const inflationRate = state.projection?.inflationRate ?? 2;
            const deflator =
                retired && retired.NetWorth > 0 && retired.realNetWorth != null
                    ? retired.realNetWorth / retired.NetWorth
                    : 1 / Math.pow(1 + inflationRate / 100, retired ? (retired.monthIndex ?? 0) / 12 : 0);

            const govNominal = retired
                ? Math.round((retired.pensionRRQ ?? 0) + (retired.pensionPSV ?? 0))
                : 0;
            const privateNominal = retired ? Math.round(retired.pensionPrivee ?? 0) : 0;
            const incomeNominal = retired
                ? Math.round(retired.IncomeRetirement ?? govNominal + privateNominal)
                : 0;
            const incomeReal = Math.round(incomeNominal * deflator);

            const targetMonthlyIncome = state.retirementGoal?.targetMonthlyIncome ?? 0; // $ d'aujourd'hui
            // Comparaison apples-to-apples : revenu RÉEL (déflaté) vs cible (déjà en $ d'aujourd'hui).
            const meetsTarget = targetMonthlyIncome > 0 && incomeReal >= targetMonthlyIncome;
            const fireAge = fireAgeOf(chartData);

            return jsonContent({
                currency: 'CAD',
                dollarsBasis:
                    "Revenus de retraite en DOLLARS D'AUJOURD'HUI (déflatés), comparables à la cible ; " +
                    'les champs *Nominal sont en dollars futurs au début de la retraite. ' +
                    'estateNetWorth / minNetWorth restent NOMINAUX (patrimoine futur).',
                targetRetirementAge: state.retirementGoal?.targetAge ?? null,
                fireReached: fireAge != null,
                fireAge,
                targetMonthlyIncome: Math.round(targetMonthlyIncome),
                projectedRetirementIncomeMonthly: incomeReal,
                projectedRetirementIncomeMonthlyNominal: incomeNominal,
                incomeSources: {
                    governmentPensions: Math.round(govNominal * deflator),
                    privatePensions: Math.round(privateNominal * deflator),
                    governmentPensionsNominal: govNominal,
                    privatePensionsNominal: privateNominal,
                },
                meetsIncomeTarget: meetsTarget,
                estateNetWorth: Math.round(result.estateNetWorth ?? result.finalNetWorth ?? 0),
                minNetWorth: Math.round(result.minNetWorth ?? 0),
                shortfallRate: Number((result.shortfallRate ?? 0).toFixed(3)),
                monteCarlo: monteCarlo
                    ? {
                        successProbabilityPct: result.successRate ?? null,
                        financialVitalityIndex: result.fvi ?? null,
                    }
                    : null,
                verdict: meetsTarget
                    ? 'Le revenu de retraite projeté couvre la cible.'
                    : targetMonthlyIncome > 0
                        ? 'Le revenu de retraite projeté est sous la cible — ajuster épargne, âge ou dépenses.'
                        : 'Aucune cible de revenu de retraite définie.',
            });
        }),
    );
};
