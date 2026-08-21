// [FX-FALLBACK-SILENCIEUX] — le badge doit se déclencher SEULEMENT quand un taux estimé COMPTE
// (au moins un avoir en devise étrangère), pas à chaque fois que le taux vient du repli en dur.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FxEstimateBadge } from '../../../components/ui/FxEstimateBadge';
import { useFinanceStore } from '../../../store/useFinanceStore';
import type { Asset } from '../../../types';

const asset = (o: Partial<Asset>): Asset => ({
    symbol: 'X', quantity: 1, currentPrice: 100, currency: 'CAD',
    accountType: 'NON-ENREG', performance: 0, priceHistory: [], ...o,
} as Asset);

describe('FxEstimateBadge', () => {
    it('taux estimé (lastFetched: 0) + avoir ÉTRANGER → visible', () => {
        useFinanceStore.setState({
            fxRates: { USD: 1.40, EUR: 1.47, CAD: 1, lastFetched: 0 },
            assets: [asset({ currency: 'USD' })],
        });
        render(<FxEstimateBadge />);
        expect(screen.getByText('Taux de change estimés')).toBeInTheDocument();
    });

    it('taux estimé mais AUCUN avoir étranger → invisible (rien à convertir)', () => {
        useFinanceStore.setState({
            fxRates: { USD: 1.40, EUR: 1.47, CAD: 1, lastFetched: 0 },
            assets: [asset({ currency: 'CAD' })],
        });
        render(<FxEstimateBadge />);
        expect(screen.queryByText('Taux de change estimés')).toBeNull();
    });

    it('avoir étranger mais taux RÉEL (lastFetched > 0) → invisible', () => {
        useFinanceStore.setState({
            fxRates: { USD: 1.35, EUR: 1.45, CAD: 1, lastFetched: 1700000000 },
            assets: [asset({ currency: 'USD' })],
        });
        render(<FxEstimateBadge />);
        expect(screen.queryByText('Taux de change estimés')).toBeNull();
    });
});
