// services/projection/goalSeek.ts
// W1.5 — Projection inverse / Goal Seeking.
// Au lieu de "que devient mon patrimoine avec X$/mois d'épargne ?",
// on répond à "combien dois-je épargner pour atteindre Y$ à age Z ?".
//
// Méthode: dichotomie sur le paramètre cible (épargne mensuelle ou âge de retraite).
// Convergence garantie en log2(range) itérations, typiquement 10-15.

import { formatCAD } from '../../utils/format';
import { calculateFutureProjection, type SimulationParams } from '../projection';

interface GoalSeekResult {
    found: boolean;
    value: number;                // valeur trouvée (épargne ou âge)
    iterations: number;
    finalNetWorthAtTarget: number;
    error?: string;
}

/**
 * Trouve l'épargne mensuelle nécessaire pour atteindre `targetNetWorth`
 * à un âge donné (ou en fin de projection).
 *
 * @param baseParams Paramètres de simulation (sera modifié sur `projection.manualContribution`)
 * @param targetNetWorth Patrimoine cible
 * @param targetAge Âge à atteindre (par défaut, en fin de horizon)
 * @param lowerBound Borne inférieure de recherche ($/mois)
 * @param upperBound Borne supérieure de recherche ($/mois)
 * @param tolerance Tolérance en $ pour considérer la cible atteinte
 */
export function findRequiredMonthlySavings(
    baseParams: SimulationParams,
    targetNetWorth: number,
    targetAge?: number,
    lowerBound = 0,
    upperBound = 20000,
    tolerance = 5000,
    maxIterations = 25,
): GoalSeekResult {
    let lo = lowerBound;
    let hi = upperBound;
    let iter = 0;
    let lastNW = 0;

    const runWith = (savings: number): number => {
        const params: SimulationParams = {
            ...baseParams,
            projection: { ...baseParams.projection, manualContribution: savings, savingsMode: 'manual' },
        };
        // B3 perf — goalSeek n'utilise que le NW du scénario BASE ; ne lancer
        // que celui-là (≈7× moins de CPU par itération de bissection).
        const r = calculateFutureProjection(params, false, 0, ['BASE']);
        const base = r.allResults?.find((s) => s.stratType === 'BASE');
        if (!base) return 0;
        if (targetAge) {
            const pt = base.chartData.find((d) => (d.age ?? 0) >= targetAge);
            return (pt?.NetWorth ?? base.finalNetWorth) ?? 0;
        }
        return base.finalNetWorth ?? 0;
    };

    // Vérifie d'abord la faisabilité aux bornes
    const nwLo = runWith(lo);
    const nwHi = runWith(hi);
    if (nwHi < targetNetWorth - tolerance) {
        return { found: false, value: hi, iterations: 1, finalNetWorthAtTarget: nwHi, error: 'Cible inatteignable même avec ' + hi + '$/mois' };
    }
    if (nwLo > targetNetWorth + tolerance) {
        return { found: true, value: lo, iterations: 1, finalNetWorthAtTarget: nwLo };
    }

    let converged = false;
    while (hi - lo > 50 && iter < maxIterations) {
        const mid = (lo + hi) / 2;
        const nw = runWith(mid);
        lastNW = nw;
        if (Math.abs(nw - targetNetWorth) < tolerance) {
            return { found: true, value: Math.round(mid), iterations: iter, finalNetWorthAtTarget: nw };
        }
        if (nw < targetNetWorth) lo = mid;
        else hi = mid;
        iter++;
    }

    // FIX agent (code-reviewer): si la boucle s'épuise sans atteindre la tolérance,
    // on signale found=false et on indique la valeur convergée approximative.
    return {
        found: converged,
        value: Math.round((lo + hi) / 2),
        iterations: iter,
        finalNetWorthAtTarget: lastNW,
        error: converged ? undefined : `Convergence partielle (${iter} itérations, écart ~${formatCAD(Math.round(Math.abs(lastNW - targetNetWorth)))})`,
    };
}

/**
 * Trouve l'âge minimum de retraite tel qu'un retrait viable
 * (sans tomber à 0$) soit possible jusqu'à 95 ans.
 */
export function findEarliestRetirementAge(
    baseParams: SimulationParams,
    minAge = 45,
    maxAge = 75,
    maxIterations = 12,
): GoalSeekResult {
    let lo = minAge;
    let hi = maxAge;
    let iter = 0;
    let lastNW = 0;

    const runWith = (age: number): number => {
        const params: SimulationParams = {
            ...baseParams,
            retirementGoal: { ...baseParams.retirementGoal, targetAge: age },
            projection: { ...baseParams.projection, years: Math.max(baseParams.projection.years, 95 - age + 5) },
        };
        // B3 perf — goalSeek n'utilise que le NW du scénario BASE ; ne lancer
        // que celui-là (≈7× moins de CPU par itération de bissection).
        const r = calculateFutureProjection(params, false, 0, ['BASE']);
        const base = r.allResults?.find((s) => s.stratType === 'BASE');
        if (!base) return -1;
        return base.minNetWorth ?? -1;
    };

    // Sprint 2 H6 fix — Validation initiale : si même `maxAge` n'est pas viable
    // (le pire scénario possible — l'utilisateur attend le plus longtemps avant
    // de prendre sa retraite et le NW reste négatif), retourner `found: false`.
    // Avant ce fix, la fonction retournait toujours `found: true` même quand
    // l'horizon [minAge, maxAge] ne contenait aucun âge viable — la bissection
    // convergeait vers une valeur frontière avec `minNetWorth = -1`. Source
    // du test flaky `findEarliestRetirementAge` qui passait toujours `≥ 45`
    // car le bug `found: true` masquait l'absence de vraie solution.
    const maxAgeNW = runWith(maxAge);
    if (maxAgeNW <= 0) {
        return { found: false, value: maxAge, iterations: 1, finalNetWorthAtTarget: maxAgeNW };
    }
    lastNW = maxAgeNW;
    hi = maxAge;

    while (hi - lo > 1 && iter < maxIterations) {
        const mid = Math.floor((lo + hi) / 2);
        const minNW = runWith(mid);
        lastNW = minNW;
        if (minNW > 0) hi = mid;   // viable à cet âge, essaie plus tôt
        else lo = mid + 1;          // pas viable, essaie plus tard
        iter++;
    }

    return { found: true, value: hi, iterations: iter, finalNetWorthAtTarget: lastNW };
}
