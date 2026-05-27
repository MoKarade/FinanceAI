/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const { fetchSpy, genSpy } = vi.hoisted(() => ({
    fetchSpy: vi.fn(),
    genSpy: vi.fn(),
}));
vi.mock('../../services/finance', () => ({ fetchPortfolioHistory: fetchSpy }));
vi.mock('../../services/testFixtures', () => ({ generateTestMarketData: genSpy }));

import { usePortfolioHistory, invalidatePortfolioHistoryCache } from '../../hooks/usePortfolioHistory';
import { useFinanceStore } from '../../store/useFinanceStore';

beforeEach(() => {
    invalidatePortfolioHistoryCache();
    fetchSpy.mockReset();
    genSpy.mockReset();
    useFinanceStore.setState({ isTestMode: false });
});

describe('usePortfolioHistory', () => {
    it('mode test : données synthétiques, aucun fetch réseau', () => {
        const synthetic = [{ date: '2026-01', value: 1000 }];
        genSpy.mockReturnValue(synthetic);
        useFinanceStore.setState({ isTestMode: true });

        const { result } = renderHook(() => usePortfolioHistory());
        expect(result.current.history).toEqual(synthetic);
        expect(result.current.isLoading).toBe(false);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('mode normal : fetch puis cache partagé (un seul appel réseau)', async () => {
        const data = [{ date: '2026-01', value: 5000 }];
        fetchSpy.mockResolvedValue(data);

        const { result } = renderHook(() => usePortfolioHistory());
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.history).toEqual(data);
        expect(fetchSpy).toHaveBeenCalledTimes(1);

        // 2e consumer : servi depuis le cache module, pas de 2e fetch
        renderHook(() => usePortfolioHistory());
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("mode normal : expose l'erreur si le fetch échoue", async () => {
        fetchSpy.mockRejectedValue(new Error('réseau ko'));
        const { result } = renderHook(() => usePortfolioHistory());
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.error).toBeInstanceOf(Error);
    });
});
