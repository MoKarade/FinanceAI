// mcp/tools/getRetirementOutlook.spec.ts
// [ARCH-AITOOLS-SPLIT] SPEC pur (browser-safe) — logique VERBATIM de l'ancien tool, sans SDK MCP.
// Enregistrement serveur : getRetirementOutlook.tool.ts. Parité app/MCP : tests/aiTools/registryParity.
// Lot 1 — perspective retraite / FIRE sur les VRAIES données.

import { z } from 'zod';
import type { AppState } from '../../types';
// [AITOOLS-ENGINE-WORKER] runProjectionAsync : Web Worker côté navigateur, repli sync Node/MCP.
import { runProjectionAsync } from '../../services/projection/runAsync';
import type { ProjectionChartPoint } from '../../services/projection/types';
import { buildSimulationParamsFromState } from '../../services/projection/buildSimulationParams';
import { jsonContent, withState } from './_dataAware';
import type { ReadToolSpec } from './_toolSpec';

const inputSchema = {
    monteCarlo: z.boolean().default(true)
        .describe('Active Monte Carlo pour la probabilité de réussite (défaut: true).'),
};

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

/** Âge au 1er mois où la valeur nette atteint la cible FIRE (sinon null). */
function fireAgeOf(chartData: ProjectionChartPoint[]): number | null {
    const d = chartData.find((p) => (p.FireTarget || 0) > 0 && (p.NetWorth || 0) >= (p.FireTarget || 0));
    return d ? (d.age ?? null) : null;
}

/**
 * [MCP-RETIREMENT-VERDICT] — revenu de retraite mensuel MOYEN sur la 1re année de retraite,
 * décomposé par source, en NOMINAL et en RÉEL (déflaté point par point).
 *
 * Pourquoi la moyenne 12 mois (pas le 1er point) : les retraits du portefeuille varient d'un mois à
 * l'autre (impôts d'avril, rééquilibrages) et les rentes peuvent démarrer plus tard (RRQ à 60/65 pour
 * une retraite à 55) — un instantané du 1er mois sous-estime systématiquement.
 *
 * Pourquoi inclure les RETRAITS (RetraitREER/RetraitCELI) et les LOYERS (RentalIncome) : le champ
 * moteur `IncomeRetirement` ne contient QUE les rentes (RRQ+PSV+privée). L'ancien verdict comparait
 * ces rentes seules à la cible → « sous la cible » alors que Monte Carlo disait 100 % : le
 * décaissement du portefeuille (déjà émis par le moteur, source unique — on ne recalcule PAS une
 * règle de 4 %) finançait la majorité du train de vie et était ignoré (audit 2026-07-14 : 542 k$ de
 * retraits comptés pour zéro). Montants BRUTS (avant impôt), comme les rentes déjà exposées.
 */
function averageRetirementIncome(
    chartData: ProjectionChartPoint[],
    inflationRate: number,
): {
    monthsSampled: number;
    nominal: { total: number; government: number; private: number; withdrawals: number; rental: number };
    real: { total: number; government: number; private: number; withdrawals: number; rental: number };
} {
    const retired = chartData.filter((d) => d.isRetired === true).slice(0, 12);
    const zero = { total: 0, government: 0, private: 0, withdrawals: 0, rental: 0 };
    if (retired.length === 0) return { monthsSampled: 0, nominal: { ...zero }, real: { ...zero } };

    // Déflateur PAR POINT (cohérent moteur : realNetWorth/NetWorth = 1/expenseMultiplier du mois),
    // avec repli inflation composée si NetWorth ≤ 0 (retraité insolvable) ou realNetWorth
    // absent/NON FINI. `Number.isFinite` (pas `!= null`) : un realNetWorth PRÉSENT mais NaN se
    // propagerait aux 12 points de la moyenne puis sortirait en `null` silencieux dans le JSON
    // (finding panel 2026-07-14 — la moyenne AMPLIFIE l'exposition vs l'ancien point unique).
    const deflatorOf = (p: ProjectionChartPoint): number =>
        p.NetWorth > 0 && Number.isFinite(p.realNetWorth)
            ? (p.realNetWorth as number) / p.NetWorth
            : 1 / Math.pow(1 + inflationRate / 100, (p.monthIndex ?? 0) / 12);

    const nominal = { ...zero };
    const real = { ...zero };
    for (const p of retired) {
        const gov = (p.pensionRRQ ?? 0) + (p.pensionPSV ?? 0);
        const priv = p.pensionPrivee ?? 0;
        // IncomeRetirement = rentes totales moteur (RRQ+PSV+privée, net du clawback PSV) — on le
        // préfère à gov+priv pour le total (source unique), gov/priv restant le détail affiché.
        const pensions = p.IncomeRetirement ?? gov + priv;
        const withdrawals = (p.RetraitREER ?? 0) + (p.RetraitCELI ?? 0);
        const rental = p.RentalIncome ?? 0;
        const d = deflatorOf(p);
        nominal.government += gov;
        nominal.private += priv;
        nominal.withdrawals += withdrawals;
        nominal.rental += rental;
        nominal.total += pensions + withdrawals + rental;
        real.government += gov * d;
        real.private += priv * d;
        real.withdrawals += withdrawals * d;
        real.rental += rental * d;
        real.total += (pensions + withdrawals + rental) * d;
    }
    const n = retired.length;
    const avg = (o: typeof zero): typeof zero => ({
        total: o.total / n, government: o.government / n, private: o.private / n,
        withdrawals: o.withdrawals / n, rental: o.rental / n,
    });
    return { monthsSampled: n, nominal: avg(nominal), real: avg(real) };
}

