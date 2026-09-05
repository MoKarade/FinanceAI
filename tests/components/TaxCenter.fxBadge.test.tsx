// tests/components/TaxCenter.fxBadge.test.tsx
//
// [FX-BADGE-SURFACES-RESTANTES] La carte « Revenus & Déductions » du Centre fiscal convertit les
// avoirs étrangers avec `fxRates` (via `estimateTaxableInvestmentIncome` / `assetValueCad`) : un taux de
// change ESTIMÉ (repli en dur) doit y être signalé comme sur Patrimoine, Investissements, le PDF et le
// bandeau Futur — « un signal posé pour UNE surface ne protège que celle-là ». Contrôles : aucun avoir
// étranger, ou taux réel → pas de badge (aucun bruit hors-sujet).

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TaxCenter } from '../../components/TaxCenter';
import { useFinanceStore } from '../../store/useFinanceStore';
import type { Asset, BudgetConfig, User } from '../../types';

vi.mock('recharts', async () => {
    const React = await import('react');
    const P = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
    return {
        ResponsiveContainer: P, BarChart: P, ComposedChart: P, PieChart: P, LineChart: P,
        Bar: () => null, Area: () => null, Line: () => null, Pie: () => null, Cell: () => null,
        Legend: () => null, ReferenceLine: () => null,
        XAxis: () => null, YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null,
    };
});

afterEach(cleanup);

const marc = { name: 'Marc', grossSalary: 5000, netSalary: 3800, color: '#10b981', age: 35, birthYear: 1991, canadaArrivalYear: 1991, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 } as unknown as User;
const solo: BudgetConfig = { users: [marc] as unknown as BudgetConfig['users'], splitMode: '50/50' };

const nonReg = (currency: string): Asset => ({
    symbol: 'ZZZ', name: 'NonReg', quantity: 100, currentPrice: 500, buyPrice: 400, currency,
    accountType: 'NON-ENREG',
} as Asset);

const BADGE = 'Taux de change estimés';

/** Le badge lit le store ; TaxCenter reçoit `assets` en prop — en prod les deux sont le même store. */
const monte = (assets: Asset[], fx: { lastFetched: number; estimated?: boolean }) => {
    useFinanceStore.setState({
        fxRates: { USD: 1.40, EUR: 1.47, CAD: 1, lastFetched: fx.lastFetched },
        fxRatesEstimated: fx.estimated,
        assets,
    });
    render(<TaxCenter config={solo} assets={assets} />);
};

describe('[FX-BADGE-SURFACES-RESTANTES] TaxCenter — le taux de change estimé est signalé sur la surface fiscale', () => {
    it('avoir NON-ENREG en USD + taux estimé (repli) → badge dans la carte « Revenus & Déductions »', () => {
        monte([nonReg('USD')], { lastFetched: 0 });
        // La carte doit exister (sinon le badge serait absent pour une AUTRE raison — anti-vacuité).
        expect(screen.getByText('Invest. Non-Enregistrés')).toBeInTheDocument();
        expect(screen.getByText(BADGE)).toBeInTheDocument();
    });

    it('contrôle : avoir en CAD seulement → carte présente, AUCUN badge (rien à convertir)', () => {
        monte([nonReg('CAD')], { lastFetched: 0 });
        expect(screen.getByText('Invest. Non-Enregistrés')).toBeInTheDocument();
        expect(screen.queryByText(BADGE)).toBeNull();
    });

    it('contrôle : avoir en USD mais taux RÉEL (lastFetched > 0, pas de repli) → aucun badge', () => {
        monte([nonReg('USD')], { lastFetched: 1_700_000_000, estimated: false });
        expect(screen.getByText('Invest. Non-Enregistrés')).toBeInTheDocument();
        expect(screen.queryByText(BADGE)).toBeNull();
    });
});
