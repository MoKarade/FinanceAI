// [REFONTE-NAV-L2b] Flux de comparaison multi-titres dans Investissements (ex-Accueil Phase
// D.4) : sous-onglet Détail → « Comparer » arme le mode sélection → cocher ≥ 2 titres →
// « Comparer (N) » ouvre la modale superposée avec les symboles cochés. La modale elle-même a
// son propre test (tests/components/investments/StockComparisonModal.test.tsx) — ici on vérifie
// le CÂBLAGE (sélection → props de la modale), via une sonde.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Investments } from '../../../components/Investments';
import { useFinanceStore } from '../../../store/useFinanceStore';
import type { Asset, ProjectionConfig, BudgetConfig, User } from '../../../types';

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
// Sonde de la modale : rend les symbols reçus quand isOpen — le contrat testé est le câblage.
vi.mock('../../../components/investments/StockComparisonModal', async () => {
    const React = await import('react');
    return {
        StockComparisonModal: ({ symbols, isOpen }: { symbols: string[]; isOpen: boolean }) =>
            isOpen
                ? React.createElement('div', { 'data-testid': 'comparison-modal' }, symbols.join(','))
                : null,
    };
});
// ⚠️ Retour STABLE (référence unique au niveau module) : Investments a un
// `useEffect(..., [portfolioHistory])` — un `history: []` recréé à CHAQUE appel du mock
// change d'identité à chaque render → effet → setState → boucle de rendu INFINIE (le vrai
// hook rend une référence cachée/stable ; mesuré : worker vitest à 99 % CPU, run jamais fini).
const stablePortfolioHistory = {
    history: [] as never[], isLoading: false, error: null,
    noHistorySymbols: [] as never[], partialHistorySymbols: [] as never[], staleTailSymbols: [] as never[],
    syntheticTailKeys: new Set<string>(),
};
vi.mock('../../../hooks/usePortfolioHistory', () => ({
    usePortfolioHistory: () => stablePortfolioHistory,
}));

const mkAsset = (symbol: string, price: number): Asset => ({
    symbol, quantity: 10, currency: 'CAD', currentPrice: price, name: symbol,
    performance: 0, dateBought: '2024-01-01', accountType: 'CELI',
} as Asset);

const proj = {
    years: 30, returnRate: 6, inflationRate: 2, savingsMode: 'manual', manualContribution: 0,
    usePortfolioRate: false, returnRates: { celi: 7, reer: 6.5, nonReg: 6.5, crypto: 10, cash: 3 },
    emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3,
} as unknown as ProjectionConfig;
const config: BudgetConfig = {
    users: [
        { name: 'Marc', grossSalary: 7000, netSalary: 5000, color: '#10b981', age: 35, birthYear: 1991, canadaArrivalYear: 1991, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 } as unknown as User,
        { name: 'Anna', grossSalary: 5000, netSalary: 3800, color: '#3b82f6', age: 33, birthYear: 1993, canadaArrivalYear: 1993, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 } as unknown as User,
    ],
    splitMode: '50/50',
};

const renderInvestments = () => render(
    <Investments
        assets={[mkAsset('VFV.TO', 120), mkAsset('AAPL', 200)]} setAssets={vi.fn()}
        investmentAccounts={[]} setInvestmentAccounts={vi.fn()}
        investmentTransactions={[]} setInvestmentTransactions={vi.fn()}
        apiKey="" transactions={[]} budgetItems={[]}
        config={config} projection={proj} setProjection={vi.fn()}
    />,
);

