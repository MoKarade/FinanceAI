// [REFONTE-NAV-L2b] FutureHistorySection — sous-onglet « Historique » du Futur (évolution
// passée par compte, déménagée de l'ex-Accueil). Couvre : rendu (chips + graphe + étiquette
// d'honnêteté), bascule de période (1M → ALL change la fenêtre passée au graphe), persistance
// des comptes masqués (clés localStorage 'dashboard:*' CONSERVÉES au déménagement) et toggle
// de la ligne Total. Adapté de tests/components/Dashboard.duplicateKeys.test.tsx (même contrat
// producteur TOTAL_* pour le marketData synthétique).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FutureHistorySection from '../../../components/future/FutureHistorySection';
import { useFinanceStore } from '../../../store/useFinanceStore';
import type { Asset } from '../../../types';
import type { MarketDataPoint } from '../../../services/finance';

// Le graphe (recharts lourd) est remplacé par une sonde qui expose les props reçues —
// on vérifie le CONTRAT (points filtrés, comptes masqués, ligne Total), pas le SVG.
vi.mock('../../../components/dashboard/DashboardEvolutionChart', async () => {
    const React = await import('react');
    return {
        default: (props: {
            unifiedHistory: unknown[]; accountKeys: string[];
            hiddenAccounts?: Set<string>; showTotalLine?: boolean;
        }) => React.createElement('div', {
            'data-testid': 'evo-chart',
            'data-points': String(props.unifiedHistory.length),
            'data-keys': props.accountKeys.join(','),
            'data-hidden': [...(props.hiddenAccounts ?? new Set<string>())].join(','),
            'data-total': String(props.showTotalLine ?? false),
        }),
    };
});
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'fr' } }),
}));

// Dates RELATIVES à aujourd'hui : le filtre de période compare à `new Date()` — des dates
// figées (2024-…) rendraient la fenêtre 1M vide et le test vacueux.
const isoDaysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().split('T')[0];

// Contrat producteur (panel 2026-07-22) : les piles CELI/REER/… viennent des buckets TOTAL_*.
const marketData: MarketDataPoint[] = [
    { date: isoDaysAgo(100), 'VFV.TO': 1000, TOTAL_CELI: 1000, TOTAL: 1000 },
    { date: isoDaysAgo(10), 'VFV.TO': 1100, TOTAL_CELI: 1100, TOTAL: 1100 },
    { date: isoDaysAgo(0), 'VFV.TO': 1200, TOTAL_CELI: 1200, TOTAL: 1200 },
];

// ⚠️ Retour STABLE (même leçon que le mock d'InvestmentsCompare.test) : des tableaux recréés
// à chaque appel changent d'identité à chaque render — le vrai hook rend des références stables.
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

