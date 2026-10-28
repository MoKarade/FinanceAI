/**
 * @vitest-environment jsdom
 */
// [PORTFOLIO-HISTORY] usePortfolioHistory DÉRIVE du store (priceHistory hydraté + achats DCA + FX)
// — plus AUCUN fetch réseau ici (l'ancien hook fetchait un CSV stub mort → graphes vides en réel).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const { genSpy } = vi.hoisted(() => ({ genSpy: vi.fn() }));
vi.mock('../../services/testFixtures', () => ({ generateTestMarketData: genSpy }));

import { usePortfolioHistory } from '../../hooks/usePortfolioHistory';
import { useFinanceStore } from '../../store/useFinanceStore';
import type { Asset } from '../../types';

const mkAsset = (over: Partial<Asset>): Asset => ({
    symbol: 'XEQT.TO', quantity: 10, currency: 'CAD', currentPrice: 30, name: 'XEQT',
    performance: 0, dateBought: '2026-01-10',
    purchases: [{ date: '2026-01-10', quantity: 10, price: 28 }],
    priceHistory: [
        { date: '2026-01-10', price: 28 },
        { date: '2026-02-10', price: 30 },
    ],
    accountType: 'CELI',
    ...over,
} as Asset);

beforeEach(() => {
    genSpy.mockReset();
    useFinanceStore.getState().resetState();
    useFinanceStore.setState({ isTestMode: false });
});

describe('usePortfolioHistory (dérivé du store)', () => {
    it('mode test : données synthétiques des fixtures, buildMarketData non impliqué', () => {
        const synthetic = [{ date: '2026-01', value: 1000 }];
        genSpy.mockReturnValue(synthetic);
        useFinanceStore.setState({ isTestMode: true });

        const { result } = renderHook(() => usePortfolioHistory());
        expect(result.current.history).toEqual(synthetic);
        expect(result.current.isLoading).toBe(false);
    });

    it('mode réel : lignes dérivées du priceHistory du store (colonne symbole + TOTAL)', () => {
        useFinanceStore.setState({ assets: [mkAsset({})] } as never);
        const { result } = renderHook(() => usePortfolioHistory());
        const rows = result.current.history;
        expect(rows.length).toBe(2);
        expect(rows[0]['XEQT.TO']).toBe(280);  // 10 × 28 (CAD)
        expect(rows[1]['XEQT.TO']).toBe(300);  // 10 × 30
        expect(rows[1].TOTAL).toBe(300);
        expect(result.current.noHistorySymbols).toEqual([]);
    });

    it('[HIST-COVERAGE-TOTAL] mode réel : un actif SANS historique n\'a pas de colonne mais COMPTE au TOTAL (valeur actuelle) et est signalé', () => {
        useFinanceStore.setState({
            assets: [mkAsset({}), mkAsset({ symbol: 'NOHIST', priceHistory: [], currentPrice: 30 })],
        } as never);
        const { result } = renderHook(() => usePortfolioHistory());
        expect(result.current.noHistorySymbols).toEqual([{ symbol: 'NOHIST', valueCad: 300 }]);
        expect(result.current.history[1].TOTAL).toBe(600); // 300 (XEQT) + 300 (repli valeur actuelle)
        expect(result.current.history[1].NOHIST).toBeUndefined(); // aucune courbe inventée
    });
});
