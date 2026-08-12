// [REFONTE-NAV-L3] Atelier immobilier PARTAGÉ — invariants du split, verrouillés côté INTERACTION.
//
// Trois classes de bugs mesurées par le panel, dont aucune n'était couverte :
//  1. le SEED de `addNewGoal('actuel')` atterrissait dans l'angle mort de sa propre
//     classification (mois courant : l'UI le disait détenu, le moteur ne l'achetait jamais) ;
//  2. le sous-titre agrégeait `presentEquityOfGoal` sur des biens INACTIFS (qui rendent 0)
//     → « 1 bien détenu · Équité présente 0 $ » sur une maison payée (sous-déclaration muette) ;
//  3. l'invariant documenté « toute écriture repasse par la liste COMPLÈTE » n'avait aucun test :
//     un add/edit/delete depuis une vue ne doit JAMAIS perdre l'autre moitié de la tranche.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RealEstate } from '../../components/RealEstate';
import { RealEstateProjects } from '../../components/life/RealEstateProjects';
import { isOwnedToday } from '../../services/realEstatePartition';
import { monthsSince } from '../../services/projection/pastPurchaseInit';
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

// Dates volontairement TRÈS éloignées de part et d'autre d'aujourd'hui : les tests restent
// vrais des années, et aucun n'atterrit près de la frontière (elle a ses propres tests).
const owned = goal({ id: 'owned', name: 'Maison Détenue 2019', purchaseDate: '2019-06-01' });
const project = goal({ id: 'proj', name: 'Chalet Projet 2099', purchaseDate: '2099-06-01', isPrimaryResidence: false });

const newSetGoals = () => vi.fn<(g: RealEstateGoal[]) => void>();
type SetGoalsMock = ReturnType<typeof newSetGoals>;

/** Dernier appel à setGoals (la liste COMPLÈTE écrite dans le store). */
const lastWrite = (setGoals: SetGoalsMock): RealEstateGoal[] =>
    setGoals.mock.calls[setGoals.mock.calls.length - 1][0];

describe("addNewGoal — le SEED atterrit dans la zone où sa classification est VRAIE", () => {
    it("variant « actuel » : le bien créé satisfait isOwnedToday ET la condition du MOTEUR (offset < 0)", () => {
        const setGoals = newSetGoals();
        render(<RealEstate availableCash={50_000} goals={[owned, project]} setGoals={setGoals} />);

        fireEvent.click(screen.getByText('+ Ajouter un bien'));

        const written = lastWrite(setGoals);
        const created = written.find(g => g.id !== 'owned' && g.id !== 'proj');
        expect(created).toBeDefined();

        // (1) la vue le garde : sinon il « disparaît » vers l'autre page dès le rendu suivant.
        expect(isOwnedToday(created!)).toBe(true);

        // (2) et le MOTEUR l'achète : `projection.ts:182` exige `getMonthOffset(purchaseDate) < 0`.
        // `getMonthOffset === -monthsSince` (mêmes champs YYYY-MM, origine = mois courant, cf.
        // `useSimulationParams`) — on interroge la fonction RÉELLE du moteur, pas une copie.
        const offsetMoteur = -monthsSince(created!.purchaseDate);
        expect(offsetMoteur).toBeLessThan(0);
        // Le mois COURANT (offset 0) était exactement le seed d'avant : l'angle mort.
        expect(offsetMoteur).not.toBe(0);
    });

    it("variant « projet » : le projet créé reste FUTUR (offset > 0, le moteur a un achat à faire)", () => {
        const setGoals = newSetGoals();
        render(<RealEstateProjects availableCash={50_000} goals={[owned, project]} setGoals={setGoals} />);

        fireEvent.click(screen.getByText('+ Ajouter un projet'));

        const created = lastWrite(setGoals).find(g => g.id !== 'owned' && g.id !== 'proj');
        expect(created).toBeDefined();
        expect(isOwnedToday(created!)).toBe(false);
        expect(-monthsSince(created!.purchaseDate)).toBeGreaterThan(0);
    });
});

