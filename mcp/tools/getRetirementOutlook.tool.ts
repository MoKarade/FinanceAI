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
        'projeté (RRQ/PSV + pensions privées au début de la retraite), la cible de revenu, un verdict de ' +
        'suffisance, et (Monte Carlo) la probabilité de réussite + indice de vitalité financière.',
        inputSchema,
        async ({ monteCarlo }) => withState(getState, (state: AppState) => {
            const params = buildSimulationParamsFromState(state);
            const result = calculateFutureProjection(params, monteCarlo, 0); // BASE
            const chartData = result.chartData ?? [];

            const retired = firstRetiredPoint(chartData);
            const govMonthly = retired
                ? Math.round((retired.pensionRRQ ?? 0) + (retired.pensionPSV ?? 0))
                : 0;
            const privateMonthly = retired ? Math.round(retired.pensionPrivee ?? 0) : 0;
            const projectedRetirementIncome = retired
                ? Math.round(retired.IncomeRetirement ?? govMonthly + privateMonthly)
                : 0;

            const targetMonthlyIncome = state.retirementGoal?.targetMonthlyIncome ?? 0;
            const meetsTarget = targetMonthlyIncome > 0 && projectedRetirementIncome >= targetMonthlyIncome;
            const fireAge = fireAgeOf(chartData);

            return jsonContent({
                currency: 'CAD',
                targetRetirementAge: state.retirementGoal?.targetAge ?? null,
                fireReached: fireAge != null,
                fireAge,
                targetMonthlyIncome: Math.round(targetMonthlyIncome),
                projectedRetirementIncomeMonthly: projectedRetirementIncome,
                incomeSources: {
                    governmentPensions: govMonthly,
                    privatePensions: privateMonthly,
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
