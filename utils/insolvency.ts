// utils/insolvency.ts
// [PROJ-INSOLVENCY-BADGE] Détection « plan insoutenable » : premier moment où le PATRIMOINE NET
// projeté devient NÉGATIF. À ce point le capital est épuisé et le manque est porté en dette liquide
// VISIBLE (cf INV-12 / FISC-BROKE-LIQUID-FLOOR) — un NetWorth négatif nu (« -1,88 M$ ») est anxiogène
// et opaque ; cette détection alimente un badge pédagogique « capital épuisé vers X ans ».
//
// ≠ Retraite (`TotalCapital <= 0` = comptes de placement vidés) : le NW devient négatif PLUS TARD
// (il inclut l'équité immo et ne plonge sous 0 que via la dette). Deux métriques distinctes, voulues.

import type { ProjectionChartPoint } from '../services/projection/types';

interface InsolvencyPoint {
    /** Âge (de l'utilisateur principal) au premier mois où le patrimoine net passe sous 0.
     *  `null` si le point n'a pas d'âge (mode MC réduit) → le badge affiche alors un message générique. */
    age: number | null;
    /** Index du mois (depuis le début de la projection) du franchissement. */
    monthIndex: number;
}

/**
 * Premier point de la projection où `NetWorth < 0`. Ignore le passé reconstruit (`monthIndex < 0`)
 * et les points sans `NetWorth` numérique (mode Monte-Carlo réduit). Retourne `null` si le plan
 * reste solvable sur tout l'horizon (patrimoine net ≥ 0 partout).
 */
export function findInsolvencyPoint(chartData: readonly ProjectionChartPoint[]): InsolvencyPoint | null {
    for (const p of chartData) {
        if (p.monthIndex < 0) continue; // passé reconstruit, pas la projection
        if (typeof p.NetWorth !== 'number' || Number.isNaN(p.NetWorth)) continue;
        if (p.NetWorth < 0) {
            return { age: typeof p.age === 'number' ? p.age : null, monthIndex: p.monthIndex };
        }
    }
    return null;
}
