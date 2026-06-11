// utils/lockedCurveOverlay.ts
// PH2-d — superposition de la courbe VERROUILLÉE (référence figée) sur les graphes Futur/Retraite.
// Extrait (pur, testable) du pattern partagé : indexer la valeur de la courbe verrouillée par
// monthIndex pour la tracer en 2e ligne, à côté de l'aperçu live.

import type { ProjectionChartPoint } from '../services/projection/types';

/** Capital total d'un point (CELI+REER+NonReg+Liquidités+CELIAPP) — métrique du graphe Retraite. */
export const pointTotalCapital = (p: ProjectionChartPoint): number =>
    (p.CELI ?? 0) + (p.REER ?? 0) + (p.NonReg ?? 0) + (p.Liquidites ?? 0) + (p.CELIAPP ?? 0);

/**
 * Construit l'index `monthIndex → valeur` de la courbe VERROUILLÉE pour la tracer en référence.
 * `metric` choisit la grandeur (NetWorth sur Futur, capital total sur Retraite). Les valeurs non
 * finies (NaN / undefined→NaN, ex. points du passé sans NetWorth) sont IGNORÉES.
 * Retourne `null` si non verrouillé, pas de données, ou aucune valeur exploitable → l'appelant
 * n'ajoute alors AUCUNE 2e courbe (et le `<Line>` conditionnel ne se rend pas).
 */
export function buildLockedByMonth(
    locked: { chartData?: ReadonlyArray<ProjectionChartPoint> } | null | undefined,
    isLocked: boolean,
    metric: (p: ProjectionChartPoint) => number,
): Map<number, number> | null {
    if (!isLocked || !locked?.chartData || locked.chartData.length === 0) return null;
    const byMonth = new Map<number, number>();
    for (const p of locked.chartData) {
        const v = metric(p);
        if (Number.isFinite(v)) byMonth.set(p.monthIndex, v);
    }
    return byMonth.size > 0 ? byMonth : null;
}
