// mcp/tools/getProjection.spec.ts
// [ARCH-AITOOLS-SPLIT] SPEC pur (browser-safe) — logique VERBATIM de l'ancien tool, sans SDK MCP.
// Enregistrement serveur : getProjection.tool.ts. Parité app/MCP : tests/aiTools/registryParity.
//
// Lot 1 — « mon patrimoine dans X ans » sur les VRAIES données, via l'adaptateur
// pur (Lot 0) + le moteur pur calculateFutureProjection.

import { z } from 'zod';
import type { AppState } from '../../types';
// [AITOOLS-ENGINE-WORKER] runProjectionAsync : Web Worker côté navigateur (l'UI ne gèle plus
// pendant le calcul), repli SYNCHRONE identique côté Node/MCP — même moteur, mêmes résultats.
import { runProjectionAsync } from '../../services/projection/runAsync';
import type { ProjectionResult } from '../../services/projection/types';
import { buildSimulationParamsFromState } from '../../services/projection/buildSimulationParams';
import { extractYearlySeries, fireAgeOf } from '../whatIf';
import { jsonContent, withState } from './_dataAware';
import type { ReadToolSpec } from './_toolSpec';
import { CLAUSE_DONNEES_TOOL } from '../instructions'; // [MCP-NO-INJECTION-FRAME] même texte pour le chat in-app ET le MCP

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
    includeSeries: z.boolean().default(false)
        .describe('Inclure la série ANNUELLE réelle (patrimoine nominal/réel, comptes, dettes, par âge) ' +
            'pour tracer un graphique avec les chiffres EXACTS du moteur.'),
};

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

// `satisfies` (pas une annotation) : préserve les types CONCRETS de inputSchema → server.tool
// infère les bons args et le handler reste fortement typé (une annotation élargirait le shape).
export const getProjectionSpec = {
    kind: 'read',
    name: 'get_projection',
    description:
        "Projette le patrimoine RÉEL de l'utilisateur à un horizon donné, à partir de tout son état " +
        '(comptes, salaires, budget, objectifs, immobilier, enfants, dettes…) via le moteur complet de ' +
        'FinanceAI. Renvoie le patrimoine final NOMINAL et RÉEL (déflaté), le patrimoine successoral, ' +
        "l'objectif FIRE, l'âge d'indépendance financière, et (si Monte Carlo) la probabilité de réussite." + CLAUSE_DONNEES_TOOL,
    inputSchema,
    handler: async ({ years, scenario, monteCarlo, includeSeries }, getState) => withState(getState, async (state: AppState) => {
        const params = buildSimulationParamsFromState(state);
        // Horizon demandé : on surcharge years sans muter l'état d'origine.
        params.projection = { ...params.projection, years };

        const stratType = SCENARIO_MAP[scenario as ScenarioArg];
        // [UI-SCEN] — le moteur ne calcule plus les 11 scénarios par défaut : un scénario
        // non-BASE doit être DEMANDÉ explicitement (sinon results[idx] serait undefined et
        // le fallback renverrait des chiffres BASE étiquetés du mauvais scénario — BLOCKER
        // attrapé par performance-optimizer). byScenario reflète ce qui est calculé (1 entrée,
        // ou 1+1 pour un stress demandé).
        const result = await runProjectionAsync(params, monteCarlo, 0,
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
            // [PROJ-TAXPAID-LABEL] — ex-`totalTaxesPaid`, renommé : ce compteur moteur n'agrège
            // que les RÉGULARISATIONS d'avril (+ retenues RRIF/REER en retraite), PAS l'impôt
            // retenu à la source sur les salaires → NÉGATIF pour un gros cotisant REER
            // (remboursements annuels) et sans rapport avec « l'impôt total payé » (audit
            // 2026-07-14, adversarial 3/3). Le nom + la note empêchent Claude de le présenter
            // comme la charge fiscale de l'utilisateur (le -50 253 $ qui l'a alarmé).
            netTaxSettlements: Math.round(result.totalTaxesPaid ?? 0),
            netTaxSettlementsNote:
                "Somme des régularisations fiscales (soldes/remboursements d'avril + impôts de " +
                "retraits en retraite) sur l'horizon — négatif = remboursements nets (grosses " +
                "cotisations REER). Ce N'EST PAS l'impôt total payé (l'impôt retenu à la source " +
                "sur les salaires n'y figure pas, ni la dette du dernier exercice non réglée à " +
                "l'horizon, ni l'impôt successoral — l'optimiseur de stratégies affiche lui " +
                "l'impôt total modélisé, les deux chiffres divergent par construction). " +
                'Pour la charge fiscale courante : get_tax_situation.',
            monteCarlo: monteCarlo
                ? {
                    // Survie BRUTE Monte Carlo (% de runs patrimoine final > 0) — PAS
                    // `result.successRate`, qui est écrasé par le FVI (score composite) quand
                    // MC tourne (mislabel pré-existant corrigé, finding panel 2026-07-14).
                    successProbabilityPct: result.survivalRatePct ?? null,
                    financialVitalityIndex: result.fvi ?? null,
                }
                : null,
            // Aperçu des autres façons de gérer (même monde BASE), pour comparaison.
            byScenario: (result.allResults as ProjectionResult[] | undefined)?.map((r) => ({
                name: r.strategyName,
                stratType: r.stratType,
                estateNetWorth: Math.round(r.estateNetWorth ?? 0),
            })) ?? [],
            // [MCP-WHATIF] série annuelle EXACTE du moteur (graphiques sans chiffre inventé).
            series: includeSeries ? extractYearlySeries(chartData) : null,
        });
    }),
} satisfies ReadToolSpec<Args>;
