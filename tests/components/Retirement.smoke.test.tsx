// CA-04 — smoke test : Retirement (money-critical, aucun test direct jusqu'ici).
// Sans projection calculée → <ProjectionRequired> (pas de crash).
// [REFONTE-NAV-L4] étendu : header harmonisé (titre = TAB_LABELS), sous-onglets
// Projection/Outils, lien commun « Voir l'effet sur ma courbe ».
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Retirement } from '../../components/Retirement';
import { useFinanceStore } from '../../store/useFinanceStore';
import { TAB_LABELS } from '../../constants';
import { Tab } from '../../types';
import type { RetirementGoal, ProjectionConfig, BudgetConfig, User } from '../../types';

vi.mock('recharts', async () => {
    const React = await import('react');
    const P = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
    return {
        ResponsiveContainer: P, BarChart: P, ComposedChart: P, PieChart: P, LineChart: P, AreaChart: P,
        Bar: () => null, Area: () => null, Line: () => null, Pie: () => null, Cell: () => null,
        Legend: () => null, ReferenceLine: () => null,
        XAxis: () => null, YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null,
    };
});

const goal = { targetAge: 65, targetMonthlyIncome: 5000, governmentPension: 1500 } as unknown as RetirementGoal;
const proj = {
    years: 30, returnRate: 6, inflationRate: 2, savingsMode: 'manual', manualContribution: 0,
    usePortfolioRate: false, returnRates: { celi: 7, reer: 6.5, nonReg: 6.5, crypto: 10, cash: 3 },
    emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3,
} as unknown as ProjectionConfig;
const config: BudgetConfig = {
    users: [
        { name: 'Marc', grossSalary: 7000, netSalary: 5000, color: '#10b981', age: 35, birthYear: 1991, canadaArrivalYear: 1991, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 } as unknown as User,
        { name: 'Anna', grossSalary: 5500, netSalary: 4000, color: '#3b82f6', age: 33, birthYear: 1993, canadaArrivalYear: 1993, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 } as unknown as User,
    ],
    splitMode: '50/50',
};

const renderPage = () => render(
    <Retirement goal={goal} currentREER={100000} currentCELI={50000} currentNonReg={20000}
        calculatedMonthlySavings={1000} projection={proj} config={config} />,
);

// Points annuels minimaux (monthIndex % 12 === 0) couvrant avant/après l'âge cible.
const chartData = [
    { monthIndex: 0, age: 35, NetWorth: 200_000, CELI: 50_000, REER: 100_000, NonReg: 20_000, Liquidites: 30_000, CELIAPP: 0, Income: 0, Expenses: 0 },
    { monthIndex: 360, age: 65, NetWorth: 900_000, CELI: 300_000, REER: 400_000, NonReg: 100_000, Liquidites: 100_000, CELIAPP: 0, Income: 6_000, Expenses: 5_000 },
    { monthIndex: 600, age: 85, NetWorth: 400_000, CELI: 150_000, REER: 150_000, NonReg: 50_000, Liquidites: 50_000, CELIAPP: 0, Income: 5_500, Expenses: 5_200 },
];

const navSpy = vi.fn();

describe('Retirement — smoke (CA-04) + header/sous-onglets (REFONTE-NAV-L4)', () => {
    beforeEach(() => {
        navSpy.mockClear();
        useFinanceStore.setState({ lastProjection: null, navigateWithFocus: navSpy as never });
    });

    it('rend sans crash (sans projection → ProjectionRequired, header harmonisé présent)', () => {
        const { container } = renderPage();
        expect(container).toBeTruthy();
        // Titre = TAB_LABELS (source unique des libellés d'onglets).
        expect(screen.getByRole('heading', { level: 1, name: TAB_LABELS[Tab.RETIREMENT] })).toBeTruthy();
        // Empty state honnête (no-fake-data) : la simulation exige la projection.
        expect(screen.getByRole('status')).toBeTruthy();
    });

    it('avec projection : sous-onglets Projection/Outils, la Projection est affichée par défaut', () => {
        useFinanceStore.setState({ lastProjection: { chartData } as never });
        renderPage();
        const tabs = screen.getAllByRole('tab');
        expect(tabs.map(t => t.textContent)).toEqual(['Projection', "Outils d'optimisation"]);
        // Défaut = Projection : graphes visibles, outils absents.
        expect(screen.getByText('Accumulation & épuisement')).toBeTruthy();
        expect(screen.queryByText(/Projection inverse|Goal/i)).toBeFalsy();
    });

    it("avec projection : le sous-onglet Outils affiche les optimiseurs et masque les graphes", () => {
        useFinanceStore.setState({ lastProjection: { chartData } as never });
        renderPage();
        fireEvent.click(screen.getByRole('tab', { name: /Outils d'optimisation/ }));
        expect(screen.queryByText('Accumulation & épuisement')).toBeFalsy();
        // Les outils rendus (titres de leurs Cards).
        expect(screen.getByText('Projection inverse (Goal seeker)')).toBeTruthy();
        expect(screen.getByText('Asset Location Optimizer')).toBeTruthy();
    });

    it('le lien « Voir l\'effet sur ma courbe » navigue vers Futur (navigateWithFocus)', () => {
        useFinanceStore.setState({ lastProjection: { chartData } as never });
        renderPage();
        fireEvent.click(screen.getByRole('button', { name: /Voir l'effet sur ma courbe/ }));
        expect(navSpy).toHaveBeenCalledWith(Tab.FUTURE);
    });
});
