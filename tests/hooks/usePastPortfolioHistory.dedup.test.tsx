// [PH2-c-1] — dédup du fetch Finnhub AU NIVEAU MODULE : deux instances simultanées du hook
// (ProjectionEngine + FutureProjection depuis PH2-c) ne déclenchent qu'UN fetch par lot de
// symboles, et toutes les instances reçoivent le résultat (cache partagé).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

vi.mock('../../services/marketData', () => ({
    getHistory: vi.fn().mockResolvedValue([{ date: '2025-01-02', close: 100 }]),
    configureMarketDataProvider: vi.fn(),
}));

import { usePastPortfolioHistory, _resetPastHistoryFetchCache } from '../../hooks/usePastPortfolioHistory';
import { getHistory } from '../../services/marketData';
import { useFinanceStore } from '../../store/useFinanceStore';
import type { Asset } from '../../types';

const asset = {
    symbol: 'XEQT', quantity: 10, currency: 'CAD', currentPrice: 30,
    accountType: 'CELI', dateBought: '2025-01-01',
} as unknown as Asset;

describe('[PH2-c-1] usePastPortfolioHistory — dédup module du fetch', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        _resetPastHistoryFetchCache();
        act(() => {
            useFinanceStore.setState({
                assets: [asset],
                isTestMode: false,
                apiKeys: { anthropic: '', finnhub: 'k-test' },
            });
        });
    });

    it('2 instances simultanées → getHistory appelé UNE seule fois pour le lot', async () => {
        const a = renderHook(() => usePastPortfolioHistory());
        const b = renderHook(() => usePastPortfolioHistory());

        await waitFor(() => expect(a.result.current.isLoading).toBe(false));
        // Un seul fetch malgré 2 instances (dédup par signature de lot, niveau module).
        expect(getHistory).toHaveBeenCalledTimes(1);
        // Les DEUX instances voient le même historique (cache partagé → même reconstruction).
        expect(a.result.current.points.length).toBeGreaterThan(0);
        expect(b.result.current.points).toEqual(a.result.current.points);
    });

    it('instance montée APRÈS le fetch → sert depuis le cache, zéro nouvel appel', async () => {
        const a = renderHook(() => usePastPortfolioHistory());
        await waitFor(() => expect(a.result.current.isLoading).toBe(false));
        expect(getHistory).toHaveBeenCalledTimes(1);

        const late = renderHook(() => usePastPortfolioHistory());
        await waitFor(() => expect(late.result.current.points.length).toBeGreaterThan(0));
        expect(getHistory).toHaveBeenCalledTimes(1); // pas de re-fetch
    });
});
