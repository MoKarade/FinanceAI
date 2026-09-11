// [FUTUR-MOBILE-PR5] Historique mobile : les pastilles de compte (~22-24 px) doivent atteindre
// 44 px SUR TÉLÉPHONE — desktop INCHANGÉ (mandat Marc #13, contrôle négatif).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import FutureHistorySection from '../../../components/future/FutureHistorySection';
import { useFinanceStore } from '../../../store/useFinanceStore';
import { _resetViewportMqlForTests } from '../../../hooks/useViewportBelowSm';
import type { Asset } from '../../../types';
import type { MarketDataPoint } from '../../../services/finance';

vi.mock('../../../components/dashboard/DashboardEvolutionChart', async () => {
    const React = await import('react');
    return { default: () => React.createElement('div', { 'data-testid': 'evo-chart' }) };
});
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'fr' } }),
}));

const isoDaysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().split('T')[0];
const marketData: MarketDataPoint[] = [
    { date: isoDaysAgo(10), 'VFV.TO': 1100, TOTAL_CELI: 1100, TOTAL: 1100 },
    { date: isoDaysAgo(0), 'VFV.TO': 1200, TOTAL_CELI: 1200, TOTAL: 1200 },
];
const stablePortfolioHistory = {
    history: marketData, isLoading: false, error: null,
    noHistorySymbols: [] as never[], partialHistorySymbols: [] as never[], staleTailSymbols: [] as never[],
    syntheticTailKeys: new Set<string>(),
};
vi.mock('../../../hooks/usePortfolioHistory', () => ({
    usePortfolioHistory: () => stablePortfolioHistory,
}));

const celiAsset: Asset = {
    symbol: 'VFV.TO', quantity: 10, currency: 'CAD', currentPrice: 120, name: 'VFV.TO',
    performance: 0, dateBought: '2024-01-01', accountType: 'CELI',
} as Asset;

const stubViewport = (narrow: boolean) => {
    _resetViewportMqlForTests();
    vi.stubGlobal('matchMedia', (q: string) => ({
        media: q, matches: narrow,
        addEventListener: () => {}, removeEventListener: () => {},
    }));
};

beforeEach(() => {
    localStorage.clear();
    useFinanceStore.setState({
        transactions: [], assets: [celiAsset], initialBalances: { LIQUIDITE: 45000 },
        debts: [], realEstateGoals: [], isPrivacyMode: false,
    } as never);
});

afterEach(() => { vi.unstubAllGlobals(); _resetViewportMqlForTests(); });

describe('[FUTUR-MOBILE-PR5] FutureHistorySection — cibles tactiles mobile', () => {
    it('desktop (défaut jsdom) : les pastilles ne portent PAS min-h-[44px]', () => {
        render(<FutureHistorySection />);
        expect(screen.getByRole('button', { name: 'LIQUIDITE' }).className).not.toContain('min-h-[44px]');
        expect(screen.getByTitle('Afficher la ligne Total').className).not.toContain('min-h-[44px]');
    });

    it('mobile : les pastilles de compte ET « Total » atteignent min-h-[44px]', () => {
        stubViewport(true);
        render(<FutureHistorySection />);
        expect(screen.getByRole('button', { name: 'LIQUIDITE' }).className).toContain('min-h-[44px]');
        expect(screen.getByTitle('Afficher la ligne Total').className).toContain('min-h-[44px]');
    });
});
