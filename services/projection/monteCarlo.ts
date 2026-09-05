// services/projection/monteCarlo.ts
// Cycle 6/7 split: module Monte Carlo autonome.
// Pattern injection de dépendance: runScenario passé en argument pour
// éviter dépendance circulaire avec projection.ts.

import { lifetimeTaxTotal } from './lifetimeTax';
import type { SimulationParams, AllocationStrategy, FutureScenarioType } from '../projection';
import type { EngineOverrides } from './strategyConfig';
import { logErrorThrottled } from '../errorLogger';

type RunScenarioFn = (
    params: SimulationParams,
    strategy: AllocationStrategy,
    enableMonteCarlo: boolean,
    delayPensions: boolean,
    mcIterationIndex: number,
    scenarioType?: FutureScenarioType,
    overrides?: EngineOverrides,
) => {
    chartData: { NetWorth: number }[];
    finalNetWorth: number;
    estateNetWorth: number;
    totalTaxesPaid: number;
    /** [ENG-TTP-UNSETTLED-PROPAGATE] dette du dernier exercice non réglée à l'horizon (signée) —
     *  optionnel : le vrai moteur la fournit toujours, un fake de test peut l'omettre (→ 0). */
    unsettledTaxAtHorizon?: number;
    /** [ENG-FVI-EFFICIENCY-ESTATE] impôt successoral — optionnel pour la même raison (fake → 0). */
    totalEstateTax?: number;
    totalGrowth: number;
    totalExpenses: number;
    minNetWorth: number;
    shortfallRate: number;
};

/** Bornes moteur des itérations Monte Carlo — SOURCE UNIQUE consommée par le calcul
 *  (projection.ts) ET par l'UI (libellé « Monte Carlo (N itér.) », input des paramètres
 *  avancés). [REFONTE-NAV-L2a] Avant : « 100 » re-codé en dur dans FutureProjection alors que
 *  `monteCarloIterations` est configurable → libellé mensonger dès qu'on changeait la valeur. */
export const MC_ITERATIONS_MIN = 50;
export const MC_ITERATIONS_MAX = 1000;
export const MC_ITERATIONS_DEFAULT = 100;

/** Nombre d'itérations réellement EXÉCUTÉES par le moteur pour une valeur demandée : défaut 100,
 *  borné 50–1000. Afficher autre chose que CE nombre, c'est mentir sur le calcul fait.
 *  [Panel #601, silent-failure] Distingue ABSENT (config jamais saisie : repli silencieux
 *  légitime) de PRÉSENT mais non fini (NaN/Infinity : donnée corrompue → logguée AVANT le
 *  repli, jamais avalée) — pattern `parseRate` de services/finance.ts. */
export function effectiveMcIterations(requested?: number): number {
    if (requested === undefined) return MC_ITERATIONS_DEFAULT; // absent : défaut légitime, silencieux
    if (typeof requested !== 'number' || !Number.isFinite(requested)) {
        logErrorThrottled('effectiveMcIterations:non-finite', {
            source: 'projection', severity: 'warning',
            message: `Itérations Monte Carlo non finies — repli sur le défaut (${MC_ITERATIONS_DEFAULT})`,
            context: { requested: String(requested) },
        });
        return MC_ITERATIONS_DEFAULT;
    }
    return Math.max(MC_ITERATIONS_MIN, Math.min(MC_ITERATIONS_MAX, requested));
}

/**
 * [MC-LABEL-FROZEN] Libellé du KPI « Taux de succès » de l'écran Futur.
 *
 * Extrait ici — et pas laissé dans le JSX — pour être testable : le défaut n'était pas dans le
 * composant mais dans ce QUI lui était passé (`TEST-AU-CONTRAT-NE-VOIT-PAS-L-APPELANT`).
 *
 * ⚠️ Trois cas, dont un qui n'existait pas avant : un résultat SANS compte (MC désactivé au moment
 * du calcul, ou projection produite avant ce lot) ne doit PAS emprunter le nombre à la
 * configuration courante. On affiche alors « Monte Carlo » tout court — un libellé incomplet est
 * honnête, un nombre faux ne l'est pas (no-fake-data).
 */
export const mcSublabel = (runMC: boolean, iterationsRun?: number | null): string => {
    if (!runMC) return 'Active MC pour calculer';
    return Number.isFinite(iterationsRun) && (iterationsRun as number) > 0
        ? `Monte Carlo (${iterationsRun} itér.)`
        : 'Monte Carlo';
};

