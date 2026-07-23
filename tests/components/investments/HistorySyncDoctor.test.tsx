/**
 * @vitest-environment jsdom
 */
// tests/components/investments/HistorySyncDoctor.test.tsx
//
// [HIST-MULTI-PROVIDER] Diagnostic par titre + remède inline : détail affiché, application d'un
// symbole de cotation, recherche par nom → suggestions cliquables, gate mode test (tickers réels).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HistorySyncDoctor } from '../../../components/investments/HistorySyncDoctor';
import { setHistorySyncReport, clearHistorySyncReport } from '../../../services/history/syncDiagnostics';
import { useFinanceStore } from '../../../store/useFinanceStore';

const searchMock = vi.fn();
vi.mock('../../../services/marketData/providers/yahooProxy', () => ({
    searchYahooSymbols: (...a: unknown[]) => searchMock(...a as [string]),
}));
vi.mock('../../../components/ui/Toast', () => ({ showToast: vi.fn() }));

const onApply = vi.fn();

beforeEach(() => {
    onApply.mockClear();
    searchMock.mockReset();
    clearHistorySyncReport();
    useFinanceStore.getState().resetState();
    useFinanceStore.setState({
        isTestMode: false,
        assets: [{ symbol: 'CW8', name: 'Amundi MSCI World', quantity: 10, currency: 'EUR', currentPrice: 500 }],
    } as never);
});

describe('HistorySyncDoctor', () => {
    it('skip « empty » → détail affiché + champ symbole de cotation ; Appliquer → callback', () => {
        setHistorySyncReport({
            at: 1, patchedCount: 0,
            skipped: [{ symbol: 'CW8', reason: 'empty', detail: 'Introuvable chez les fournisseurs (essayé : CW8, CW8.PA).', triedSymbols: ['CW8', 'CW8.PA'] }],
        });
        render(<HistorySyncDoctor onApplyQuoteSymbol={onApply} isSyncing={false} />);
        expect(screen.getByText(/Introuvable chez les fournisseurs/)).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText(/Symbole de cotation/), { target: { value: ' AASI.PA ' } });
        fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));
        expect(onApply).toHaveBeenCalledWith('CW8', 'AASI.PA'); // trim appliqué
    });

    it('« Chercher le titre » → recherche par le NOM de l\'actif → suggestions cliquables → callback', async () => {
        searchMock.mockResolvedValue([{ symbol: 'AASI.PA', name: 'Amundi MSCI Em Asia', exchange: 'Paris' }]);
        setHistorySyncReport({ at: 1, patchedCount: 0, skipped: [{ symbol: 'CW8', reason: 'empty', detail: 'Introuvable.' }] });
        render(<HistorySyncDoctor onApplyQuoteSymbol={onApply} isSyncing={false} />);
        fireEvent.click(screen.getByRole('button', { name: 'Chercher le titre' }));
        await waitFor(() => expect(screen.getByText(/AASI\.PA — Amundi MSCI Em Asia/)).toBeInTheDocument());
        expect(searchMock).toHaveBeenCalledWith('Amundi MSCI World'); // le NOM, pas le ticker cassé
        fireEvent.click(screen.getByText(/AASI\.PA — Amundi MSCI Em Asia/));
        expect(onApply).toHaveBeenCalledWith('CW8', 'AASI.PA');
    });

    it('MODE TEST → aucun rendu (les diagnostics portent les tickers RÉELS)', () => {
        useFinanceStore.setState({ isTestMode: true } as never);
        setHistorySyncReport({ at: 1, patchedCount: 0, skipped: [{ symbol: 'CW8', reason: 'empty' }] });
        const { container } = render(<HistorySyncDoctor onApplyQuoteSymbol={onApply} isSyncing={false} />);
        expect(container.firstChild).toBeNull();
    });

    it('aucun échec actionnable (fresh/no-provider seulement) → aucun rendu', () => {
        setHistorySyncReport({
            at: 1, patchedCount: 3,
            skipped: [{ symbol: 'XEQT.TO', reason: 'fresh' }, { symbol: 'GIC', reason: 'no-provider' }],
        });
        const { container } = render(<HistorySyncDoctor onApplyQuoteSymbol={onApply} isSyncing={false} />);
        expect(container.firstChild).toBeNull();
    });

    it('resynchronisation en cours → Appliquer désactivé (pas de double écriture)', () => {
        setHistorySyncReport({ at: 1, patchedCount: 0, skipped: [{ symbol: 'CW8', reason: 'empty', detail: 'x' }] });
        render(<HistorySyncDoctor onApplyQuoteSymbol={onApply} isSyncing />);
        fireEvent.change(screen.getByLabelText(/Symbole de cotation/), { target: { value: 'AASI.PA' } });
        fireEvent.click(screen.getByRole('button', { name: 'Synchronisation…' }));
        expect(onApply).not.toHaveBeenCalled();
    });
});
