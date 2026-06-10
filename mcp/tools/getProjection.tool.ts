// mcp/tools/getProjection.tool.ts
// Lot 1 — « mon patrimoine dans X ans » sur les VRAIES données, via l'adaptateur
// pur (Lot 0) + le moteur pur calculateFutureProjection.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AppState } from '../../types';
import { calculateFutureProjection } from '../../services/projection';
import type { ProjectionChartPoint, ProjectionResult } from '../../services/projection/types';
import { buildSimulationParamsFromState } from '../../services/projection/buildSimulationParams';
import { jsonContent, withState, type StateProvider } from './_dataAware';

// Scénarios exposés à Claude → stratType interne du moteur.
const SCENARIO_MAP = {
    BASE: 'BASE',
    LIBERTE_55: 'LIBERTE_55',
    STRESS: 'COMPOUND_STRESS',
    COMPOUND_STRESS: 'COMPOUND_STRESS',
} as const;
type ScenarioArg = keyof typeof SCENARIO_MAP;

const inputSchema = {
    years: z.number().int().min(1).max(50).default(20)
        .describe('Horizon en années (ex: 20 pour « dans 20 ans »). Défaut: 20.'),
    scenario: z.enum(['BASE', 'LIBERTE_55', 'STRESS', 'COMPOUND_STRESS']).default('BASE')
        .describe('Scénario : BASE (trajectoire actuelle), LIBERTE_55 (retraite à 55 ans), ' +
            'STRESS/COMPOUND_STRESS (krach + inflation + soins longue durée).'),
    monteCarlo: z.boolean().default(false)
        .describe('Active la simulation Monte Carlo (probabilité de réussite + vitalité financière).'),
};

/** Âge au 1er mois où la valeur nette atteint la cible FIRE (sinon null). */
function fireAgeOf(chartData: ProjectionChartPoint[]): number | null {
    const d = chartData.find((p) => (p.FireTarget || 0) > 0 && (p.NetWorth || 0) >= (p.FireTarget || 0));
    return d ? (d.age ?? null) : null;
}

export const registerGetProjection = (server: McpServer, getState: StateProvider): void => {
    server.tool(
        'get_projection',
        "Projette le patrimoine RÉEL de l'utilisateur à un horizon donné, à partir de tout son état " +
        '(comptes, salaires, budget, objectifs, immobilier, enfants, dettes…) via le moteur complet de ' +
        'FinanceAI. Renvoie le patrimoine final NOMINAL et RÉEL (déflaté), le patrimoine successoral, ' +
        "l'objectif FIRE, l'âge d'indépendance financière, et (si Monte Carlo) la probabilité de réussite.",
        inputSchema,
        async ({ years, scenario, monteCarlo }) => withState(getState, (state: AppState) => {
            const params = buildSimulationParamsFromState(state);
            // Horizon demandé : on surcharge years sans muter l'état d'origine.
            params.projection = { ...params.projection, years };

            const stratType = SCENARIO_MAP[scenario as ScenarioArg];
            // [UI-SCEN] — le moteur ne calcule plus les 11 scénarios par défaut : un scénario
            // non-BASE doit être DEMANDÉ explicitement (sinon results[idx] serait undefined et
            // le fallback renverrait des chiffres BASE étiquetés du mauvais scénario — BLOCKER
            // attrapé par performance-optimizer). byScenario reflète ce qui est calculé (1 entrée,
            // ou 1+1 pour un stress demandé).
            const result = calculateFutureProjection(params, monteCarlo, 0,
                stratType === 'BASE' ? undefined : [stratType]);

            const chartData = result.chartData ?? [];
            const last = chartData[chartData.length - 1];
            // PV-1 (2026-06-10) : nominal = NW BRUT du dernier point — même grandeur que
            // `realNetWorth` (sa version déflatée) → l'invariant réel ≤ nominal tient par
            // construction. Avant, nominal = estateNetWorth (succession : REER imposé au décès
            // + NPV rentes) comparé au NW brut déflaté = grandeurs incomparables (réel > nominal
            // possible). Le successoral est exposé SÉPARÉMENT (comme get_retirement_outlook),
            // ce que la description du tool promettait déjà.
            const finalNetWorthNominal = Math.round(last?.NetWorth ?? result.finalNetWorth ?? 0);
            const finalNetWorthReal = Math.round(last?.realNetWorth ?? finalNetWorthNominal);
            const fireAge = fireAgeOf(chartData);

            return jsonContent({
                currency: 'CAD',
                scenario,
                horizonYears: years,
                strategyName: result.strategyName ?? null,
                finalNetWorthNominal,
                finalNetWorthReal,
                estateNetWorth: Math.round(result.estateNetWorth ?? result.finalNetWorth ?? 0),
                fireNumber: Math.round(result.fireNumber ?? 0),
                fireReached: fireAge != null,
                fireAge,
                minNetWorth: Math.round(result.minNetWorth ?? 0),
                shortfallRate: Number((result.shortfallRate ?? 0).toFixed(3)),
                totalTaxesPaid: Math.round(result.totalTaxesPaid ?? 0),
                monteCarlo: monteCarlo
                    ? {
                        successProbabilityPct: result.successRate ?? null,
                        financialVitalityIndex: result.fvi ?? null,
                    }
                    : null,
                // Aperçu des autres façons de gérer (même monde BASE), pour comparaison.
                byScenario: (result.allResults as ProjectionResult[] | undefined)?.map((r) => ({
                    name: r.strategyName,
                    stratType: r.stratType,
                    estateNetWorth: Math.round(r.estateNetWorth ?? 0),
                })) ?? [],
            });
        }),
    );
};
