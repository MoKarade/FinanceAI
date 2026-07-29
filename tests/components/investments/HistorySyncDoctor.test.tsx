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
import { setHistorySyncReport, clearHistorySyncReport, updateQuoteSkips } from '../../../services/history/syncDiagnostics';
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
    it('[PRICE-SYNC-REPORT] skips de QUOTES → section « Prix non actualisés » avec raison en français', () => {
        clearHistorySyncReport();
        updateQuoteSkips([{ symbol: 'GBS.PA', reason: 'no-quote' }, { symbol: 'BTC', reason: 'error' }]);
        render(<HistorySyncDoctor onApplyQuoteSymbol={onApply} isSyncing={false} />);
        expect(screen.getByText(/Prix non actualisés \(2\)/)).toBeInTheDocument();
        expect(screen.getByText('GBS.PA')).toBeInTheDocument();
        expect(screen.getByText(/aucun cours disponible/)).toBeInTheDocument();
        expect(screen.getByText(/panne du fournisseur/)).toBeInTheDocument();
    });

    it('[PRICE-SYNC-REPORT] DÉDUP : un symbole déjà listé côté HISTORIQUE n\'apparaît PAS en double côté quotes', () => {
        setHistorySyncReport({ at: 1, patchedCount: 0, skipped: [{ symbol: 'CW8', reason: 'empty', detail: 'Introuvable.' }] });
        updateQuoteSkips([{ symbol: 'CW8', reason: 'no-quote' }, { symbol: 'GBS.PA', reason: 'no-quote' }]);
        render(<HistorySyncDoctor onApplyQuoteSymbol={onApply} isSyncing={false} />);
        expect(screen.getByText(/Prix non actualisés \(1\)/)).toBeInTheDocument(); // CW8 dédupliqué
        expect(screen.getAllByText('CW8')).toHaveLength(1);                        // une seule ligne CW8 (historique)
        expect(screen.getByText('GBS.PA')).toBeInTheDocument();
    });

    it('[INVEST-CHART-CLEAN] REPLIÉ par défaut (details sans open) + heading sr-only conservé', () => {
        setHistorySyncReport({ at: 1, patchedCount: 0, skipped: [{ symbol: 'CW8', reason: 'empty', detail: 'x' }] });
        const { container } = render(<HistorySyncDoctor onApplyQuoteSymbol={onApply} isSyncing={false} />);
        expect(container.querySelector('details')?.open).toBeFalsy(); // jsdom ne cache pas le contenu : `open` est le discriminant
        expect(screen.getByRole('heading', { level: 4, name: 'Cours non synchronisés' })).toBeInTheDocument(); // navigation par titres SR
    });

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

    it('[Finding sécurité #494] MODE DISCRET → detailPrivacySafe rendu, JAMAIS le detail à montants', () => {
        useFinanceStore.setState({ isPrivacyMode: true } as never);
        setHistorySyncReport({
            at: 1, patchedCount: 0,
            skipped: [{
                symbol: 'CW8', reason: 'empty',
                detail: 'CW8.PA répond (cours 5000) mais incompatible avec le prix actuel de l\'actif (500).',
                detailPrivacySafe: 'CW8.PA répond mais son cours est incompatible avec le prix actuel de l\'actif (montants masqués).',
            }],
        });
        const { container } = render(<HistorySyncDoctor onApplyQuoteSymbol={onApply} isSyncing={false} />);
        expect(container.textContent).not.toContain('5000');
        expect(container.textContent).not.toContain('500');
        expect(container.textContent).toContain('montants masqués');
    });

    it('[Finding sécurité #494] MODE DISCRET sans detailPrivacySafe → générique sûr (jamais le detail chiffré en repli)', () => {
        useFinanceStore.setState({ isPrivacyMode: true } as never);
        setHistorySyncReport({
            at: 1, patchedCount: 0,
            skipped: [{ symbol: 'CW8', reason: 'empty', detail: 'Contient un montant 12345.' }],
        });
        const { container } = render(<HistorySyncDoctor onApplyQuoteSymbol={onApply} isSyncing={false} />);
        expect(container.textContent).not.toContain('12345');
        expect(container.textContent).toContain('Diagnostic masqué');
    });

    it('MODE TEST → aucun rendu (les diagnostics portent les tickers RÉELS)', () => {
        useFinanceStore.setState({ isTestMode: true } as never);
        setHistorySyncReport({ at: 1, patchedCount: 0, skipped: [{ symbol: 'CW8', reason: 'empty' }] });
        const { container } = render(<HistorySyncDoctor onApplyQuoteSymbol={onApply} isSyncing={false} />);
        expect(container.firstChild).toBeNull();
    });

    it('[Finding code-reviewer #494] même symbole en 2 comptes (2 skips) → UNE seule ligne (pas de clé/id dupliqués)', () => {
        setHistorySyncReport({
            at: 1, patchedCount: 0,
            skipped: [
                { symbol: 'CW8', reason: 'empty', detail: 'Introuvable (CELI).' },
                { symbol: 'CW8', reason: 'empty', detail: 'Introuvable (REER).' },
            ],
        });
        render(<HistorySyncDoctor onApplyQuoteSymbol={onApply} isSyncing={false} />);
        expect(screen.getAllByLabelText(/Symbole de cotation/)).toHaveLength(1); // htmlFor unique
        expect(screen.getByText(/Cours non synchronisés \(1\)/)).toBeInTheDocument();
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
