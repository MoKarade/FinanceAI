// tests/components/Retirement.tooltipNoFakeZero.test.tsx
//
// [FORMATCAD-OR-ZERO] (lot 183) — l'infobulle de la courbe Retraite affichait `formatCAD(data.X || 0)` :
// un compte ABSENT du point (champ jamais publié, ou non fini) devenait « 0 $ » — un solde crédible
// à la place d'un « — » honnête (no-fake-data). Garde COMPORTEMENTALE sur ce que l'infobulle REND :
// la garde de source du même lot (formatMonetaireSourceUnique) ne prouve que la forme du code.
// Le faux `Tooltip` Recharts rend le `content` avec un point où CELI est absent et NonReg non fini.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Retirement } from '../../components/Retirement';
import { useFinanceStore } from '../../store/useFinanceStore';
import type { RetirementGoal, ProjectionConfig, BudgetConfig, User } from '../../types';

const POINT_TROUE = { monthIndex: 360, age: 65, RetirementAge: 65, NetWorth: 900_000, REER: 400_000, NonReg: 100_000, Liquidites: Number.NaN, Income: 6_000, Expenses: 5_000 };

vi.mock('recharts', async () => {
    const React = await import('react');
    const P = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
    return {
        ResponsiveContainer: P, BarChart: P, ComposedChart: P, PieChart: P, LineChart: P, AreaChart: P,
        Bar: () => null, Area: () => null, Line: () => null, Pie: () => null, Cell: () => null,
        Legend: () => null, ReferenceLine: () => null,
        XAxis: () => null, YAxis: () => null, CartesianGrid: () => null,
        // Le faux Tooltip rend le contenu personnalisé avec un point TROUÉ (CELI absent, Liquidites NaN).
        // (Non-Enreg. et CELIAPP sont des tuiles CONDITIONNELLES `> 0` : un trou les cache, il ne les met pas à 0.)
        Tooltip: ({ content }: { content?: React.ReactElement }) => content
            ? React.cloneElement(content, { active: true, payload: [{ payload: { monthIndex: 360, age: 65, RetirementAge: 65, NetWorth: 900_000, REER: 400_000, NonReg: 100_000, Liquidites: Number.NaN, Income: 6_000, Expenses: 5_000 } }], label: 65 })
            : null,
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
const chartData = [
    { monthIndex: 0, age: 35, NetWorth: 200_000, CELI: 50_000, REER: 100_000, NonReg: 20_000, Liquidites: 30_000, CELIAPP: 0, Income: 0, Expenses: 0 },
    POINT_TROUE,
    { monthIndex: 600, age: 85, NetWorth: 400_000, CELI: 150_000, REER: 150_000, NonReg: 50_000, Liquidites: 50_000, CELIAPP: 0, Income: 5_500, Expenses: 5_200 },
];

/** Montant rendu sous une étiquette de l'infobulle (le `<div>` qui suit l'étiquette). */
const montantSous = (etiquette: string): string => {
    const label = screen.getAllByText(etiquette).find((el) => el.className.includes('font-bold mb-1'));
    expect(label, `étiquette « ${etiquette} » introuvable dans l'infobulle`).toBeTruthy();
    return label!.nextElementSibling?.textContent ?? '';
};

describe('[FORMATCAD-OR-ZERO] infobulle Retraite — un compte absent ou non fini rend « — », jamais « 0 $ »', () => {
    beforeEach(() => {
        useFinanceStore.setState({ lastProjection: { chartData } as never, isPrivacyMode: false, navigateWithFocus: vi.fn() as never });
    });

    it('CELI absent du point → « — » ; Liquidites NaN → « — » ; REER présent → montant réel (contrôle)', () => {
        render(<Retirement goal={goal} currentREER={100000} currentCELI={50000} currentNonReg={20000}
            calculatedMonthlySavings={1000} projection={proj} config={config} />);
        // `PrivateAmount` accompagne le « — » d'un texte pour lecteur d'écran (« Pas de donnée ») :
        // on asserte le FAIT (un tiret, aucun montant), pas la forme exacte du nœud.
        for (const etiquette of ['CELI', 'Liquidites']) {
            const rendu = montantSous(etiquette);
            expect(rendu, etiquette).toMatch(/^—/);
            expect(rendu, etiquette).not.toMatch(/\d/);
        }
        // Contrôle : le formateur voit toujours une VRAIE valeur — la garde n'a pas rendu l'infobulle muette.
        expect(montantSous('REER')).toMatch(/400/);
        expect(montantSous('REER')).not.toBe('—');
    });
});