describe('FutureHistorySection (sous-onglet Historique du Futur)', () => {
    beforeEach(() => {
        localStorage.clear();
        useFinanceStore.setState({
            transactions: [],
            assets: [celiAsset],
            initialBalances: { LIQUIDITE: 45000 },
            debts: [],
            realEstateGoals: [],
            isPrivacyMode: false,
        } as never);
    });

    it('rend les chips de comptes (cash + bucket CELI), le graphe et l\'étiquette « historique »', async () => {
        render(<FutureHistorySection />);
        // Chips : le compte cash ET la pile CELI (bucket TOTAL_CELI émis) — pas de série à 0.
        expect(screen.getByRole('button', { name: 'LIQUIDITE' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'CELI' })).toBeInTheDocument();
        // Le graphe (lazy) finit par se rendre avec les bonnes séries.
        const chart = await screen.findByTestId('evo-chart');
        expect(chart.getAttribute('data-keys')).toBe('LIQUIDITE,CELI');
        // Étiquette d'honnêteté : courbe HISTORIQUE (dernier close), pas la projection voisine.
        expect(screen.getByText(/dernier cours de clôture \(historique\)/i)).toBeInTheDocument();
    });

    it('bascule de période : 1M (défaut) montre la fenêtre récente, ALL montre tout l\'historique', async () => {
        render(<FutureHistorySection />);
        // Défaut 1M : le point à J-100 est HORS fenêtre → 2 points seulement.
        const chart = await screen.findByTestId('evo-chart');
        expect(chart.getAttribute('data-points')).toBe('2');
        // ALL : les 3 points passent au graphe.
        fireEvent.click(screen.getByRole('button', { name: 'ALL' }));
        const chartAll = await screen.findByTestId('evo-chart');
        expect(chartAll.getAttribute('data-points')).toBe('3');
    });

    it('persistance des comptes masqués : relit ET réécrit la clé localStorage de l\'ex-Accueil', async () => {
        // Préférence existante (posée par l'ex-Accueil) : CELI masqué. Le déménagement DOIT la relire.
        localStorage.setItem('dashboard:hiddenAccounts:v1', JSON.stringify(['CELI']));
        render(<FutureHistorySection />);
        const chart = await screen.findByTestId('evo-chart');
        expect(chart.getAttribute('data-hidden')).toBe('CELI');
        // Le chip masqué se présente en « Afficher CELI » (aria-pressed=false).
        const celiChip = screen.getByTitle('Afficher CELI');
        expect(celiChip.getAttribute('aria-pressed')).toBe('false');
        // Ré-afficher CELI → la clé est réécrite sans lui.
        fireEvent.click(celiChip);
        expect(JSON.parse(localStorage.getItem('dashboard:hiddenAccounts:v1') ?? '[]')).toEqual([]);
        // Masquer LIQUIDITE → la clé porte le nouveau masqué (même clé, même format).
        fireEvent.click(screen.getByTitle('Masquer LIQUIDITE'));
        expect(JSON.parse(localStorage.getItem('dashboard:hiddenAccounts:v1') ?? '[]')).toEqual(['LIQUIDITE']);
        const chartAfter = await screen.findByTestId('evo-chart');
        expect(chartAfter.getAttribute('data-hidden')).toBe('LIQUIDITE');
    });

    // Porté de tests/components/Dashboard.duplicateKeys.test.tsx (supprimé avec l'ex-Accueil) :
    // régression « Diane & Robert » — un compte CASH peut porter le MÊME nom qu'une catégorie
    // d'investissement (CELI/REER dans initialBalances) → sans dédoublonnage, la clé apparaît
    // deux fois dans accountKeys (chips + séries recharts dupliquées, warning React « same key »).
    it('clés uniques : un compte cash nommé CELI/REER ne duplique ni chip ni clé de série', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            useFinanceStore.setState({
                initialBalances: { CELI: 0, REER: 0, LIQUIDITE: 45000 },
            } as never);
            render(<FutureHistorySection />);
            // Un SEUL chip par compte malgré la collision de noms (title Masquer/Afficher unique).
            for (const name of ['CELI', 'LIQUIDITE']) {
                const chips = screen.getAllByRole('button').filter(b => {
                    const tt = b.getAttribute('title') || '';
                    return tt === `Masquer ${name}` || tt === `Afficher ${name}`;
                });
                expect(chips, `chips dupliqués pour ${name}`).toHaveLength(1);
            }
            // accountKeys passé au graphe sans doublon (REER absent : bucket ET cash à 0 → filtré).
            const chart = await screen.findByTestId('evo-chart');
            const keys = (chart.getAttribute('data-keys') ?? '').split(',');
            expect(new Set(keys).size).toBe(keys.length);
            // Aucun warning React « same key ».
            const sameKeyWarning = errorSpy.mock.calls.find(call =>
                call.some(arg => typeof arg === 'string' && /same key/i.test(arg)));
            expect(sameKeyWarning, JSON.stringify(sameKeyWarning)).toBeUndefined();
        } finally {
            errorSpy.mockRestore();
        }
    });

    it('toggle « Total » : superpose la ligne et persiste dashboard:showTotal:v1', async () => {
        render(<FutureHistorySection />);
        const chart = await screen.findByTestId('evo-chart');
        expect(chart.getAttribute('data-total')).toBe('false');
        fireEvent.click(screen.getByTitle('Afficher la ligne Total'));
        expect(localStorage.getItem('dashboard:showTotal:v1')).toBe('true');
        const chartAfter = await screen.findByTestId('evo-chart');
        expect(chartAfter.getAttribute('data-total')).toBe('true');
    });
});
