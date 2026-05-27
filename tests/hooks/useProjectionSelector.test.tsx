/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
    useProjectionSelector, useHasProjection, useProjectionBatch,
    type ProjectionChartPoint,
} from '../../hooks/useProjectionSelector';
import { useFinanceStore } from '../../store/useFinanceStore';

const setChart = (chartData: ProjectionChartPoint[] | null) => {
    useFinanceStore.setState({
        lastProjection: chartData ? ({ chartData } as never) : undefined,
    });
};

beforeEach(() => setChart(null));

describe('useProjectionSelector', () => {
    it('retourne le fallback quand aucune projection', () => {
        const { result } = renderHook(() => useProjectionSelector(c => c.length, -1));
        expect(result.current).toBe(-1);
    });

    it('applique le selector quand la projection existe', () => {
        setChart([
            { monthIndex: 0, NetWorth: 100 },
            { monthIndex: 1, NetWorth: 250 },
        ]);
        const { result } = renderHook(() =>
            useProjectionSelector(c => c[c.length - 1].NetWorth, 0),
        );
        expect(result.current).toBe(250);
    });

    it('useHasProjection : false sans projection, true avec', () => {
        expect(renderHook(() => useHasProjection()).result.current).toBe(false);
        setChart([{ monthIndex: 0, NetWorth: 1 }]);
        expect(renderHook(() => useHasProjection()).result.current).toBe(true);
    });

    it('useProjectionBatch : fallback puis calcul multi-KPI', () => {
        const selectors = {
            last: (c: ProjectionChartPoint[]) => c[c.length - 1].NetWorth,
            count: (c: ProjectionChartPoint[]) => c.length,
        };
        const fallback = { last: 0, count: 0 };

        expect(renderHook(() => useProjectionBatch(selectors, fallback)).result.current)
            .toEqual(fallback);

        setChart([
            { monthIndex: 0, NetWorth: 5 },
            { monthIndex: 1, NetWorth: 9 },
        ]);
        expect(renderHook(() => useProjectionBatch(selectors, fallback)).result.current)
            .toEqual({ last: 9, count: 2 });
    });
});
