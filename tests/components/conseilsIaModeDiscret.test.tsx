// tests/components/conseilsIaModeDiscret.test.tsx
//
// [AI-PRIVACY-CONSEILS-NON-GATES] (audit 2026-09-07) Décision Marc 2026-09-05 : MASQUER — « en mode
// discret, les montants ne partent pas non plus vers l'assistant ». Appliquée au chat, au diagnostic
// Budget et aux cartes de signaux, elle ne l'était PAS aux trois cartes de CONSEIL, dont le prompt
// porte des montants en clair (`promptCad` dans `services/claude.ts`) : brut/net des deux conjoints,
// prix / mise de fonds / mensualité / loyer, Δ en dollars de chaque action de rééquilibrage. Cause
// structurelle : `amountPrivacyScan` ne scanne que `components/`, et le prompt se compose au service.
// Même paire de gardes que `budgetAiModalModeDiscret` : le service n'est PAS appelé, et l'écran dit
// pourquoi — chacune avec son contrôle (mode normal → l'appel part), sans quoi « pas appelé » serait
// aussi vrai d'un espion jamais câblé.
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act, waitFor } from '@testing-library/react';
import { CoupleOptimizationCard } from '../../components/tax/CoupleOptimizationCard';
import { RealEstateAdviceCard } from '../../components/realestate/RealEstateAdviceCard';
import { Investments } from '../../components/Investments';
import { MESSAGE_IA_MODE_DISCRET } from '../../services/messageErreurIa';
import { useFinanceStore } from '../../store/useFinanceStore';
import type { BudgetConfig, User, Asset, ProjectionConfig } from '../../types';

const couple = vi.fn(async () => []);
const immo = vi.fn(async () => null);
const rebal = vi.fn(async () => ({ forme: 'sans-reponse' as const }));
vi.mock('../../services/claude', async () => {
    const reel = await vi.importActual<typeof import('../../services/claude')>('../../services/claude');
    return {
        ...reel,
        getCoupleOptimizationStrategies: (...a: unknown[]) => couple(...(a as [])),
        getRealEstateAdvice: (...a: unknown[]) => immo(...(a as [])),
        getRebalanceJustifications: (...a: unknown[]) => rebal(...(a as [])),
    };
});
vi.mock('recharts', async () => {
    const R = await import('react');
    const P = ({ children }: { children?: React.ReactNode }) => R.createElement('div', null, children);
    return {
        ResponsiveContainer: P, PieChart: P, BarChart: P, LineChart: P, AreaChart: P, ComposedChart: P,
        Pie: () => null, Bar: () => null, Area: () => null, Line: () => null, Cell: () => null,
        Legend: () => null, ReferenceLine: () => null,
        XAxis: () => null, YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null,
    };
});

const config: BudgetConfig = {
    users: [
        { name: 'Marc', grossSalary: 7000, netSalary: 5000, color: '#10b981', age: 35, birthYear: 1991, canadaArrivalYear: 1991, hasOwnedPropertyLast4Years: false } as unknown as User,
        { name: 'Anna', grossSalary: 5500, netSalary: 4000, color: '#3b82f6', age: 33, birthYear: 1993, canadaArrivalYear: 1993, hasOwnedPropertyLast4Years: false } as unknown as User,
    ],
    splitMode: '50/50',
};
const setDiscret = (v: boolean) => act(() => { useFinanceStore.setState({ isPrivacyMode: v } as never); });
const avecCle = () => act(() => { useFinanceStore.setState({ config, apiKeys: { anthropic: 'sk-test', finnhub: '' } } as never); });

afterEach(() => {
    cleanup();
    couple.mockClear(); immo.mockClear(); rebal.mockClear();
    // `isPrivacyMode` est un état de MODULE : sans remise à zéro, un cas contamine le suivant.
    setDiscret(false);
});

