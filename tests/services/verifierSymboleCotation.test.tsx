// [QUOTE-SYMBOLE-SANS-CONTROLE] Un symbole de cotation COLLÉ était appliqué sans rien vérifier, et
// l'application PURGE l'historique du titre : un symbole coté dans une autre devise effaçait la
// courbe, puis tous ses cours étaient rejetés par la garde de devise de `priceRefresh` — prix figé,
// sans alerte. On vérifie maintenant AVANT de purger.
//
// Deux étages : la règle PURE, puis le geste réel dans Investments (le refus ne doit RIEN écrire —
// c'est la purge qu'on protège, pas un message).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { verifierSymboleCotation } from '../../services/verifierSymboleCotation';
import type { ResultatQuote } from '../../services/marketData';
import type { Asset, ProjectionConfig, BudgetConfig } from '../../types';

const actif = { symbol: 'ISF', currency: 'EUR', currentPrice: 9 } as Pick<Asset, 'symbol' | 'currency' | 'currentPrice'>;
const cours = (price: number, currency: string): ResultatQuote => ({
    forme: 'ok', quote: { symbol: 'X', price, change: 0, changePercent: 0, currency, timestamp: 0 },
});

describe('verifierSymboleCotation (règle pure)', () => {
    it('même devise, même ordre de grandeur → applicable, sans avertissement', () => {
        expect(verifierSymboleCotation(actif, 'ISF.PA', cours(9.2, 'EUR'))).toEqual({ verdict: 'applicable' });
    });
    it('autre devise gérée → REFUS, les deux devises nommées', () => {
        const v = verifierSymboleCotation(actif, 'ISF.TO', cours(9.2, 'CAD'));
        expect(v.verdict).toBe('refuse');
        if (v.verdict === 'refuse') { expect(v.message).toContain('CAD'); expect(v.message).toContain('EUR'); }
    });
    it('devise non gérée (Londres, rapportée GBP après mise en majuscules) → REFUS', () => {
        expect(verifierSymboleCotation(actif, 'ISF.L', cours(850, 'GBP')).verdict).toBe('refuse');
        expect(verifierSymboleCotation({ ...actif, currency: undefined as never }, 'ISF.L', cours(850, 'GBp')).verdict).toBe('refuse');
    });
    it('aucun cours → REFUS (purger sur une hypothèse coûterait la courbe)', () => {
        expect(verifierSymboleCotation(actif, 'ZZZ', { forme: 'absent' }).verdict).toBe('refuse');
    });
    it('panne → REFUS qui dit PANNE, jamais « introuvable »', () => {
        const v = verifierSymboleCotation(actif, 'ISF.PA', { forme: 'echec', echec: { cause: 'NETWORK', provider: 'yahoo' } });
        expect(v.verdict).toBe('refuse');
        if (v.verdict === 'refuse') { expect(v.message).toMatch(/ne répond pas/); expect(v.message).not.toMatch(/aucun cours/); }
    });
    it('ordre de grandeur éloigné → APPLIQUÉ (le symbole saisi est la donnée de Marc) mais DIT', () => {
        const v = verifierSymboleCotation(actif, 'ISF.PA', cours(90, 'EUR'));
        expect(v.verdict).toBe('applicable');
        if (v.verdict === 'applicable') expect(v.avertissement).toMatch(/éloigné/);
    });
    it('sans prix connu : aucun avertissement d\'ordre de grandeur inventé', () => {
        expect(verifierSymboleCotation({ ...actif, currentPrice: 0 }, 'ISF.PA', cours(90, 'EUR'))).toEqual({ verdict: 'applicable' });
    });
    it('devise non indiquée par la source → appliqué, avec avertissement', () => {
        const v = verifierSymboleCotation(actif, 'ISF.PA', cours(9, ''));
        expect(v.verdict === 'applicable' && v.avertissement).toMatch(/n'indique pas la devise/);
    });
    it('aucun message ne recopie un cours ni un prix (toast lisible en mode discret)', () => {
        const messages = [
            verifierSymboleCotation(actif, 'ISF.TO', cours(9.2, 'CAD')),
            verifierSymboleCotation(actif, 'ISF.PA', cours(90, 'EUR')),
            verifierSymboleCotation(actif, 'ISF.L', cours(850, 'GBP')),
        ].map((v) => (v.verdict === 'refuse' ? v.message : v.avertissement ?? ''));
        for (const m of messages) {
            expect(m).not.toMatch(/\b(9[.,]2|90|850|9)\b/);
            expect(m.length).toBeGreaterThan(0);
        }
    });
});

// ── Le geste réel : refus = rien n'est écrit ─────────────────────────────────────────────────
const quoteMock = vi.fn<(s: string) => Promise<ResultatQuote>>();
vi.mock('../../services/marketData', async (orig) => ({
    ...(await orig<typeof import('../../services/marketData')>()),
    getQuoteDetaille: (s: string) => quoteMock(s),
}));
vi.mock('../../components/ui/Toast', () => ({ showToast: vi.fn() }));
vi.mock('../../components/investments/HistorySyncDoctor', async () => {
    const React = await import('react');
    return {
        HistorySyncDoctor: ({ onApplyQuoteSymbol }: { onApplyQuoteSymbol: (a: string, q: string) => Promise<void> }) =>
            React.createElement('button', { type: 'button', onClick: () => void onApplyQuoteSymbol('ISF', 'ISF.X') }, 'appliquer-sonde'),
    };
});
vi.mock('recharts', async () => {
    const React = await import('react');
    const P = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
    return {
        ResponsiveContainer: P, PieChart: P, BarChart: P, LineChart: P, AreaChart: P, ComposedChart: P,
        Pie: () => null, Bar: () => null, Area: () => null, Line: () => null, Cell: () => null,
        Legend: () => null, ReferenceLine: () => null,
        XAxis: () => null, YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null,
    };
});

import { Investments } from '../../components/Investments';
import { useFinanceStore } from '../../store/useFinanceStore';
import { showToast } from '../../components/ui/Toast';

const ISF = {
    symbol: 'ISF', quantity: 10, currency: 'EUR', currentPrice: 9, name: 'ISF', performance: 0,
    dateBought: '2025-01-01', accountType: 'CELI', priceHistory: [{ date: '2025-06-01', price: 8.5 }],
} as Asset;
const proj = { years: 30, returnRate: 6, inflationRate: 2, returnRates: { celi: 7, reer: 6.5, nonReg: 6.5, crypto: 10, cash: 3 } } as unknown as ProjectionConfig;
const config = { users: [], splitMode: '50/50' } as unknown as BudgetConfig;

const monter = (setAssets = vi.fn()) => {
    const vue = render(
        <Investments
            assets={[ISF]} setAssets={setAssets}
            investmentAccounts={[]} setInvestmentAccounts={vi.fn()}
            investmentTransactions={[]} setInvestmentTransactions={vi.fn()}
            apiKey="" transactions={[]} budgetItems={[]}
            config={config} projection={proj} setProjection={vi.fn()}
        />,
    );
    return { vue, setAssets };
};

describe('Investments — un symbole collé est vérifié AVANT la purge', () => {
    beforeEach(() => {
        quoteMock.mockReset();
        vi.mocked(showToast).mockClear();
        // Mode test : le rafraîchissement qui SUIT l'application s'arrête net (aucun réseau).
        useFinanceStore.setState({ assets: [ISF], isTestMode: true } as never);
    });

    it('cours dans une autre devise → AUCUNE écriture (l\'historique survit), refus affiché', async () => {
        quoteMock.mockResolvedValue(cours(9.1, 'CAD'));
        const { vue, setAssets } = monter();
        fireEvent.click(vue.getByText('appliquer-sonde'));
        await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/CAD/), 'error'));
        expect(quoteMock).toHaveBeenCalledWith('ISF.X');
        expect(setAssets).not.toHaveBeenCalled();
    });

    it('CONTRÔLE : cours dans la bonne devise → symbole appliqué et historique purgé (le geste marche encore)', async () => {
        quoteMock.mockResolvedValue(cours(9.1, 'EUR'));
        const { vue, setAssets } = monter();
        fireEvent.click(vue.getByText('appliquer-sonde'));
        await waitFor(() => expect(setAssets).toHaveBeenCalled());
        const ecrit = setAssets.mock.calls[0][0] as Asset[];
        expect(ecrit[0].historySymbol).toBe('ISF.X');
        expect(ecrit[0].priceHistory).toEqual([]);
    });
});
