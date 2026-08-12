// [REFONTE-NAV-L3] La page « Projets immo » (Vie) ne montre QUE les projets d'achat FUTURS —
// les biens détenus vivent dans Configurations → Immobilier. Test discriminant : sur l'ancienne
// page unique, les deux noms se rendaient côte à côte.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RealEstateProjects } from '../../../components/life/RealEstateProjects';
import type { RealEstateGoal } from '../../../types';

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

describe('RealEstateProjects — vue Vie (projets FUTURS seulement)', () => {
    it('rend les projets futurs et EXCLUT les biens détenus', () => {
        render(<RealEstateProjects availableCash={50_000} goals={[owned, project]} setGoals={vi.fn()} />);
        expect(screen.getAllByText(/Chalet Projet 2099/).length).toBeGreaterThan(0);
        expect(screen.queryByText(/Maison Détenue 2019/)).toBeNull();
    });

    it('sans projet futur : état vide honnête (pas d\'éditeur sur un goal placeholder)', () => {
        render(<RealEstateProjects availableCash={50_000} goals={[owned]} setGoals={vi.fn()} />);
        expect(screen.getByText(/Aucun projet d'achat futur/)).toBeInTheDocument();
        // Le bien détenu n'est pas rendu ici, mais le lien croisé vers Config le signale.
        expect(screen.queryByText(/Maison Détenue 2019/)).toBeNull();
        expect(screen.getByText(/1 bien détenu → Configurations · Immobilier/)).toBeInTheDocument();
    });
});
