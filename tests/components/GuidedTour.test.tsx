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
        // Étape 2 = Accueil (Tab.DASHBOARD) → setActiveTab appelé.
        fireEvent.click(screen.getByText(/Suivant/));
        expect(mockSetActiveTab).toHaveBeenCalledWith(Tab.DASHBOARD);
        expect(screen.getByText(/Étape 2 \/ 15/)).toBeTruthy();
    });

    it('Passer ferme le tour et le marque comme vu', () => {
        render(<GuidedTour />);
        startTour();
        fireEvent.click(screen.getByText(/Passer/));
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(localStorage.getItem(TOUR_DONE_KEY)).toBe('true');
    });
});
