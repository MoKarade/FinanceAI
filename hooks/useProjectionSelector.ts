// hooks/useProjectionSelector.ts
//
// Hook canonique pour lire un slice de `lastProjection.chartData`.
//
// Pattern : un onglet qui doit afficher un KPI long-terme (capital à la
// retraite, héritage, coût enfant lifetime, FIRE number, etc.) doit
// consommer ce hook AU LIEU de relancer son propre calcul / Worker. La
// projection est mise à jour par FutureProjection.tsx au fil des inputs et
// stockée dans `store.lastProjection`.
//
// Garantit la convergence des chiffres entre onglets : si un bug de calcul
// existe, il se voit partout pareil et ne se corrige qu'à un seul endroit
// (le moteur de projection). Plus de divergences silencieuses comme
// historiquement Retirement.tsx vs FutureProjection.tsx.
//
// Voir docs/PROJECTION_OUTPUT_SCHEMA.md pour la liste des champs disponibles.

import { useMemo } from 'react';
import { useFinanceStore } from '../store/useFinanceStore';
// MEDIUM-3 fix (audit 2026-05-21) : re-export du type canonique de
// services/projection/types.ts au lieu d'une copie locale qui devenait
// silencieusement obsolète à chaque ajout de champ dans monthlyOutput.ts.
import type { ProjectionChartPoint as CanonicalProjectionChartPoint } from '../services/projection/types';

export type ProjectionChartPoint = CanonicalProjectionChartPoint;

/**
 * Sélectionne un slice de la projection courante.
 *
 * @param selector  Fonction pure : `(chart: ProjectionChartPoint[]) => T`
 *                  Doit être stable (déclarée hors composant ou via
 *                  `useCallback`) sinon le useMemo se ré-évalue à chaque
 *                  render. Idéalement passée comme constante.
 * @param fallback  Valeur retournée si pas de projection (jamais calculée,
 *                  ou utilisateur n'a pas ouvert l'onglet Future).
 *
 * @example
 *   const retirementCapital = useProjectionSelector(
 *     chart => chart.find(p => p.age >= 60)?.NetWorth ?? 0,
 *     0
 *   );
 */
export function useProjectionSelector<T>(
    selector: (chart: ProjectionChartPoint[]) => T,
    fallback: T,
): T {
    const chartData = useFinanceStore(s => s.lastProjection?.chartData);
    return useMemo(() => {
        if (!chartData || chartData.length === 0) return fallback;
        return selector(chartData as ProjectionChartPoint[]);
    }, [chartData, selector, fallback]);
}

/**
 * Variante : vrai si la projection a déjà été calculée au moins une fois.
 * Utile pour afficher un état "—" ou "calcul…" en attendant.
 */
export function useHasProjection(): boolean {
    const chartData = useFinanceStore(s => s.lastProjection?.chartData);
    return !!chartData && chartData.length > 0;
}

/**
 * Variante batch : sélectionne plusieurs KPI d'un coup pour éviter de
 * multiples `useProjectionSelector` qui re-traversent chartData.
 *
 * @param selectorMap Object de selectors, retourne un objet avec mêmes clés.
 */
export function useProjectionBatch<T extends Record<string, unknown>>(
    selectorMap: { [K in keyof T]: (chart: ProjectionChartPoint[]) => T[K] },
    fallback: T,
): T {
    const chartData = useFinanceStore(s => s.lastProjection?.chartData);
    return useMemo(() => {
        if (!chartData || chartData.length === 0) return fallback;
        const result = {} as T;
        for (const key in selectorMap) {
            result[key] = selectorMap[key](chartData as ProjectionChartPoint[]);
        }
        return result;
    }, [chartData, selectorMap, fallback]);
}
