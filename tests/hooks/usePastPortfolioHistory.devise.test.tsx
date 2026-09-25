// [HISTORIQUE-YAHOO-DEVISE-NON-LUE] Le hook de la courbe passée consomme l'historique SANS passer
// par l'hydratation (actifs non encore hydratés) : il doit appliquer la MÊME règle de devise, sinon
// des clôtures en pence entrent dans la courbe du Futur à ×100 par cette seconde porte.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

vi.mock('../../services/marketData', () => ({
    getHistory: vi.fn(),
    configureMarketDataProvider: vi.fn(),
}));

import { usePastPortfolioHistory, _resetPastHistoryFetchCache } from '../../hooks/usePastPortfolioHistory';
import { getHistory } from '../../services/marketData';
import { useFinanceStore } from '../../store/useFinanceStore';
import type { Asset } from '../../types';

const asset = {
    symbol: 'ISF', quantity: 10, currency: 'EUR', currentPrice: 9,
    accountType: 'CELI', dateBought: '2025-01-01',
} as unknown as Asset;

const serie = (currency: string) => [
    { date: '2025-01-02', close: 850, currency },
    { date: '2025-01-03', close: 860, currency },
];

describe('[HISTORIQUE-YAHOO-DEVISE-NON-LUE] usePastPortfolioHistory — garde de devise', () => {
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

    // La reconstruction retombe sur le prix COURANT (9 €) quand la série manque : la courbe existe
    // dans les deux cas. Ce qui discrimine est la VALEUR — 10 × 850 × FX (> 10 000 $) si la série en
    // pence est lue comme des euros, 10 × 9 × FX (≈ 130 $) si elle est refusée. Le contrôle en EUR
    // prouve que la même série, dans la bonne devise, est bien CONSOMMÉE (sinon le premier cas
    // passerait aussi avec un hook qui n'appelle plus rien).
    const maxInvesti = (pts: ReadonlyArray<{ InvestedValue?: number }>) =>
        Math.max(0, ...pts.map((p) => Number(p.InvestedValue) || 0));

    it('clôtures en pence sur un actif EUR → la série n\'entre pas dans la courbe', async () => {
        vi.mocked(getHistory).mockResolvedValue(serie('GBp'));
        const h = renderHook(() => usePastPortfolioHistory());
        await waitFor(() => expect(getHistory).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(h.result.current.isLoading).toBe(false));
        expect(maxInvesti(h.result.current.points)).toBeLessThan(1_000);
    });

    it('CONTRÔLE : la même série en EUR → consommée (valeur portée par ses clôtures)', async () => {
        vi.mocked(getHistory).mockResolvedValue(serie('EUR'));
        const h = renderHook(() => usePastPortfolioHistory());
        await waitFor(() => expect(maxInvesti(h.result.current.points)).toBeGreaterThan(10_000));
    });
});
