// [REFONTE-NAV-L3] La page « Projets immo » (Vie) ne montre QUE les projets d'achat FUTURS —
// les biens détenus vivent dans Configurations → Immobilier. Test discriminant : sur l'ancienne
// page unique, les deux noms se rendaient côte à côte.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RealEstateProjects } from '../../../components/life/RealEstateProjects';
import { RealEstate } from '../../../components/RealEstate';
import { useFinanceStore } from '../../../store/useFinanceStore';
import { TAB_LABELS } from '../../../constants';
import { Tab } from '../../../types';
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

// [REFONTE-NAV-L4] « Projets immo » est la 4e page de la destination Vie — elle doit parler la
// MÊME langue que Retraite / Enfant / Projets de vie : titre issu de TAB_LABELS, idiome de
// sous-titre « déforme ta courbe Future », et l'affordance commune <VieCurveLink>.
const navSpy = vi.fn();

describe('RealEstateProjects — harmonisation famille Vie (REFONTE-NAV-L4)', () => {
    beforeEach(() => {
        navSpy.mockClear();
        useFinanceStore.setState({ navigateWithFocus: navSpy as never });
    });

    it('avec projets : titre = TAB_LABELS + idiome « déforme ta courbe Future »', () => {
        render(<RealEstateProjects availableCash={50_000} goals={[owned, project]} setGoals={vi.fn()} />);
        expect(screen.getByRole('heading', { level: 1, name: TAB_LABELS[Tab.REAL_ESTATE_PROJECTS] })).toBeInTheDocument();
        expect(screen.getByText(/déforme ta courbe Future/)).toBeInTheDocument();
    });

    it('vue vide : le MÊME header harmonisé (titre + idiome + lien courbe)', () => {
        render(<RealEstateProjects availableCash={50_000} goals={[owned]} setGoals={vi.fn()} />);
        expect(screen.getByRole('heading', { level: 1, name: TAB_LABELS[Tab.REAL_ESTATE_PROJECTS] })).toBeInTheDocument();
        expect(screen.getByText(/déforme ta courbe Future/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Voir l'effet sur ma courbe/ })).toBeInTheDocument();
    });

    it('le lien « Voir l\'effet sur ma courbe » navigue vers Futur', () => {
        render(<RealEstateProjects availableCash={50_000} goals={[owned, project]} setGoals={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /Voir l'effet sur ma courbe/ }));
        expect(navSpy).toHaveBeenCalledWith(Tab.FUTURE);
    });

    it('la page Immobilier (Configurations) n\'est PAS une page Vie : ni idiome, ni lien courbe', () => {
        render(<RealEstate availableCash={50_000} goals={[owned, project]} setGoals={vi.fn()} />);
        expect(screen.getByRole('heading', { level: 1, name: TAB_LABELS[Tab.REAL_ESTATE] })).toBeInTheDocument();
        expect(screen.queryByText(/déforme ta courbe Future/)).toBeNull();
        expect(screen.queryByRole('button', { name: /Voir l'effet sur ma courbe/ })).toBeNull();
    });
});
