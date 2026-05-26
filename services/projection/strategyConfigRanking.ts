// services/projection/strategyConfigRanking.ts
// G21 C5 commit 5 — classement des résultats Monte Carlo (ConfigResult[]) selon un
// objectif, avec garde de survie, détail du score, et explication FR du gagnant.
//
// PUR : ne relance aucune simulation. Prend les ConfigResult déjà calculés par la
// recherche (strategySearch / runStrategySearchAsync) et les ordonne. Le re-tri par
// objectif est donc instantané côté UI (aucun recalcul moteur).
//
// Réutilise OptimizeObjective (concept C1) mais sur des métriques de RISQUE (MC) au
// lieu de résultats déterministes : survie (successRate), patrimoine médian (P50),
// impôt à vie, âge FIRE, risque de séquence.

import type { ConfigResult } from './strategySearch';
import type { OptimizeObjective } from './strategyRanking';
import { OBJECTIVE_LABELS } from './strategyRanking';
import { leverLabel, leverValueLabel, type StrategyConfig } from './strategyConfig';

export type { OptimizeObjective };
export { OBJECTIVE_LABELS };

/** Sous-scores normalisés 0..1 d'une config (pour l'affichage du détail). */
export interface ScoreBreakdown {
    survival: number;   // successRate / 100
    wealth: number;     // patrimoine médian P50 normalisé
    tax: number;        // impôt à vie inversé+normalisé (1 = impôt le plus bas)
    fire: number;       // précocité FIRE normalisée (1 = le plus tôt ; 0 = jamais)
    robustness: number; // 1 - risque de séquence
}

export interface RankedConfig {
    result: ConfigResult;
    /** Rang 1-based dans le classement courant. */
    rank: number;
    /** Score composite/objectif 0..1. */
    score: number;
    /** Sous-scores normalisés (toujours présents, indépendants de l'objectif). */
    breakdown: ScoreBreakdown;
    /** A passé la garde de survie (successRate ≥ seuil). */
    survived: boolean;
}

export interface ConfigRankingResult {
    /** Meilleur en premier. Survivants d'abord, puis non-survivants. */
    ranked: RankedConfig[];
    objective: OptimizeObjective;
    /** Seuil de survie appliqué (taux de succès minimum, en %). */
    survivalThreshold: number;
    /** Au moins une config a passé la garde de survie. */
    hasSurvivor: boolean;
}

export interface RankConfigOptions {
    /** Taux de succès minimum (%) pour figurer au podium. Défaut 80. */
    survivalThreshold?: number;
}

const DEFAULT_SURVIVAL_THRESHOLD = 80;

// Pondérations « équilibré » : survie d'abord (un plan qui s'épuise n'a pas de
// valeur), puis patrimoine, impôt, précocité FIRE, robustesse de séquence.
const BALANCED_WEIGHTS = { survival: 0.30, wealth: 0.25, tax: 0.20, fire: 0.15, robustness: 0.10 } as const;

const norm = (v: number, min: number, max: number): number => (max <= min ? 0.5 : (v - min) / (max - min));

/**
 * Classe des ConfigResult selon l'objectif. Normalisation sur TOUT l'espace évalué
 * (scores stables), puis garde de survie sur l'ordre : les survivants passent devant
 * quel que soit leur score brut (un patrimoine énorme mais qui s'épuise ne gagne pas).
 */
export function rankConfigResults(
    results: ReadonlyArray<ConfigResult>,
    objective: OptimizeObjective,
    opts: RankConfigOptions = {},
): ConfigRankingResult {
    const survivalThreshold = opts.survivalThreshold ?? DEFAULT_SURVIVAL_THRESHOLD;
    if (results.length === 0) {
        return { ranked: [], objective, survivalThreshold, hasSurvivor: false };
    }

    const wealths = results.map(r => r.finalNWp50);
    const taxes = results.map(r => r.lifetimeTax);
    // FIRE : âge le plus bas = mieux. null (jamais atteint) traité à part (score 0).
    const fireAges = results.map(r => r.fireAge).filter((a): a is number => a !== null);

    const wMin = Math.min(...wealths), wMax = Math.max(...wealths);
    const tMin = Math.min(...taxes), tMax = Math.max(...taxes);
    const fMin = fireAges.length ? Math.min(...fireAges) : 0;
    const fMax = fireAges.length ? Math.max(...fireAges) : 1;

    const scored: RankedConfig[] = results.map((result) => {
        const breakdown: ScoreBreakdown = {
            survival: result.successRate / 100,
            wealth: norm(result.finalNWp50, wMin, wMax),
            tax: 1 - norm(result.lifetimeTax, tMin, tMax),
            fire: result.fireAge !== null ? 1 - norm(result.fireAge, fMin, fMax) : 0,
            robustness: 1 - result.sequenceRiskPct / 100,
        };
        let score: number;
        switch (objective) {
            case 'wealth': score = breakdown.wealth; break;
            case 'tax': score = breakdown.tax; break;
            case 'fire': score = breakdown.fire; break;
            default:
                score = BALANCED_WEIGHTS.survival * breakdown.survival
                    + BALANCED_WEIGHTS.wealth * breakdown.wealth
                    + BALANCED_WEIGHTS.tax * breakdown.tax
                    + BALANCED_WEIGHTS.fire * breakdown.fire
                    + BALANCED_WEIGHTS.robustness * breakdown.robustness;
        }
        return {
            result, score, breakdown, rank: 0,
            survived: result.successRate >= survivalThreshold,
        };
    });

    // Tri : survivants d'abord (par score, départage patrimoine médian), puis les
    // non-survivants entre eux. Garde de survie = priorité absolue sur l'ordre.
    const byScore = (a: RankedConfig, b: RankedConfig) =>
        b.score - a.score || b.result.finalNWp50 - a.result.finalNWp50;
    const survivors = scored.filter(c => c.survived).sort(byScore);
    const fallen = scored.filter(c => !c.survived).sort(byScore);
    const ranked = [...survivors, ...fallen].map((c, i) => ({ ...c, rank: i + 1 }));

    return { ranked, objective, survivalThreshold, hasSurvivor: survivors.length > 0 };
}

