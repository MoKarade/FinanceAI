/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Tab } from '../../types';
import { TOUR_EVENT, TOUR_DONE_KEY } from '../../components/tour/tourControl';

// Store mocké : on espionne setActiveTab (le tour navigue les onglets).
const { mockSetActiveTab } = vi.hoisted(() => ({ mockSetActiveTab: vi.fn() }));
vi.mock('../../store/useFinanceStore', () => ({
    useFinanceStore: (selector: (s: { setActiveTab: unknown }) => unknown) =>
        selector({ setActiveTab: mockSetActiveTab }),
}));

import { GuidedTour } from '../../components/tour/GuidedTour';

const startTour = () => act(() => { window.dispatchEvent(new CustomEvent(TOUR_EVENT)); });

describe('GuidedTour', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        try { localStorage.removeItem(TOUR_DONE_KEY); } catch { /* noop */ }
    });

    it("ne rend rien tant que le tour n'est pas démarré", () => {
        render(<GuidedTour />);
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('démarre sur la 1re étape via event global', () => {
        render(<GuidedTour />);
        startTour();
        expect(screen.getByRole('dialog', { name: /tutoriel guidé/i })).toBeTruthy();
        expect(screen.getByText(/visite guidée/i)).toBeTruthy();
        expect(screen.getByText(/Étape 1 \/ 15/)).toBeTruthy();
    });

    it('Suivant avance et ouvre l\'onglet de l\'étape', () => {
        render(<GuidedTour />);
        startTour();
        // [REFONTE-NAV Lot 1] Étape 2 = Futur (le cœur — l'Accueil est retiré) → setActiveTab appelé.
        fireEvent.click(screen.getByText(/Suivant/));
        expect(mockSetActiveTab).toHaveBeenCalledWith(Tab.FUTURE);
        expect(screen.getByText(/Étape 2 \/ 15/)).toBeTruthy();
    });

    it('Passer ferme le tour et le marque comme vu', () => {
        render(<GuidedTour />);
        startTour();
        fireEvent.click(screen.getByText(/Passer/));
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(localStorage.getItem(TOUR_DONE_KEY)).toBe('true');
    });

    it('a11y — déplace le focus sur l\'action principale à l\'ouverture', () => {
        render(<GuidedTour />);
        startTour();
        // Sans gestion du focus, il restait sur l'élément déclencheur (hors dialogue).
        expect(document.activeElement).toBe(screen.getByText(/Suivant/));
    });

    it('a11y — le focus reste sur « Suivant » après avoir avancé (pas sur « Précédent »)', () => {
        // Régression : sans key stable, React réutilisait le nœud du bouton primaire
        // pour « Précédent » à l'étape 2 → le focus se retrouvait sur le mauvais bouton.
        render(<GuidedTour />);
        startTour();
        fireEvent.click(screen.getByText(/Suivant/));
        expect(screen.getByText(/Précédent/)).toBeTruthy(); // étape 2 atteinte
        expect(document.activeElement).toBe(screen.getByText(/Suivant/));
    });
});