export interface MonteCarloResult {
    /** [MC-LABEL-FROZEN] Nombre d'itérations RÉELLEMENT exécutées par CE calcul.
     *  ⚠️ Ce n'est pas le paramètre demandé : c'est `allRuns.length`. Le libellé de l'écran Futur
     *  lisait la config VIVANTE (`effectiveMcIterations(config.monteCarloIterations)`) alors que le
     *  résultat affiché peut être GELÉ — changer le curseur sans relancer faisait mentir le libellé
     *  sur le calcul montré. Un résultat porte donc désormais son propre compte. */
    iterationsRun: number;
    successRate: number;
    p10Data: number[];
    p50Data: number[];
    p90Data: number[];
    fvi: number;
    expertMetrics: {
        swr: number;
        taxLeakage: number;
        shortfallRisk: number;
        sequenceRiskPct: number;
        worstDecadeDrawdown: number;
        criticalDecadeStartYear: number;
        criticalDecadeEndYear: number;
    };
}

export function runMonteCarlo(
    runScenario: RunScenarioFn,
    params: SimulationParams,
    strategy: AllocationStrategy,
    delayPensions: boolean,
    iterations = 100,
    overrides: EngineOverrides = {},
    /** Heartbeat optionnel : appelé périodiquement (i, total) pendant la boucle MC.
     * Sert au watchdog multi-worker (évite un silence > timeout sur une config lourde). */
    onIteration?: (done: number, total: number) => void,
): MonteCarloResult {
    const allRuns: {
        netWorthByMonth: number[];
        finalNW: number;
        minNetWorth: number;
        totalTaxesPaid: number;
        unsettledTaxAtHorizon: number;
        totalGrowth: number;
        totalExpenses: number;
        shortfallRate: number;
        estateNetWorth: number;
        /** [ENG-FVI-EFFICIENCY-ESTATE] impôt successoral du run — l'efficacité du FVI score
         *  désormais l'impôt À VIE (lifetimeTaxTotal), pas seulement l'horizon. */
        totalEstateTax: number;
        // Tier 🟡 perf — on ne garde QUE la longueur (seul usage : nb de mois pour le SWR).
        // Les valeurs NetWorth sont déjà dans `netWorthByMonth` ; stocker le chartData complet
        // sur chaque run dupliquait ~nMonths objets × `iterations` (jusqu'à ~600k objets retenus).
        chartDataLength: number;
    }[] = [];
    const nMonths = params.projection.years * 12;

    for (let i = 0; i < iterations; i++) {
        // Heartbeat ~tous les 5% (au moins tous les 25 tours) → le worker poste un
        // progrès régulier même sur une config qui prend > 60s à elle seule.
        if (onIteration && i % Math.max(25, Math.floor(iterations / 20)) === 0) onIteration(i, iterations);
        const result = runScenario(params, strategy, true, delayPensions, i, 'BASE', overrides);
        const nwHistory = result.chartData.map((d: { NetWorth: number }) => d.NetWorth);
        while (nwHistory.length <= nMonths) nwHistory.push(0);
        allRuns.push({
            netWorthByMonth: nwHistory,
            finalNW: result.finalNetWorth,
            minNetWorth: result.minNetWorth,
            totalTaxesPaid: result.totalTaxesPaid,
            // [ENG-TTP-UNSETTLED-PROPAGATE] la dette du dernier exercice, jamais réglée par un
            // avril de l'horizon — sans elle, l'efficacité fiscale d'un horizon court était
            // aveugle à 8,6 % (10 ans) → 100 % (1 an) de l'impôt réel.
            unsettledTaxAtHorizon: result.unsettledTaxAtHorizon ?? 0,
            totalGrowth: result.totalGrowth,
            totalExpenses: result.totalExpenses,
            shortfallRate: result.shortfallRate,
            estateNetWorth: result.estateNetWorth,
            totalEstateTax: result.totalEstateTax ?? 0,
            chartDataLength: result.chartData.length,
        });
    }

    const successRate = Math.round((allRuns.filter(r => r.finalNW > 0).length / iterations) * 100);

    // [MC-BANDES-CROISEES] Percentiles PAR MOIS — audit de santé 2026-08-19.
    //
    // AVANT : on triait les trajectoires ENTIÈRES par patrimoine FINAL, puis on publiait
    // `sorted[10%].netWorthByMonth` comme « la bande P10 ». Ce n'était donc PAS un percentile
    // mensuel mais la trajectoire d'UN run — celui qui finit au 10e centile. Rien ne garantissait
    // l'ordre à un mois donné : un run qui finit bas peut très bien passer au-dessus de la médiane
    // en cours de route (gros gain suivi d'un krach).
    // MESURÉ (30 ans, 200 itérations) : P10 > P50 sur 60 mois / 361 (17 %), P50 > P90 sur 11 mois,
    // pire croisement 32 808 $ au mois 57. Un cône qui se croise n'est pas lisible.
    //
    // MAINTENANT : à CHAQUE mois, on trie les valeurs de tous les runs et on prend le 10e / 50e /
    // 90e centile. C'est la définition d'un fan chart, et l'ordre P10 ≤ P50 ≤ P90 devient vrai PAR
    // CONSTRUCTION à chaque instant.
    //
    // ⚠️ Contrepartie ASSUMÉE, à ne pas « corriger » plus tard : la bande n'est plus une trajectoire
    // ATTEIGNABLE. Aucun scénario simulé ne suit exactement la médiane mensuelle. C'est le compromis
    // standard d'un cône de confiance — il répond à « où en serai-je à cette date, dans 80 % des
    // cas ? », pas à « quel scénario précis vais-je vivre ? ».
    //
    // `finalNWp10`/`finalNWp50` (strategySearch) restent cohérents : le percentile du DERNIER mois
    // est le même classement que le tri par patrimoine final.
    const percentileParMois = (q: number): number[] => {
        const out: number[] = new Array(nMonths + 1);
        const colonne: number[] = new Array(allRuns.length);
        for (let mois = 0; mois <= nMonths; mois++) {
            for (let r = 0; r < allRuns.length; r++) {
                const v = allRuns[r].netWorthByMonth[mois];
                colonne[r] = Number.isFinite(v) ? v : 0;
            }
            colonne.sort((x, y) => x - y);
            // Index par la même convention que l'ancien code (`Math.floor(n * q)`, borné), pour ne
            // pas déplacer le niveau des bandes en plus de corriger leur ordre.
            out[mois] = colonne[Math.min(colonne.length - 1, Math.floor(colonne.length * q))] ?? 0;
        }
        return out;
    };
    const p10Data = allRuns.length ? percentileParMois(0.10) : Array(nMonths + 1).fill(0);
    const p50Data = allRuns.length ? percentileParMois(0.50) : Array(nMonths + 1).fill(0);
    const p90Data = allRuns.length ? percentileParMois(0.90) : Array(nMonths + 1).fill(0);

    const startNW = (params.calculatedStartingCash + params.liveCSVBalances.CELI + params.liveCSVBalances.CELIAPP + params.liveCSVBalances.REER + params.liveCSVBalances.NON_ENREG + params.liveCSVBalances.CRYPTO + params.liveCSVBalances.REEE);

    const survivalScore = successRate / 100;
    const safetyScore = allRuns.filter(r => r.minNetWorth > startNW * 0.1).length / iterations;
    const avgEfficiency = allRuns.reduce((acc, r) => {
        // [PROJ-TAXPAID-LABEL] Clamp [0,1] : `totalTaxesPaid` peut être NÉGATIF (année à gros
        // remboursement net) → sans plancher 0, leakage < 0 donnait une « efficacité » > 100 %.
        // [ENG-FVI-EFFICIENCY-ESTATE] (décision Marc 2026-09-04, option a) L'efficacité score
        // l'impôt À VIE — réglé du vivant + dette d'horizon + SUCCESSORAL — via la source unique
        // `lifetimeTaxTotal` (jamais une somme recopiée : une formule money-critical recopiée
        // diverge). Avant : l'impôt d'horizon seul, et le clamp à 0 affichait « 100 % » à presque
        // tout salarié (ttp négatif du vivant, toute la facture à la liquidation) — un indicateur
        // qui dit 100 % à tout le monde ne discrimine rien. Le clamp [0,1] RESTE : c'est un SCORE
        // (l'expertMetrics.taxLeakage, lui, reste une MESURE d'horizon non plafonnée — autre
        // question, autre contrat, cf. [PROJ-TAXPAID-LABEL]).
        const leakage = r.totalGrowth > 0 ? Math.min(1, Math.max(0, lifetimeTaxTotal(r) / r.totalGrowth)) : 0.5;
        return acc + (1 - leakage);
    }, 0) / iterations;
    const avgLegacyRatio = allRuns.reduce((acc, r) => acc + Math.min(3, r.estateNetWorth / (startNW || 1)), 0) / iterations;
    const legacyScore = Math.min(1, avgLegacyRatio / 2);
    const fvi = Math.round((survivalScore * 0.3 + safetyScore * 0.3 + avgEfficiency * 0.2 + legacyScore * 0.2) * 100);

    const retAge = params.retirementGoal.targetAge || 65;
    const currentAge = params.config.users[0]?.age || 30;
    const yearsToRetirement = Math.max(0, retAge - currentAge);
    const criticalDecadeStartMonth = Math.max(0, (yearsToRetirement - 5) * 12);
    const criticalDecadeEndMonth = Math.min(nMonths, (yearsToRetirement + 5) * 12);
    const fragileThreshold = startNW * 0.5;

    let fragileCount = 0;
    let worstDecadeDrawdown = 0;
    for (const run of allRuns) {
        let minInDecade = Infinity;
        for (let mi = criticalDecadeStartMonth; mi <= criticalDecadeEndMonth && mi < run.netWorthByMonth.length; mi++) {
            const nw = run.netWorthByMonth[mi];
            if (nw < minInDecade) minInDecade = nw;
        }
        if (minInDecade < fragileThreshold) fragileCount++;
        const drawdown = startNW > 0 ? Math.max(0, (startNW - minInDecade) / startNW) : 0;
        if (drawdown > worstDecadeDrawdown) worstDecadeDrawdown = drawdown;
    }
    const sequenceRiskPct = Math.round((fragileCount / iterations) * 100);

    // [MC-BANDES-CROISEES] Le run REPRÉSENTATIF reste un run RÉEL, trié par patrimoine final —
    // et c'est volontaire : `swr` et les autres métriques expertes décrivent un scénario vécu de
    // bout en bout, pas un assemblage de percentiles mensuels (qui n'est atteignable par personne).
    // C'est le seul usage légitime de ce tri ; les BANDES, elles, sont désormais des percentiles
    // par mois (voir plus haut).
    const runsParFinalNW = [...allRuns].sort((a, b) => a.finalNW - b.finalNW);
    const representativeRun = runsParFinalNW[Math.floor(iterations * 0.50)] || runsParFinalNW[0];
    const expertMetrics = {
        swr: representativeRun ? (representativeRun.totalExpenses / (representativeRun.chartDataLength || 1) * 12) / (startNW || 1) : 0,
        // [PROJ-TAXPAID-LABEL] Plancher 0 seulement (un compteur net négatif — année à gros
        // remboursement — rendait un « -50 % » absurde). PAS de cap haut : en décaissement, un
        // ratio > 1 est une INFORMATION réelle (impôts payés > croissance de la période, mesuré
        // 3-5× sur un retraité REER) — le capper fabriquerait un 100 % plausible (finding
        // financial-integrity #549). growth ≤ 0 → 0 honnête (pas « ratio = dollars bruts »).
        // [ENG-TTP-UNSETTLED-PROPAGATE] même impôt d'horizon complet qu'avgEfficiency.
        taxLeakage: representativeRun && representativeRun.totalGrowth > 0
            ? Math.max(0, (representativeRun.totalTaxesPaid + representativeRun.unsettledTaxAtHorizon) / representativeRun.totalGrowth)
            : 0,
        shortfallRisk: representativeRun ? representativeRun.shortfallRate : 0,
        sequenceRiskPct,
        worstDecadeDrawdown,
        criticalDecadeStartYear: Math.floor(criticalDecadeStartMonth / 12),
        criticalDecadeEndYear: Math.floor(criticalDecadeEndMonth / 12),
    };

    // ⚠️ `allRuns.length`, pas `iterations` : c'est ce qui a VRAIMENT tourné. Les deux coïncident
    // aujourd'hui (la boucle ne s'interrompt pas), mais un futur arrêt anticipé — watchdog, budget
    // de temps — rendrait le paramètre demandé mensonger, exactement le défaut que ce lot corrige.
    return { iterationsRun: allRuns.length, successRate, p10Data, p50Data, p90Data, fvi, expertMetrics };
}
