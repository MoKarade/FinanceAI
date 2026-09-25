// [FUTUR-HISTORIQUE-DETTE-DU-JOUR] L'Historique du Futur retranchait la dette d'AUJOURD'HUI à toutes
// ses dates passées : un bail remboursé chaque semaine y restait plat à son niveau du jour, et une
// dette contractée il y a trois semaines pesait déjà sur un point vieux de trois mois. La courbe du
// Futur, dans le même onglet, reconstruisait déjà la dette au jour — deux passés pour une seule
// dette. La garde observe les POINTS remis au graphe, jamais la formule recopiée.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FutureHistorySection from '../../../components/future/FutureHistorySection';
import { useFinanceStore } from '../../../store/useFinanceStore';
import type { Asset, Debt } from '../../../types';
import type { MarketDataPoint } from '../../../services/finance';

// Sonde : expose les points REMIS au graphe (le SVG ne nous intéresse pas).
vi.mock('../../../components/dashboard/DashboardEvolutionChart', async () => {
    const React = await import('react');
    return {
        default: (props: { unifiedHistory: unknown[] }) => React.createElement('div', {
            'data-testid': 'evo-chart',
            'data-history': JSON.stringify(props.unifiedHistory),
        }),
    };
});
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'fr' } }),
}));

// Dates RELATIVES à aujourd'hui (le composant lit le vrai jour) : des dates figées rendraient la
// garde vacueuse le jour où la fixture passe hors fenêtre.
const isoDaysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().split('T')[0];
const J100 = isoDaysAgo(100);
const J0 = isoDaysAgo(0);

const marketData: MarketDataPoint[] = [
    { date: J100, 'VFV.TO': 1000, TOTAL_CELI: 1000, TOTAL: 1000 },
    { date: J0, 'VFV.TO': 1200, TOTAL_CELI: 1200, TOTAL: 1200 },
];
const stablePortfolioHistory = {
    history: marketData, isLoading: false, error: null,
    noHistorySymbols: [] as never[], partialHistorySymbols: [] as never[], staleTailSymbols: [] as never[],
    syntheticTailKeys: new Set<string>(),
};
vi.mock('../../../hooks/usePortfolioHistory', () => ({
    usePortfolioHistory: () => stablePortfolioHistory,
}));

const celiAsset = {
    symbol: 'VFV.TO', quantity: 10, currency: 'CAD', currentPrice: 120, name: 'VFV.TO',
    performance: 0, dateBought: '2024-01-01', accountType: 'CELI',
} as Asset;

/** Bail à taux nul prélevé chaque semaine : solde = somme des versements restants. */
const VERSEMENT_HEBDO = 150; // 650 × 12 / 52
const BAIL = {
    id: 'bail', name: 'Bail auto', category: 'Car', kind: 'auto-lease',
    balance: 30_150, interestRate: 0, minimumPayment: 650,
    startDate: isoDaysAgo(140), termEndDate: isoDaysAgo(-1400), paymentFrequency: 'weekly',
} as Debt;

/** Carte contractée il y a trois semaines : elle n'existait pas au point de J-100. */
const CARTE_RECENTE = {
    id: 'carte', name: 'Carte', category: 'CreditCard', kind: 'credit-card',
    balance: 5_000, interestRate: 20, minimumPayment: 100, startDate: isoDaysAgo(20),
} as Debt;

const pointsDuGraphe = async (): Promise<Array<Record<string, number | string>>> => {
    render(<FutureHistorySection />);
    fireEvent.click(screen.getByRole('button', { name: 'ALL' }));
    const chart = await screen.findByTestId('evo-chart');
    return JSON.parse(chart.getAttribute('data-history') ?? '[]');
};
const auJour = (pts: Array<Record<string, number | string>>, jour: string) => {
    const p = pts.find((x) => x.date === jour);
    if (!p) throw new Error(`point ${jour} absent`);
    return p;
};

describe('[FUTUR-HISTORIQUE-DETTE-DU-JOUR] la dette de l\'Historique est celle de CHAQUE date', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('bail hebdomadaire : au point de J-100 on devait les versements faits depuis, aujourd\'hui le solde du jour', async () => {
        useFinanceStore.setState({
            transactions: [], assets: [celiAsset], initialBalances: {}, debts: [BAIL],
            realEstateGoals: [], isPrivacyMode: false,
        } as never);
        const pts = await pointsDuGraphe();
        const passe = auJour(pts, J100);
        const present = auJour(pts, J0);
        // Raccord EXACT au présent : pas de marche entre l'Historique et le solde du jour.
        expect(present.Dettes).toBeCloseTo(-BAIL.balance, 2);
        // 100 jours = 14 prélèvements hebdomadaires (± 1 selon le jour de la semaine).
        const verseDepuis = -Number(passe.Dettes) - BAIL.balance;
        expect(verseDepuis).toBeGreaterThanOrEqual(13 * VERSEMENT_HEBDO - 0.01);
        expect(verseDepuis).toBeLessThanOrEqual(15 * VERSEMENT_HEBDO + 0.01);
        // Le TOTAL porte la même dette que la série « Dettes » (pas de seconde lecture).
        expect(Number(passe.Total)).toBeCloseTo(Number(passe.CELI) + Number(passe.Dettes), 2);
    });

    it('dette contractée après la date du point : elle ne pèse pas sur ce point', async () => {
        useFinanceStore.setState({
            transactions: [], assets: [celiAsset], initialBalances: {}, debts: [CARTE_RECENTE],
            realEstateGoals: [], isPrivacyMode: false,
        } as never);
        const pts = await pointsDuGraphe();
        expect(Math.abs(Number(auJour(pts, J100).Dettes))).toBe(0);
        // ANTI-VACUITÉ : la carte existe bien aujourd'hui — sinon « 0 au passé » serait vrai d'une
        // dette jamais lue.
        expect(auJour(pts, J0).Dettes).toBeCloseTo(-CARTE_RECENTE.balance, 2);
    });
});