describe('[AI-PRIVACY-CONSEILS-NON-GATES] CoupleOptimizationCard', () => {
    it('mode discret : le service n’est JAMAIS appelé et la carte dit pourquoi', () => {
        avecCle(); setDiscret(true);
        render(<CoupleOptimizationCard />);
        fireEvent.click(screen.getByRole('button', { name: /Générer 3 stratégies IA/ }));
        expect(couple).not.toHaveBeenCalled();
        expect(screen.getByText(MESSAGE_IA_MODE_DISCRET)).toBeTruthy();
    });
    it('contrôle — mode normal : le service est appelé une fois', async () => {
        avecCle();
        render(<CoupleOptimizationCard />);
        fireEvent.click(screen.getByRole('button', { name: /Générer 3 stratégies IA/ }));
        await waitFor(() => expect(couple).toHaveBeenCalledTimes(1));
        expect(screen.queryByText(MESSAGE_IA_MODE_DISCRET)).toBeNull();
    });
});

const contexteImmo = {
    price: 450_000, downPayment: 45_000, mortgageRate: 5, amortizationYears: 25, monthlyMortgagePayment: 2_356,
    propertyTaxesAnnual: 3_800, welcomeTax: 5_200, maintenanceAnnual: 4_500, isPrimaryResidence: true, isFirstTimeBuyer: true,
    currentRent: 1_500,
};

describe('[AI-PRIVACY-CONSEILS-NON-GATES] RealEstateAdviceCard', () => {
    it('mode discret : le service n’est JAMAIS appelé et la carte dit pourquoi', () => {
        avecCle(); setDiscret(true);
        render(<RealEstateAdviceCard context={contexteImmo} />);
        fireEvent.click(screen.getByRole('button', { name: /Conseiller le projet/ }));
        expect(immo).not.toHaveBeenCalled();
        expect(screen.getByText(MESSAGE_IA_MODE_DISCRET)).toBeTruthy();
    });
    it('contrôle — mode normal : le service est appelé une fois', async () => {
        avecCle();
        render(<RealEstateAdviceCard context={contexteImmo} />);
        fireEvent.click(screen.getByRole('button', { name: /Conseiller le projet/ }));
        await waitFor(() => expect(immo).toHaveBeenCalledTimes(1));
        expect(screen.queryByText(MESSAGE_IA_MODE_DISCRET)).toBeNull();
    });
});

const proj = {
    years: 30, returnRate: 6, inflationRate: 2, savingsMode: 'manual', manualContribution: 0,
    usePortfolioRate: false, returnRates: { celi: 7, reer: 6.5, nonReg: 6.5, crypto: 10, cash: 3 },
    emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3,
} as unknown as ProjectionConfig;
const assets = [
    { id: 'a1', symbol: 'XEQT', name: 'XEQT', sector: 'Index', region: 'world', accountType: 'CELI', currency: 'CAD', quantity: 10, currentPrice: 100, buyPrice: 90, dateBought: '2025-01-01', priceHistory: [] },
] as unknown as Asset[];
const monterInvestissements = () => {
    render(
        <Investments assets={assets} setAssets={vi.fn()}
            investmentAccounts={[]} setInvestmentAccounts={vi.fn()}
            investmentTransactions={[]} setInvestmentTransactions={vi.fn()}
            apiKey="sk-test" transactions={[]} budgetItems={[]}
            config={config} projection={proj} setProjection={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('radio', { name: /Allocation/i }));
    return screen.getByRole('button', { name: /Pourquoi ces actions/ });
};

describe('[AI-PRIVACY-CONSEILS-NON-GATES] Investments — justifications du rééquilibrage', () => {
    it('mode discret : le service n’est JAMAIS appelé et l’écran dit pourquoi', () => {
        avecCle(); setDiscret(true);
        fireEvent.click(monterInvestissements());
        expect(rebal).not.toHaveBeenCalled();
        expect(screen.getByText(MESSAGE_IA_MODE_DISCRET)).toBeTruthy();
    });
    it('contrôle — mode normal : le service est appelé une fois', async () => {
        avecCle();
        fireEvent.click(monterInvestissements());
        await waitFor(() => expect(rebal).toHaveBeenCalledTimes(1));
        expect(screen.queryByText(MESSAGE_IA_MODE_DISCRET)).toBeNull();
    });
});
