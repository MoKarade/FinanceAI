// [S5-REFONTE-PROJETS] LifeProjects — page « Projets de vie » (maquettes E-projets / M-projets) :
// UN SEUL h1, frise (clavier = changer d'année), liste filtrable, carte d'impact du projet choisi,
// lien commun « Voir l'effet sur ma courbe », état vide avec CTA.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { LifeProjects } from '../../components/LifeProjects';
import { useFinanceStore } from '../../store/useFinanceStore';
import { TAB_LABELS } from '../../constants';
import { Tab } from '../../types';
import type { TravelGoal, LifeEvent } from '../../types';

vi.mock('recharts', async () => {
    const React = await import('react');
    const P = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
    return {
        ResponsiveContainer: P, PieChart: P,
        Pie: () => null, Cell: () => null, Legend: () => null, Tooltip: () => null,
    };
});

const navSpy = vi.fn();

const baseProps = {
    travelGoals: [] as TravelGoal[],
    setTravelGoals: vi.fn(),
    lifeEvents: [] as LifeEvent[],
    setLifeEvents: vi.fn(),
    netWorth: 100_000,
    returnRate: 6,
};

const ITALIE: TravelGoal = { id: 't1', destination: 'Italie', date: '2099-06-14', totalCost: 8500, image: '✈️' };
const RENO = { id: 'e1', name: 'Rénovation cuisine', type: 'RENOVATION', date: '2099-05-01', impactAmount: 25000 } as unknown as LifeEvent;

describe('LifeProjects — maquettes S5 (frise, liste, impact)', () => {
    beforeEach(() => {
        navSpy.mockClear();
        useFinanceStore.setState({ navigateWithFocus: navSpy as never });
    });

    it('un SEUL h1 (titre = TAB_LABELS) ; résumé « N projets · voyages · événements »', () => {
        render(<LifeProjects {...baseProps} travelGoals={[ITALIE]} lifeEvents={[RENO]} />);
        const h1s = screen.getAllByRole('heading', { level: 1 });
        expect(h1s).toHaveLength(1);
        expect(h1s[0].textContent).toBe(TAB_LABELS[Tab.LIFE_PROJECTS]);
        expect(screen.getByText('2 projets · 1 voyage · 1 événement')).toBeTruthy();
        const h2 = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
        expect(h2.some((t) => t?.startsWith('Frise '))).toBe(true);
    });

    it('le lien « Voir l\'effet sur ma courbe » navigue vers Futur', () => {
        render(<LifeProjects {...baseProps} travelGoals={[ITALIE]} />);
        fireEvent.click(screen.getByRole('button', { name: /Voir l'effet sur ma courbe/ }));
        expect(navSpy).toHaveBeenCalledWith(Tab.FUTURE);
    });

    it('sans projet : état vide honnête ; « Nouveau projet » ouvre le formulaire', () => {
        render(<LifeProjects {...baseProps} />);
        expect(screen.getByText('Aucun projet')).toBeTruthy();
        fireEvent.click(screen.getAllByRole('button', { name: 'Nouveau projet' })[0]);
        expect(screen.getByRole('heading', { name: 'Nouveau projet' })).toBeTruthy();
        expect(screen.getByLabelText('Budget total ($)')).toBeTruthy();
    });

    it('la liste suit le filtre, et le projet choisi pilote la carte d\'impact', () => {
        render(<LifeProjects {...baseProps} travelGoals={[ITALIE]} lifeEvents={[RENO]} />);
        const liste = screen.getByRole('region', { name: 'Projets' });
        // Par défaut, le prochain à venir (la rénovation, en mai) est choisi.
        expect(screen.getByRole('heading', { name: 'Impact · Rénovation cuisine' })).toBeTruthy();
        fireEvent.click(within(liste).getByRole('button', { name: /Italie/ }));
        expect(screen.getByRole('heading', { name: 'Impact · Italie' })).toBeTruthy();

        fireEvent.click(within(liste).getByRole('button', { name: 'Voyages' }));
        expect(within(liste).queryByRole('button', { name: /Rénovation cuisine/ })).toBeNull();
        expect(within(liste).getByRole('button', { name: /Italie/ })).toBeTruthy();
    });

    it('frise : ← → au clavier déplace le projet d\'une année (mois et jour conservés)', () => {
        const setTravelGoals = vi.fn();
        render(<LifeProjects {...baseProps} travelGoals={[{ ...ITALIE, date: '2030-06-14' }]} setTravelGoals={setTravelGoals} />);
        const frise = screen.getByRole('region', { name: /Frise/ });
        fireEvent.keyDown(within(frise).getByRole('button', { name: /Italie/ }), { key: 'ArrowRight' });
        expect(setTravelGoals).toHaveBeenCalledWith([expect.objectContaining({ id: 't1', date: '2031-06-14' })]);
    });
});