describe('Investments — comparaison multi-titres (REFONTE-NAV-L2b)', () => {
    beforeEach(() => {
        useFinanceStore.setState({ isPrivacyMode: false, lastProjection: null } as never);
    });

    it('sous-onglet Détail : « Comparer » arme le mode, cocher 2 titres puis « Comparer (2) » ouvre la modale avec les 2 symboles', () => {
        renderInvestments();
        // Aller au sous-onglet Détail.
        fireEvent.click(screen.getByText('Détail'));
        // Pas de cases tant que le mode n'est pas armé.
        expect(screen.queryByRole('button', { name: /^Comparer VFV\.TO$/ })).toBeNull();
        expect(screen.queryByTestId('comparison-modal')).toBeNull();
        // Armer le mode.
        fireEvent.click(screen.getByRole('button', { name: 'Comparer' }));
        expect(screen.getByText(/Coche pour comparer/i)).toBeInTheDocument();
        // Cocher les 2 titres.
        fireEvent.click(screen.getByRole('button', { name: 'Comparer VFV.TO' }));
        expect(screen.getByRole('button', { name: 'Voir courbe' })).toBeInTheDocument(); // 1 seul coché
        fireEvent.click(screen.getByRole('button', { name: 'Comparer AAPL' }));
        // « Comparer (2) » ouvre la modale avec exactement les symboles cochés.
        fireEvent.click(screen.getByRole('button', { name: /Comparer \(2\)/ }));
        const modal = screen.getByTestId('comparison-modal');
        expect(modal.textContent).toContain('VFV.TO');
        expect(modal.textContent).toContain('AAPL');
    });

    it('décocher ramène à « Voir courbe » puis au libellé d\'invite ; quitter le mode efface la sélection', () => {
        renderInvestments();
        fireEvent.click(screen.getByText('Détail'));
        fireEvent.click(screen.getByRole('button', { name: 'Comparer' }));
        fireEvent.click(screen.getByRole('button', { name: 'Comparer VFV.TO' }));
        fireEvent.click(screen.getByRole('button', { name: 'Comparer AAPL' }));
        // Décocher AAPL → 1 sélection → « Voir courbe ».
        fireEvent.click(screen.getByRole('button', { name: 'Comparer AAPL' }));
        expect(screen.getByRole('button', { name: 'Voir courbe' })).toBeInTheDocument();
        // Quitter le mode → plus de cases, sélection purgée.
        fireEvent.click(screen.getByRole('button', { name: 'Quitter la comparaison' }));
        expect(screen.queryByRole('button', { name: 'Comparer VFV.TO' })).toBeNull();
        // Ré-armer : la sélection repart de zéro (invite, pas « Voir courbe »).
        fireEvent.click(screen.getByRole('button', { name: 'Comparer' }));
        expect(screen.getByText(/Coche pour comparer/i)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Voir courbe' })).toBeNull();
    });

    // [A11Y-COMPARE-FOCUS] Test DISCRIMINANT vs l'ancienne structure : le ternaire d'avant
    // démontait le bouton au toggle → l'élément focalisé disparaissait du DOM et le focus
    // clavier retombait sur <body>. Avec le bouton bascule PERSISTANT, le MÊME nœud DOM reste
    // monté (seul son libellé change) et garde le focus par construction.
    it('a11y : le focus clavier reste sur le bouton bascule au toggle (jamais perdu vers <body>)', () => {
        renderInvestments();
        fireEvent.click(screen.getByText('Détail'));
        const toggle = screen.getByRole('button', { name: 'Comparer' });
        toggle.focus();
        expect(document.activeElement).toBe(toggle);
        // Armer : même élément, libellé/état basculés, focus conservé.
        fireEvent.click(toggle);
        expect(toggle).toHaveTextContent('Quitter la comparaison');
        expect(toggle).toHaveAttribute('aria-pressed', 'true');
        expect(document.activeElement).not.toBe(document.body);
        expect(document.activeElement).toBe(toggle);
        // Quitter : retour au libellé « Comparer », focus toujours sur le même bouton.
        fireEvent.click(toggle);
        expect(toggle).toHaveTextContent('Comparer');
        expect(toggle).toHaveAttribute('aria-pressed', 'false');
        expect(document.activeElement).toBe(toggle);
    });

    // [INV-COMPARE-SUBTAB] Le mode comparaison ne survit pas à un changement de sous-onglet :
    // revenir sur Détail ne doit PAS rouvrir un mode (ni une sélection) que l'utilisateur
    // croyait quitté en naviguant ailleurs.
    it('changer de sous-onglet désarme le mode comparaison et purge la sélection', () => {
        renderInvestments();
        fireEvent.click(screen.getByText('Détail'));
        fireEvent.click(screen.getByRole('button', { name: 'Comparer' }));
        fireEvent.click(screen.getByRole('button', { name: 'Comparer VFV.TO' }));
        expect(screen.getByRole('button', { name: 'Voir courbe' })).toBeInTheDocument();
        // Aller-retour par un autre sous-onglet.
        fireEvent.click(screen.getByText("Vue d'ensemble"));
        fireEvent.click(screen.getByText('Détail'));
        // Mode désarmé : plus de cases, bouton bascule revenu à « Comparer » (non pressé).
        expect(screen.queryByRole('button', { name: 'Comparer VFV.TO' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Voir courbe' })).toBeNull();
        expect(screen.getByRole('button', { name: 'Comparer' })).toHaveAttribute('aria-pressed', 'false');
    });
});
