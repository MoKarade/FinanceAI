// services/projection/strategyRanking.ts
// G21 Phase 1 — classement des scénarios selon un objectif choisi par l'utilisateur.
// Fonction PURE (aucune dépendance UI) : prend les résultats déterministes des 7
// scénarios déjà calculés et retourne le meilleur selon l'objectif, avec un score
// normalisé et de quoi expliquer « pourquoi ». Aucune relance de simulation.

export type OptimizeObjective = 'balanced' | 'wealth' | 'tax' | 'fire';

export const OBJECTIVE_LABELS: Record<OptimizeObjective, string> = {
    balanced: 'Équilibré',
    wealth: 'Patrimoine max',
    tax: 'Impôt minimum',
    fire: 'FIRE le plus tôt',
};

// Sous-ensemble des champs d'un résultat de scénario nécessaires au classement.
export interface RankableScenario {
    strategyName: string;
    estateNetWorth: number;
    totalTaxesPaid: number;
    minNetWorth: number;
    chartData: Array<{ NetWorth?: number; FireTarget?: number; age?: number; monthIndex?: number }>;
    /** C3 — 'strategy' = façon de gérer comparable ; 'stress' = test de monde. */
    kind?: 'strategy' | 'stress' | string;
}

export interface RankStrategiesOptions {
    /**
     * Ne classe que les scénarios éligibles (ex : les façons de GÉRER sous le même
     * monde — pas les stress-tests). L'`index` retourné reste celui du tableau
     * d'origine, pour que « Appliquer » sélectionne le bon scénario.
     */
    eligible?: (s: RankableScenario, index: number) => boolean;
}

export interface RankedScenario {
    index: number;
    strategyName: string;
    score: number; // 0..1
    estateNetWorth: number;
    totalTaxesPaid: number;
    fireAge: number | null; // âge au 1er mois où NetWorth ≥ FireTarget, sinon null
}

export interface RankingResult {
    ranked: RankedScenario[]; // meilleur en premier
    bestIndex: number;
    objective: OptimizeObjective;
}

// Normalise v dans [0,1] selon [min,max] ; 0.5 si plat (évite division par 0).
const norm = (v: number, min: number, max: number): number => (max <= min ? 0.5 : (v - min) / (max - min));

// 1er mois où la valeur nette atteint la cible FIRE (sinon +∞ / null).
function fireMonthIndex(s: RankableScenario): number {
    const i = s.chartData.findIndex((d) => (d.FireTarget || 0) > 0 && (d.NetWorth || 0) >= (d.FireTarget || 0));
    return i === -1 ? Number.POSITIVE_INFINITY : (s.chartData[i].monthIndex ?? i);
}
function fireAgeOf(s: RankableScenario): number | null {
    const d = s.chartData.find((p) => (p.FireTarget || 0) > 0 && (p.NetWorth || 0) >= (p.FireTarget || 0));
    return d ? (d.age ?? null) : null;
}

// Pondérations de l'objectif « équilibré ». Patrimoine domine, puis impôt,
// robustesse (creux le plus haut) et précocité du FIRE.
const BALANCED_WEIGHTS = { estate: 0.4, tax: 0.25, robustness: 0.2, fire: 0.15 } as const;

export function rankStrategies(
    scenarios: RankableScenario[],
    objective: OptimizeObjective,
    opts?: RankStrategiesOptions,
): RankingResult {
    if (scenarios.length === 0) return { ranked: [], bestIndex: 0, objective };

    // C3 — on ne note que les scénarios éligibles (comparables entre eux), mais on
    // conserve leur index d'origine. Les normalisations se font sur ce sous-ensemble.
    const entries = scenarios
        .map((s, i) => ({ s, i }))
        .filter(({ s, i }) => (opts?.eligible ? opts.eligible(s, i) : true));
    if (entries.length === 0) return { ranked: [], bestIndex: 0, objective };

    const estates = entries.map(({ s }) => s.estateNetWorth || 0);
    const taxes = entries.map(({ s }) => s.totalTaxesPaid || 0);
    const mins = entries.map(({ s }) => s.minNetWorth || 0);
    const fireMonths = entries.map(({ s }) => fireMonthIndex(s));

    const eMin = Math.min(...estates), eMax = Math.max(...estates);
    const tMin = Math.min(...taxes), tMax = Math.max(...taxes);
    const mMin = Math.min(...mins), mMax = Math.max(...mins);
    const finiteFire = fireMonths.filter((f) => Number.isFinite(f));
    const fMin = finiteFire.length ? Math.min(...finiteFire) : 0;
    const fMax = finiteFire.length ? Math.max(...finiteFire) : 1;

    const scored: RankedScenario[] = entries.map(({ s, i: originalIndex }, k) => {
        const nEstate = norm(estates[k], eMin, eMax);
        const nTax = 1 - norm(taxes[k], tMin, tMax); // moins d'impôt = mieux
        const nRobust = norm(mins[k], mMin, mMax); // creux le plus haut = mieux
        const nFire = Number.isFinite(fireMonths[k]) ? 1 - norm(fireMonths[k], fMin, fMax) : 0; // plus tôt = mieux ; jamais = 0
        let score: number;
        switch (objective) {
            case 'wealth': score = nEstate; break;
            case 'tax': score = nTax; break;
            case 'fire': score = nFire; break;
            default:
                score = BALANCED_WEIGHTS.estate * nEstate + BALANCED_WEIGHTS.tax * nTax
                    + BALANCED_WEIGHTS.robustness * nRobust + BALANCED_WEIGHTS.fire * nFire;
        }
        return {
            index: originalIndex,
            strategyName: s.strategyName,
            score,
            estateNetWorth: estates[k],
            totalTaxesPaid: taxes[k],
            fireAge: fireAgeOf(s),
        };
    });

    // Tri stable : score décroissant, départage par patrimoine puis index.
    const ranked = [...scored].sort((a, b) =>
        b.score - a.score || b.estateNetWorth - a.estateNetWorth || a.index - b.index);
    return { ranked, bestIndex: ranked[0].index, objective };
}