// `satisfies` (pas une annotation) : préserve les types CONCRETS de inputSchema → server.tool
// infère les bons args et le handler reste fortement typé (une annotation élargirait le shape).
export const getRetirementOutlookSpec = {
    kind: 'read',
    name: 'get_retirement_outlook',
    description:
        "Perspective de RETRAITE et d'indépendance financière (FIRE) sur les vraies données de " +
        "l'utilisateur. Renvoie l'âge cible de retraite, l'âge FIRE atteignable, le revenu de retraite " +
        "projeté EN DOLLARS D'AUJOURD'HUI décomposé par source — rentes RRQ/PSV + pensions privées + " +
        'DÉCAISSEMENT du portefeuille (retraits REER/CELI) + loyers, moyenne de la 1re année de ' +
        'retraite —, la cible de revenu, et un verdict meetsIncomeTarget basé sur la SOUTENABILITÉ du ' +
        'plan (le moteur finance-t-il le train de vie cible jusqu\'au bout sans épuiser le patrimoine, ' +
        'minNetWorth + Monte Carlo) — PAS sur la somme des sources (le décaissement non-enregistré ' +
        'n\'y est pas détaillé).',
    inputSchema,
    handler: async ({ monteCarlo }, getState) => withState(getState, async (state: AppState) => {
        const params = buildSimulationParamsFromState(state);
        const result = await runProjectionAsync(params, monteCarlo, 0); // BASE
        const chartData = result.chartData ?? [];

        // Les revenus du moteur sont en dollars NOMINAUX (futurs). On les ramène en dollars
        // d'AUJOURD'HUI (déflateur par point, cohérent moteur) pour les comparer à la cible
        // (saisie en $ d'aujourd'hui) — sinon on compare un revenu 2064 à une cible 2026.
        const inflationRate = state.projection?.inflationRate ?? 2;
        const income = averageRetirementIncome(chartData, inflationRate);
        const incomeReal = Math.round(income.real.total);
        const incomeNominal = Math.round(income.nominal.total);

        const targetMonthlyIncome = state.retirementGoal?.targetMonthlyIncome ?? 0; // $ d'aujourd'hui
        // Verdict d'ADÉQUATION DU PLAN (pas une somme de revenus) : le moteur dépense le train de
        // vie CIBLE chaque mois de retraite et le finance par rentes + décaissement (REER/CELI/
        // non-enregistré/liquide). Si le patrimoine reste > 0 sur toute la PHASE RETRAITE, la
        // cible est financée jusqu'au bout ; s'il s'épuise, le plan casse. Sommer les flux de
        // revenus sous-estimerait systématiquement (le décaissement non-enregistré/liquide n'a
        // pas de champ Retrait*, mesuré : 3 923 $ identifiables vs cible 5 500 $ sur un plan qui
        // TIENT à MC 98 %). ⚠️ Min sur la RETRAITE seulement, pas `result.minNetWorth` (min de
        // TOUT l'horizon) : un creux transitoire ≤ 0 en ACCUMULATION (dette étudiante/conso
        // précoce) donnerait un faux « plan insoutenable » alors que la retraite est financée
        // (finding panel 2026-07-14). Pas de phase retraite dans l'horizon → repli sur le min
        // global (un plan qui casse avant la retraite échoue de toute façon).
        // Monte Carlo (défaut true) raffine : < 85 % de réussite = plan fragile malgré la BASE
        // verte — c'est aussi le filet du cas « house-rich, cash-poor » (l'équité immo illiquide
        // gonfle le NW ; MC, lui, échoue si les liquides ne suivent pas).
        const retiredAll = chartData.filter((d) => d.isRetired === true);
        const minRetirementNW = retiredAll.length > 0
            ? Math.min(...retiredAll.map((p) => p.NetWorth ?? 0))
            : (result.minNetWorth ?? 0);
        // ⚠️ Survie BRUTE (`survivalRatePct`), PAS `result.successRate` : ce dernier est écrasé
        // par le FVI (score composite) quand MC tourne — seuiller le FVI dirait « plan solide »
        // à 50 % de survie réelle si sécurité/efficacité/legs compensent (finding panel).
        const mcSuccess = monteCarlo ? (result.survivalRatePct ?? null) : null;
        const meetsTarget = targetMonthlyIncome > 0 && minRetirementNW > 0 && (mcSuccess == null || mcSuccess >= 85);
        const pensionsRealMonthly = Math.round(income.real.government + income.real.private);
        const withdrawalsRealMonthly = Math.round(income.real.withdrawals);
        const fireAge = fireAgeOf(chartData);

        return jsonContent({
            currency: 'CAD',
            dollarsBasis:
                "Revenus de retraite en DOLLARS D'AUJOURD'HUI (déflatés), MOYENNE MENSUELLE de la " +
                '1re année de retraite, comparables à la cible ; les champs *Nominal sont en dollars ' +
                'futurs. Montants BRUTS (avant impôt). estateNetWorth / minNetWorth restent NOMINAUX.',
            targetRetirementAge: state.retirementGoal?.targetAge ?? null,
            fireReached: fireAge != null,
            fireAge,
            targetMonthlyIncome: Math.round(targetMonthlyIncome),
            projectedRetirementIncomeMonthly: incomeReal,
            projectedRetirementIncomeMonthlyNominal: incomeNominal,
            incomeSources: {
                governmentPensions: Math.round(income.real.government),
                privatePensions: Math.round(income.real.private),
                // Décaissement du portefeuille (retraits REER+CELI émis par le moteur) — la
                // source de revenu majoritaire d'un retraité autofinancé, désormais VISIBLE.
                portfolioWithdrawals: withdrawalsRealMonthly,
                rentalIncome: Math.round(income.real.rental),
                governmentPensionsNominal: Math.round(income.nominal.government),
                privatePensionsNominal: Math.round(income.nominal.private),
                portfolioWithdrawalsNominal: Math.round(income.nominal.withdrawals),
                rentalIncomeNominal: Math.round(income.nominal.rental),
                note:
                    'Le décaissement du NON-ENREGISTRÉ et du liquide (ventes de placements hors ' +
                    "REER/CELI) finance aussi le train de vie mais n'est pas détaillé ici (pas de " +
                    'flux dédié dans le moteur) → la somme des sources peut être SOUS la cible ' +
                    'alors que le plan tient. Le verdict meetsIncomeTarget est basé sur la ' +
                    'soutenabilité du PLAN (minNetWorth + Monte Carlo), pas sur cette somme.',
            },
            meetsIncomeTarget: meetsTarget,
            estateNetWorth: Math.round(result.estateNetWorth ?? result.finalNetWorth ?? 0),
            minNetWorth: Math.round(result.minNetWorth ?? 0),
            // Min du patrimoine sur la PHASE RETRAITE (le signal du verdict) — distinct de
            // minNetWorth (min de tout l'horizon, accumulation incluse).
            minRetirementNetWorth: Math.round(minRetirementNW),
            shortfallRate: Number((result.shortfallRate ?? 0).toFixed(3)),
            monteCarlo: monteCarlo
                ? {
                    // Survie BRUTE (% de simulations finissant patrimoine > 0). Avant ce fix,
                    // ce champ portait le FVI (mislabel pré-existant : successRate moteur = FVI).
                    successProbabilityPct: result.survivalRatePct ?? null,
                    financialVitalityIndex: result.fvi ?? null,
                }
                : null,
            verdict: meetsTarget
                ? `Le plan FINANCE le train de vie cible jusqu'au bout de l'horizon (rentes ` +
                  `${pensionsRealMonthly} $ + retraits REER/CELI ${withdrawalsRealMonthly} $/mois réels, ` +
                  'complétés par le décaissement non-enregistré/liquide' +
                  (mcSuccess != null ? ` ; Monte Carlo ${mcSuccess} %` : '') + ').'
                : targetMonthlyIncome > 0
                    ? (minRetirementNW <= 0
                        ? 'Le plan NE finance PAS le train de vie cible jusqu\'au bout : le patrimoine ' +
                          's\'épuise pendant la retraite — ajuster épargne, âge ou dépenses.'
                        : `Le plan tient en scénario de base mais est FRAGILE (Monte Carlo ${mcSuccess} % ` +
                          '< 85 %) — une mauvaise séquence de rendements peut l\'épuiser.')
                    : 'Aucune cible de revenu de retraite définie.',
        });
    }),
} satisfies ReadToolSpec<Args>;
