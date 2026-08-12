// CA-04 — smoke test : RealEstate (money-critical, aucun test direct jusqu'ici).
// [REFONTE-NAV-L3] + test discriminant du split : la page Immobilier (Config) ne montre
// QUE les biens ACTUELS — sur l'ancienne page unique, un projet futur se rendait aussi.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RealEstate } from '../../components/RealEstate';
import type { RealEstateGoal } from '../../types';

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

const goal = (overrides: Partial<RealEstateGoal>): RealEstateGoal => ({
    id: 'g',
    isActive: true,
    purchaseDate: '2020-06-01',
    price: 400_000,
    downPayment: 80_000,
    mortgageRate: 4,
    amortization: 25,
    totalClosingCosts: 0,
    monthlyPayment: 0,
    unrecoverableMonthly: 0,
    isPrimaryResidence: true,
    ...overrides,
});

// Dates fixes très éloignées de part et d'autre d'aujourd'hui : le test reste vrai des années.
const owned = goal({ id: 'owned', name: 'Maison Détenue 2019', purchaseDate: '2019-06-01' });
const project = goal({ id: 'proj', name: 'Chalet Projet 2099', purchaseDate: '2099-06-01', isPrimaryResidence: false });

describe('RealEstate — smoke (CA-04)', () => {
    it('rend sans crash sans objectif immobilier', () => {
        const { container } = render(<RealEstate availableCash={50000} goals={[]} setGoals={vi.fn()} />);
        expect(container).toBeTruthy();
    });
});

describe('RealEstate — vue Config (biens ACTUELS seulement, [REFONTE-NAV-L3])', () => {
    it('rend les biens détenus et EXCLUT les projets futurs', () => {
        render(<RealEstate availableCash={50_000} goals={[owned, project]} setGoals={vi.fn()} />);
        expect(screen.getAllByText(/Maison Détenue 2019/).length).toBeGreaterThan(0);
        expect(screen.queryByText(/Chalet Projet 2099/)).toBeNull();
        // Le lien croisé signale où vit l'autre moitié de la tranche.
        expect(screen.getByText(/1 projet d'achat futur → Vie · Projets immo/)).toBeInTheDocument();
    });

    it('sans bien détenu : état vide honnête (aucun éditeur sur un goal placeholder)', () => {
        render(<RealEstate availableCash={50_000} goals={[project]} setGoals={vi.fn()} />);
        expect(screen.getByText(/Tu ne possèdes aucun bien immobilier/)).toBeInTheDocument();
        expect(screen.queryByText(/Chalet Projet 2099/)).toBeNull();
    });
});
