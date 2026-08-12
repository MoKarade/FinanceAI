// [PORTFOLIO-HISTORY] Le modal DÉRIVE du store via usePortfolioHistory (plus aucun fetch réseau —
// l'ancien fetchPortfolioHistory était un stub mort → « Aucune donnée » à chaque ouverture).
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StockComparisonModal } from '../../../components/investments/StockComparisonModal';
import { useFinanceStore } from '../../../store/useFinanceStore';
import type { Asset } from '../../../types';

const mkAsset = (symbol: string, price: number): Asset => ({
    symbol, quantity: 10, currency: 'CAD', currentPrice: price, name: symbol,
    performance: 0, dateBought: '2026-01-10',
    purchases: [{ date: '2026-01-10', quantity: 10, price }],
    priceHistory: [
        { date: '2026-01-10', price },
        { date: '2026-02-10', price: price * 1.1 },
    ],
    accountType: 'NON-ENREG',
} as Asset);

beforeEach(() => {
    useFinanceStore.getState().resetState();
    useFinanceStore.setState({ isTestMode: false, assets: [mkAsset('AAPL', 150), mkAsset('TSLA', 200)] } as never);
});

describe('StockComparisonModal (dérivé du store)', () => {
    it('ne rend rien quand isOpen=false', () => {
        const { container } = render(
            <StockComparisonModal symbols={['AAPL']} isOpen={false} onClose={() => {}} />,
        );
        expect(container.querySelector('[role="dialog"]')).toBeNull();
    });

    it('affiche le titre "Évolution — SYMBOL" pour 1 stock', () => {
        render(<StockComparisonModal symbols={['AAPL']} isOpen onClose={() => {}} />);
        expect(screen.getByText(/Évolution.*AAPL/i)).toBeInTheDocument();
    });

    it('affiche "Comparaison — N actions" pour 2+ stocks', () => {
        render(<StockComparisonModal symbols={['AAPL', 'TSLA']} isOpen onClose={() => {}} />);
        expect(screen.getByText(/Comparaison.*2 actions/i)).toBeInTheDocument();
    });

    it('rend la courbe depuis le priceHistory du store (pas « Aucune donnée »)', () => {
        render(<StockComparisonModal symbols={['AAPL']} isOpen onClose={() => {}} />);
        expect(screen.queryByText(/Aucune donnée disponible/i)).toBeNull();
    });

    it('affiche un message honnête quand aucune donnée ne correspond aux symbols', () => {
        render(<StockComparisonModal symbols={['NVDA']} isOpen onClose={() => {}} />);
        expect(screen.getByText(/Aucune donnée disponible/i)).toBeInTheDocument();
    });
});