describe('Sous-titre « Équité présente » — no-fake-data sur les biens inactifs', () => {
    it("tous les biens visibles inactifs → « — » honnête, jamais un 0 $ crédible", () => {
        render(
            <RealEstate
                availableCash={50_000}
                goals={[goal({ id: 'paid', name: 'Maison Payée', purchaseDate: '2005-01-01', isActive: false })]}
                setGoals={vi.fn()}
            />,
        );
        expect(screen.getByText(/Équité présente — \(aucun bien actif dans la simulation\)/)).toBeInTheDocument();
        expect(screen.queryByText(/Équité présente 0/)).toBeNull();
    });

    it("mélange actif/inactif → le dénominateur RÉEL de la somme est annoncé", () => {
        render(
            <RealEstate
                availableCash={50_000}
                goals={[owned, goal({ id: 'paid', name: 'Maison Payée', purchaseDate: '2005-01-01', isActive: false })]}
                setGoals={vi.fn()}
            />,
        );
        expect(screen.getByText(/Équité présente .* \(1 bien actif sur 2\)/)).toBeInTheDocument();
    });

    it("tous actifs → pas de mention parasite du dénominateur", () => {
        render(<RealEstate availableCash={50_000} goals={[owned, project]} setGoals={vi.fn()} />);
        expect(screen.getByText(/1 bien détenu · Équité présente/)).toBeInTheDocument();
        expect(screen.queryByText(/bien actif sur/)).toBeNull();
    });

    it("KPI d'un bien INACTIF → « — » (presentEquityOfGoal rend 0 pour un inactif)", () => {
        render(
            <RealEstate
                availableCash={50_000}
                goals={[goal({ id: 'paid', name: 'Maison Payée', purchaseDate: '2005-01-01', isActive: false })]}
                setGoals={vi.fn()}
            />,
        );
        expect(screen.getByText('Bien inactif — exclu du patrimoine')).toBeInTheDocument();
        expect(screen.getByText('—')).toBeInTheDocument();
    });
});

/**
 * Invariant documenté en tête de `RealEstateWorkspace` : la vue ne reçoit qu'un SOUS-ENSEMBLE
 * (`visibleGoals`) mais toute écriture repasse par la liste COMPLÈTE (`allGoals`). Sans ces
 * tests, une seule écriture bâtie sur `visibleGoals` supprimerait silencieusement l'autre moitié
 * de la tranche `realEstateGoals` — donc des biens réels du patrimoine.
 */
describe('Écritures — toujours sur la liste COMPLÈTE (l\'autre vue jamais perdue)', () => {
    const cas = [
        { nom: 'actuel', render: (setGoals: SetGoalsMock) =>
            render(<RealEstate availableCash={50_000} goals={[owned, project]} setGoals={setGoals} />),
          ajoute: '+ Ajouter un bien', edite: 'owned', autre: 'proj', supprime: 'Supprimer Maison Détenue 2019' },
        { nom: 'projet', render: (setGoals: SetGoalsMock) =>
            render(<RealEstateProjects availableCash={50_000} goals={[owned, project]} setGoals={setGoals} />),
          ajoute: '+ Ajouter un projet', edite: 'proj', autre: 'owned', supprime: 'Supprimer Chalet Projet 2099' },
    ];

    for (const c of cas) {
        describe(`variant « ${c.nom} »`, () => {
            it('AJOUT : la liste écrite contient encore le goal de l\'autre vue, intact', () => {
                const setGoals = newSetGoals();
                c.render(setGoals);
                fireEvent.click(screen.getByText(c.ajoute));

                const written = lastWrite(setGoals);
                expect(written).toHaveLength(3);
                expect(written.map(g => g.id)).toContain(c.autre);
                expect(written.find(g => g.id === c.autre)).toEqual(c.autre === 'proj' ? project : owned);
            });

            it('ÉDITION : renommer le bien visible n\'altère pas le goal de l\'autre vue', () => {
                const setGoals = newSetGoals();
                c.render(setGoals);
                fireEvent.change(screen.getByLabelText('Nom de la propriété'), { target: { value: 'Renommé' } });

                const written = lastWrite(setGoals);
                expect(written).toHaveLength(2);
                expect(written.find(g => g.id === c.edite)?.name).toBe('Renommé');
                expect(written.find(g => g.id === c.autre)).toEqual(c.autre === 'proj' ? project : owned);
            });

            it('SUPPRESSION : seul le goal visé disparaît, l\'autre vue survit', () => {
                const setGoals = newSetGoals();
                c.render(setGoals);
                fireEvent.click(screen.getByLabelText(c.supprime));
                fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));

                const written = lastWrite(setGoals);
                expect(written.map(g => g.id)).toEqual([c.autre]);
                expect(written[0]).toEqual(c.autre === 'proj' ? project : owned);
            });
        });
    }
});
