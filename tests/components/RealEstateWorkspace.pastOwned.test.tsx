// [ENG-PAST-OWNED-VS-PLANNED] (A6) — le SEUL chemin d'écriture humain de `isOwned` est cette UI
// (popup + checkbox) : un bouton inversé ou une condition cassée passait la suite verte alors que
// la valeur alimente les gates money-critical du moteur (revue #684, code-reviewer ÉLEVÉ-2).
// On teste l'ÉTAT ÉCRIT (lastWrite via setGoals), jamais une reconstruction du calcul.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RealEstate } from '../../components/RealEstate';
import { RealEstateProjects } from '../../components/life/RealEstateProjects';
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

// Dates très éloignées de part et d'autre d'aujourd'hui (patron du fichier split) : vrai des années.
const pending = goal({ id: 'p1', name: 'Duplex Legacy 2019', purchaseDate: '2019-06-01' });
const pending2 = goal({ id: 'p2', name: 'Triplex Legacy 2018', purchaseDate: '2018-03-01' });
const notYet = goal({ id: 'ny', name: 'Condo Pas Encore', purchaseDate: '2019-06-01', isOwned: false });
const project = goal({ id: 'proj', name: 'Chalet Projet 2099', purchaseDate: '2099-06-01', isPrimaryResidence: false });

const newSetGoals = () => vi.fn<(g: RealEstateGoal[]) => void>();
type SetGoalsMock = ReturnType<typeof newSetGoals>;
const lastWrite = (setGoals: SetGoalsMock): RealEstateGoal[] =>
    setGoals.mock.calls[setGoals.mock.calls.length - 1][0];

describe('popup « est-ce acheté ? » — apparition et les TROIS issues', () => {
    it("s'affiche à l'ouverture pour un bien ACTIF à date passée non tranché, et le NOMME", () => {
        render(<RealEstate availableCash={50_000} goals={[pending, project]} setGoals={newSetGoals()} />);
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getAllByText(/Duplex Legacy 2019/).length).toBeGreaterThan(0);
    });

    it('« Oui, acheté » écrit isOwned: true — via la liste COMPLÈTE (l\'autre moitié survit)', () => {
        const setGoals = newSetGoals();
        render(<RealEstate availableCash={50_000} goals={[pending, project]} setGoals={setGoals} />);
        fireEvent.click(screen.getByRole('button', { name: 'Oui, acheté' }));
        const written = lastWrite(setGoals);
        expect(written.find(g => g.id === 'p1')?.isOwned).toBe(true);
        expect(written.map(g => g.id).sort()).toEqual(['p1', 'proj']);
        expect(written.find(g => g.id === 'proj')?.isOwned).toBeUndefined();
    });

    it('« Pas encore » écrit isOwned: false', () => {
        const setGoals = newSetGoals();
        render(<RealEstate availableCash={50_000} goals={[pending, project]} setGoals={setGoals} />);
        fireEvent.click(screen.getByRole('button', { name: 'Pas encore' }));
        expect(lastWrite(setGoals).find(g => g.id === 'p1')?.isOwned).toBe(false);
    });

    it("fermer n'écrit RIEN, saute CE bien seulement — le suivant en attente est questionné", () => {
        // Revue #684 (silent-failure MOYEN-1) : le rejet était un booléen GLOBAL — une fermeture
        // accidentelle avalait la question pour des biens jamais montrés. Désormais un Set par id.
        const setGoals = newSetGoals();
        render(<RealEstate availableCash={50_000} goals={[pending, pending2]} setGoals={setGoals} />);
        expect(screen.getAllByText(/Duplex Legacy 2019/).length).toBeGreaterThan(0);
        fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
        expect(setGoals).not.toHaveBeenCalled();
        // Le 2e bien en attente prend la place (dans le MÊME dialogue re-rendu).
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getAllByText(/Triplex Legacy 2018/).length).toBeGreaterThan(0);
        fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
        expect(setGoals).not.toHaveBeenCalled();
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('AUCUNE question : champ déjà tranché, bien inactif, ou date future', () => {
        const answered = goal({ id: 'a', name: 'Répondu', isOwned: true });
        const inactive = goal({ id: 'i', name: 'Inactif', isActive: false });
        render(<RealEstate availableCash={50_000} goals={[answered, inactive]} setGoals={newSetGoals()} />);
        expect(screen.queryByRole('dialog')).toBeNull();
        render(<RealEstateProjects availableCash={50_000} goals={[project]} setGoals={newSetGoals()} />);
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});

describe('badge « Date passée — non acheté » et checkbox — le cycle de correction', () => {
    it('un bien « Pas encore » QUITTE la page Immobilier et vit sur Projets, badge visible', () => {
        // Revue #684 (5e registre) : `isOwnedToday` ignorait `isOwned` — le bien restait affiché
        // dans « ce que je POSSÈDE » après que l'utilisateur a déclaré ne PAS le posséder.
        const { unmount } = render(
            <RealEstate availableCash={50_000} goals={[notYet, project]} setGoals={newSetGoals()} />);
        expect(screen.queryByText(/Condo Pas Encore/)).toBeNull();
        unmount();
        render(<RealEstateProjects availableCash={50_000} goals={[notYet, project]} setGoals={newSetGoals()} />);
        expect(screen.getAllByText(/Condo Pas Encore/).length).toBeGreaterThan(0);
        expect(screen.getByText('Date passée — non acheté')).toBeInTheDocument();
    });

    it('le badge TOMBE quand la date repart au futur (le « Pas encore » devient caduc)', () => {
        // Revue #684 (silent-failure MOYEN-3) : sans condition de date, le badge d'avertissement
        // restait affiché à JAMAIS après correction de la date — sans aucun contrôle pour l'effacer.
        const notYetFuture = goal({ id: 'nyf', name: 'Reporté 2099', purchaseDate: '2099-06-01', isOwned: false });
        render(<RealEstateProjects availableCash={50_000} goals={[notYetFuture]} setGoals={newSetGoals()} />);
        expect(screen.getAllByText(/Reporté 2099/).length).toBeGreaterThan(0);
        expect(screen.queryByText('Date passée — non acheté')).toBeNull();
    });

    it("checkbox « Bien déjà acheté » : décochée pour un « Pas encore », la cocher écrit isOwned: true", () => {
        const setGoals = newSetGoals();
        render(<RealEstateProjects availableCash={50_000} goals={[notYet]} setGoals={setGoals} />);
        const box = screen.getByRole('checkbox', { name: /Bien déjà acheté/ });
        expect(box).not.toBeChecked();
        fireEvent.click(box);
        expect(lastWrite(setGoals).find(g => g.id === 'ny')?.isOwned).toBe(true);
    });

    it('checkbox ABSENTE pour une date future (le moteur achètera normalement, rien à déclarer)', () => {
        render(<RealEstateProjects availableCash={50_000} goals={[project]} setGoals={newSetGoals()} />);
        expect(screen.queryByRole('checkbox', { name: /Bien déjà acheté/ })).toBeNull();
    });
});
