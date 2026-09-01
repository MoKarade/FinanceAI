// CA-04 — smoke test : ChildPlanning (money-critical, aucun test direct jusqu'ici).
// [REFONTE-NAV-L4] étendu : header harmonisé (titre = TAB_LABELS), empty state honnête
// avec CTA quand aucun enfant (avant : page blanche `return null`), lien commun vers Futur.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChildPlanning } from '../../components/ChildPlanning';
import { useFinanceStore } from '../../store/useFinanceStore';
import { INITIAL_CHILD_GOAL, TAB_LABELS } from '../../constants';
import { DAYCARE_INFO, SCHOOL_INFO } from '../../services/projection/childCosts';
import { Tab } from '../../types';
import type { ProjectionConfig } from '../../types';

vi.mock('recharts', async () => {
    const React = await import('react');
    const P = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
    return {
        ResponsiveContainer: P, BarChart: P, ComposedChart: P,
        Bar: () => null, Area: () => null, Legend: () => null, ReferenceLine: () => null,
        XAxis: () => null, YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null,
    };
});

const proj = {
    years: 30, returnRate: 6, inflationRate: 2, savingsMode: 'manual', manualContribution: 0,
    usePortfolioRate: false, returnRates: { celi: 7, reer: 6.5, nonReg: 6.5, crypto: 10, cash: 3 },
    emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3,
} as unknown as ProjectionConfig;

const navSpy = vi.fn();

describe('ChildPlanning — smoke (CA-04) + harmonisation (REFONTE-NAV-L4)', () => {
    beforeEach(() => {
        navSpy.mockClear();
        useFinanceStore.setState({ lastProjection: null, navigateWithFocus: navSpy as never });
    });

    it('sans objectif : empty state honnête (header + CTA), pas de page blanche', () => {
        const setGoals = vi.fn();
        render(<ChildPlanning goals={[]} setGoals={setGoals} projection={proj} currentRESP={0} />);
        // Titre = TAB_LABELS (source unique des libellés d'onglets).
        expect(screen.getByRole('heading', { level: 1, name: TAB_LABELS[Tab.CHILD] })).toBeTruthy();
        expect(screen.getByText('Aucun enfant planifié')).toBeTruthy();
        // CTA fonctionnel : ajoute un premier enfant.
        fireEvent.click(screen.getByRole('button', { name: /Ajouter un enfant/ }));
        expect(setGoals).toHaveBeenCalledTimes(1);
        const added = setGoals.mock.calls[0][0];
        expect(added).toHaveLength(1);
        expect(added[0].respContribution).toBe(INITIAL_CHILD_GOAL.respContribution);
    });

    it('[A11Y-TABSTATE] dans CHAQUE groupe, une seule option est annoncée active — et elle suit le clic', () => {
        // ⚠️ Le scan de source (`tests/guards/etatSelectionAnnonceGuard.test.ts`) prouve que
        // l'attribut EXISTE ; il ne prouve pas qu'il porte la bonne VALEUR.
        //
        // ⚠️ Et mon premier jet ne le prouvait pas non plus : il comptait les boutons pressés SUR
        // TOUT L'ÉCRAN, donc remplacer `aria-pressed={daycareType === key}` par un `true` constant
        // le laissait VERT — les trois options de garde s'annonçaient actives ensemble, et le total
        // restait invariant au clic parce que le clic tombait dans un AUTRE groupe. Une perturbation
        // muette dit d'abord que la mesure n'atteint pas son objet. La propriété est PAR GROUPE,
        // elle se mesure donc par groupe.
        const goals = [{ ...INITIAL_CHILD_GOAL, id: 'c1', name: 'Léo' }];
        render(<ChildPlanning goals={goals} setGoals={vi.fn()} projection={proj} currentRESP={0} />);

        const groupe = (libelles: readonly string[]) => libelles.map((l) => {
            const bouton = screen.getAllByRole('button').find((b) => b.textContent?.includes(l));
            expect(bouton, `option introuvable à l'écran : ${l}`).toBeTruthy();
            return bouton as HTMLElement;
        });
        const presses = (boutons: readonly HTMLElement[]) =>
            boutons.filter((b) => b.getAttribute('aria-pressed') === 'true').length;

        const garde = groupe(Object.values(DAYCARE_INFO).map((i) => i.label));
        const ecole = groupe(Object.values(SCHOOL_INFO).map((i) => i.label));
        // Anti-vacuité : sans plusieurs options par groupe, « une seule active » est trivial.
        expect(garde.length).toBeGreaterThanOrEqual(3);
        expect(ecole.length).toBeGreaterThanOrEqual(2);

        expect(presses(garde), 'groupe « mode de garde » : une seule option active').toBe(1);
        expect(presses(ecole), 'groupe « type d\'école » : une seule option active').toBe(1);

        // Le levier : cliquer une option NON active la rend active et LIBÈRE la précédente, dans son
        // groupe. Sans cette seconde moitié, un `aria-pressed` figé au bon endroit passerait.
        const inactif = garde.find((b) => b.getAttribute('aria-pressed') === 'false');
        expect(inactif, 'aucune option de garde inactive — la mesure serait vacueuse').toBeTruthy();
        fireEvent.click(inactif as HTMLElement);
        expect((inactif as HTMLElement).getAttribute('aria-pressed')).toBe('true');
        expect(presses(garde), 'après le clic, toujours une seule option active').toBe(1);
        // Et le groupe voisin n'a pas bougé : la sélection est bien locale.
        expect(presses(ecole)).toBe(1);
    });

    it('avec un enfant : rend le configurateur + le lien « Voir l\'effet sur ma courbe »', () => {
        const goals = [{ ...INITIAL_CHILD_GOAL, id: 'c1', name: 'Léo' }];
        render(<ChildPlanning goals={goals} setGoals={vi.fn()} projection={proj} currentRESP={0} />);
        expect(screen.getByRole('heading', { level: 1, name: TAB_LABELS[Tab.CHILD] })).toBeTruthy();
        expect(screen.getByText('Choix de Vie')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /Voir l'effet sur ma courbe/ }));
        expect(navSpy).toHaveBeenCalledWith(Tab.FUTURE);
    });
});