/** Un levier qui diffère entre deux configs (les leviers « décisifs »). */
export interface DecisiveLever {
    key: keyof StrategyConfig;
    label: string;
    winnerValue: string;
    runnerValue: string;
}

/** Leviers dont la valeur diffère entre gagnant et dauphin. */
export function decisiveLevers(winner: StrategyConfig, runnerUp: StrategyConfig): DecisiveLever[] {
    const keys = Object.keys(winner) as Array<keyof StrategyConfig>;
    return keys
        .filter(key => winner[key] !== runnerUp[key])
        .map(key => ({
            key,
            label: leverLabel(key),
            winnerValue: leverValueLabel(key, winner[key]),
            runnerValue: leverValueLabel(key, runnerUp[key]),
        }));
}

const fmtMoney = (v: number): string =>
    `${Math.round(v).toLocaleString('fr-CA')} $`;

/**
 * Explique en français pourquoi le gagnant l'emporte sur le dauphin : compare les
 * dimensions clés (survie, patrimoine, impôt, FIRE) et nomme les leviers décisifs.
 * Si pas de dauphin (1 seule config), décrit seulement le gagnant.
 */
export function explainWinner(
    winner: RankedConfig,
    runnerUp: RankedConfig | null,
    objective: OptimizeObjective,
): string {
    const w = winner.result;
    const objLabel = OBJECTIVE_LABELS[objective];
    const parts: string[] = [];

    parts.push(`Selon l'objectif « ${objLabel} », cette stratégie arrive en tête avec un taux de succès de ${w.successRate} % et un patrimoine médian de ${fmtMoney(w.finalNWp50)}.`);

    if (!runnerUp) {
        if (w.fireAge !== null) parts.push(`L'indépendance financière est atteinte vers ${Math.round(w.fireAge)} ans.`);
        parts.push(`Impôt total estimé sur la projection : ${fmtMoney(w.lifetimeTax)}.`);
        return parts.join(' ');
    }

    const r = runnerUp.result;
    const diffs: string[] = [];
    if (w.successRate !== r.successRate) {
        const better = w.successRate > r.successRate;
        diffs.push(`un taux de succès ${better ? 'supérieur' : 'inférieur'} (${w.successRate} % contre ${r.successRate} %)`);
    }
    if (Math.round(w.finalNWp50) !== Math.round(r.finalNWp50)) {
        const delta = w.finalNWp50 - r.finalNWp50;
        diffs.push(`un patrimoine médian ${delta >= 0 ? 'plus élevé' : 'plus faible'} de ${fmtMoney(Math.abs(delta))}`);
    }
    if (Math.round(w.lifetimeTax) !== Math.round(r.lifetimeTax)) {
        const delta = r.lifetimeTax - w.lifetimeTax; // positif = le gagnant paie moins
        diffs.push(`${delta >= 0 ? 'moins' : 'plus'} d'impôt (${fmtMoney(Math.abs(delta))} d'écart)`);
    }
    if (w.fireAge !== null && r.fireAge !== null && Math.round(w.fireAge) !== Math.round(r.fireAge)) {
        diffs.push(`une indépendance financière ${w.fireAge < r.fireAge ? 'plus précoce' : 'plus tardive'} (${Math.round(w.fireAge)} ans contre ${Math.round(r.fireAge)} ans)`);
    }

    if (diffs.length > 0) {
        parts.push(`Comparée au dauphin, elle offre ${diffs.join(', ')}.`);
    } else {
        parts.push(`Elle est au coude-à-coude avec le dauphin sur les grandes dimensions ; le départage se joue sur le score composite.`);
    }

    const levers = decisiveLevers(w.config, r.config);
    if (levers.length > 0) {
        const list = levers.map(l => `${l.label} (${l.winnerValue} plutôt que ${l.runnerValue})`).join(', ');
        parts.push(`Leviers décisifs : ${list}.`);
    }

    return parts.join(' ');
}
