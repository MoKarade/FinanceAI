// [CA-10] usePastPortfolioHistory — chemins NON couverts par le test de dédup (PH2-c-1) :
//  - mode TEST : reconstruction DIRECTE depuis priceHistory de la fixture, sans aucun fetch réseau ;
//  - anti-fuite réel→test (revue #245, M3) : en mode test, le cache Finnhub MODULE est IGNORÉ
//    (un fetch réel résolu avant la bascule ne doit pas polluer la fixture d'un symbole partagé) ;
//  - gardes : aucun actif, ou mode réel sans clé → résultat sans fetch.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

vi.mock('../../services/marketData', () => ({
    getHistory: vi.fn().mockResolvedValue([{ date: '2025-01-02', close: 100 }]),
    configureMarketDataProvider: vi.fn(),
}));
vi.mock('../../services/errorLogger', () => ({ logError: vi.fn() }));

import { usePastPortfolioHistory, _resetPastHistoryFetchCache } from '../../hooks/usePastPortfolioHistory';
import { getHistory } from '../../services/marketData';
import { useFinanceStore } from '../../store/useFinanceStore';
import type { Asset } from '../../types';

// Actif CELI : sa valeur retombe dans le bucket `CELI` des points reconstruits.
const celiAsset = (priceHistory?: Array<{ date: string; price: number }>) => ({
    symbol: 'XEQT', quantity: 10, currency: 'CAD', currentPrice: 30,
    accountType: 'CELI', dateBought: '2025-01-01', priceHistory,
} as unknown as Asset);

describe('[CA-10] usePastPortfolioHistory — modes & anti-fuite', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        _resetPastHistoryFetchCache();
        act(() => {
            useFinanceStore.setState({ assets: [], fxRates: { USD: 1.35, EUR: 1.5, CAD: 1 }, isTestMode: false, apiKeys: { anthropic: '', finnhub: '' } });
        });
    });

    it('mode TEST : reconstruit depuis la fixture priceHistory, AUCUN fetch réseau', async () => {
        act(() => {
            useFinanceStore.setState({
                isTestMode: true,
                // clé présente : prouve que c'est bien le MODE TEST (et non l'absence de clé) qui coupe le fetch.
                apiKeys: { anthropic: '', finnhub: 'k-test' },
                assets: [celiAsset([{ date: '2025-01-01', price: 10 }, { date: '2025-06-01', price: 12 }])],
            });
        });
        const { result } = renderHook(() => usePastPortfolioHistory());

        await waitFor(() => expect(result.current.points.length).toBeGreaterThan(0));
        expect(getHistory).not.toHaveBeenCalled();          // mode test → jamais de réseau
        expect(result.current.isLoading).toBe(false);
        // La valeur CELI reflète la fixture (quantité 10 × prix ~10-12 = ~100-120), pas le prix courant.
        const last = result.current.points.at(-1)!;
        expect(last.CELI).toBeGreaterThan(0);
        expect(last.CELI).toBeLessThan(1000);
    });

    it('mode TEST IGNORE le cache Finnhub module (anti-fuite réel→test, M3)', async () => {
        // Phase 1 (réel) : peuple le cache module pour XEQT avec un prix RECONNAISSABLE (999).
        vi.mocked(getHistory).mockResolvedValue([
            { date: '2025-01-02', close: 999 }, { date: '2025-06-02', close: 999 },
        ]);
        act(() => {
            useFinanceStore.setState({
                isTestMode: false, apiKeys: { anthropic: '', finnhub: 'k-real' },
                assets: [celiAsset(undefined)], // pas de priceHistory → déclenche le fetch
            });
        });
        const real = renderHook(() => usePastPortfolioHistory());
        await waitFor(() => expect(real.result.current.isLoading).toBe(false));
        await waitFor(() => expect(getHistory).toHaveBeenCalledTimes(1));
        real.unmount();

        // Phase 2 (test) : MÊME symbole partagé, mais fixture à 10. Le cache (999) ne doit PAS fuiter.
        vi.mocked(getHistory).mockClear();
        act(() => {
            useFinanceStore.setState({
                isTestMode: true,
                assets: [celiAsset([{ date: '2025-01-01', price: 10 }, { date: '2025-06-01', price: 10 }])],
            });
        });
        const testH = renderHook(() => usePastPortfolioHistory());

        await waitFor(() => expect(testH.result.current.points.length).toBeGreaterThan(0));
        expect(getHistory).not.toHaveBeenCalled();          // mode test → aucun nouveau fetch
        // ≈ 10×10 = 100 (fixture). Si le cache 999 avait fui → ~9990. Le seuil 1000 discrimine.
        expect(testH.result.current.points.at(-1)!.CELI).toBeLessThan(1000);
    });

    it('garde : aucun actif → résultat vide, isLoading faux, aucun fetch', async () => {
        act(() => { useFinanceStore.setState({ assets: [], isTestMode: false, apiKeys: { anthropic: '', finnhub: 'k' } }); });
        const { result } = renderHook(() => usePastPortfolioHistory());

        // Laisse passer un tick : aucun effet de fetch ne doit partir.
        await new Promise((r) => setTimeout(r, 20));
        expect(result.current.points).toEqual([]);
        expect(result.current.coverage).toBe(1);
        expect(result.current.isLoading).toBe(false);
        expect(getHistory).not.toHaveBeenCalled();
    });

    it('mode réel SANS clé finnhub → pas de fetch, reconstruction de ce qu\'on a (no-fake)', async () => {
        act(() => {
            useFinanceStore.setState({
                isTestMode: false, apiKeys: { anthropic: '', finnhub: '' }, // pas de clé
                assets: [celiAsset([{ date: '2025-01-01', price: 20 }, { date: '2025-06-01', price: 20 }])],
            });
        });
        const { result } = renderHook(() => usePastPortfolioHistory());

        await waitFor(() => expect(result.current.points.length).toBeGreaterThan(0));
        expect(getHistory).not.toHaveBeenCalled();          // pas de clé → pas de réseau
        expect(result.current.isLoading).toBe(false);
    });
});
