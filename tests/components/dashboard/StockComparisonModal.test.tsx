import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { StockComparisonModal } from '../../../components/dashboard/StockComparisonModal';

vi.mock('../../../services/finance', () => ({
    fetchPortfolioHistory: vi.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFetch: any = (await import('../../../services/finance')).fetchPortfolioHistory;

const mockData = [
    { date: '2026-01-01', 'NASDAQ:AAPL': 150, 'NASDAQ:TSLA': 200 },
    { date: '2026-02-01', 'NASDAQ:AAPL': 160, 'NASDAQ:TSLA': 180 },
];

beforeEach(() => {
    vi.clearAllMocks();
});

describe('StockComparisonModal', () => {
    it('ne rend rien quand isOpen=false', () => {
        const { container } = render(
            <StockComparisonModal symbols={['AAPL']} isOpen={false} onClose={() => {}} />,
        );
        expect(container.querySelector('[role="dialog"]')).toBeNull();
    });

    it('affiche le titre "Évolution — SYMBOL" pour 1 stock', () => {
        mockFetch.mockResolvedValue(mockData);
        render(<StockComparisonModal symbols={['AAPL']} isOpen onClose={() => {}} />);
        expect(screen.getByText(/Évolution.*AAPL/i)).toBeInTheDocument();
    });

    it('affiche "Comparaison — N actions" pour 2+ stocks', () => {
        mockFetch.mockResolvedValue(mockData);
        render(<StockComparisonModal symbols={['AAPL', 'TSLA']} isOpen onClose={() => {}} />);
        expect(screen.getByText(/Comparaison.*2 actions/i)).toBeInTheDocument();
    });

    it('appelle fetchPortfolioHistory au montage si isOpen', async () => {
        mockFetch.mockResolvedValue(mockData);
        render(<StockComparisonModal symbols={['AAPL']} isOpen onClose={() => {}} />);
        await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    });

    it("n'appelle pas fetch si isOpen=false", () => {
        mockFetch.mockResolvedValue(mockData);
        render(<StockComparisonModal symbols={['AAPL']} isOpen={false} onClose={() => {}} />);
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it("affiche un message quand aucune donnée correspond aux symbols", async () => {
        mockFetch.mockResolvedValue(mockData);
        render(<StockComparisonModal symbols={['NVDA']} isOpen onClose={() => {}} />);
        await waitFor(() => expect(mockFetch).toHaveBeenCalled());
        await screen.findByText(/Aucune donnée disponible/i);
    });
});
