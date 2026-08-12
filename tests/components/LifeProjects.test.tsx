// [REFONTE-NAV-L4] LifeProjects — page « Projets de vie » de la famille Vie :
// UN SEUL h1 (les ex-PageHeaders de Travel/LifeEvents sont rétrogradés en h2 de
// section), lien commun « Voir l'effet sur ma courbe », filtre Pill, empty states
// avec CTA.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

describe('LifeProjects — harmonisation Vie (REFONTE-NAV-L4)', () => {
    beforeEach(() => {
        navSpy.mockClear();
        useFinanceStore.setState({ navigateWithFocus: navSpy as never });
    });

    it('un SEUL h1 (titre = TAB_LABELS) ; Voyages et Événements sont des h2 de section', () => {
        render(<LifeProjects {...baseProps} />);
        const h1s = screen.getAllByRole('heading', { level: 1 });
        expect(h1s).toHaveLength(1);
        expect(h1s[0].textContent).toBe(TAB_LABELS[Tab.LIFE_PROJECTS]);
        const h2Texts = screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent);
        expect(h2Texts).toContain('Voyages');
        expect(h2Texts).toContain('Événements de vie');
    });

    it('le lien « Voir l\'effet sur ma courbe » navigue vers Futur', () => {
        render(<LifeProjects {...baseProps} />);
        fireEvent.click(screen.getByRole('button', { name: /Voir l'effet sur ma courbe/ }));
        expect(navSpy).toHaveBeenCalledWith(Tab.FUTURE);
    });

    it('sans projet : empty states honnêtes avec CTA (voyage + événement)', () => {
        render(<LifeProjects {...baseProps} />);
        expect(screen.getByText('Aucun voyage prévu')).toBeTruthy();
        expect(screen.getByText('Aucun événement')).toBeTruthy();
        // Le CTA de l'empty state (2e bouton, après celui du header de section)
        // ouvre le formulaire d'ajout de voyage.
        const addButtons = screen.getAllByRole('button', { name: '+ Nouveau Voyage' });
        expect(addButtons).toHaveLength(2);
        fireEvent.click(addButtons[1]);
        expect(screen.getByText('Budget Total ($)')).toBeTruthy();
    });

    it('le filtre Pill masque les sections non sélectionnées', () => {
        render(<LifeProjects {...baseProps} />);
        fireEvent.click(screen.getByRole('radio', { name: 'Voyages' }));
        expect(screen.queryByRole('heading', { level: 2, name: 'Événements de vie' })).toBeFalsy();
        expect(screen.getByRole('heading', { level: 2, name: 'Voyages' })).toBeTruthy();
    });
});
