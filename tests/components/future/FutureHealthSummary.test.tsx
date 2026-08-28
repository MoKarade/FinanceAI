// tests/components/future/FutureHealthSummary.test.tsx
// [NAV-MERGE-SANTE-FUTUR] Résumé condensé de Santé en tête de Futur : verrouille l'état VIDE
// (no-fake-data : pas de score sans données), l'état AVEC score (même calcul que HealthIndicator,
// via `utils/healthScore.ts`), et le deep-link vers le détail (`navigateWithFocus(Tab.BUDGET, 'sante')`
// — même mécanisme que `BudgetWorkspace.test.tsx` vérifie côté consommateur).

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useFinanceStore } from '../../../store/useFinanceStore';
import { FutureHealthSummary } from '../../../components/future/FutureHealthSummary';
import { Tab } from '../../../types';

const initialState = useFinanceStore.getState();

beforeEach(() => {
    useFinanceStore.setState(initialState, true);
});

describe('FutureHealthSummary — état VIDE (no-fake-data)', () => {
    it('sans données utilisateur : invite à renseigner le profil, PAS de score inventé', () => {
        useFinanceStore.setState({
            config: {
                ...initialState.config,
                users: [
                    { ...initialState.config.users[0], name: '', grossSalary: 0, netSalary: 0 },
                    { ...initialState.config.users[1], name: '' },
                ],
            },
            assets: [], transactions: [], financialGoals: [],
        });
        render(<FutureHealthSummary />);
        expect(screen.getByText(/Renseigne ton profil/i)).toBeInTheDocument();
        expect(screen.queryByText(/\/100/)).not.toBeInTheDocument();
    });
});

describe('FutureHealthSummary — état AVEC données', () => {
    beforeEach(() => {
        useFinanceStore.setState({
            config: {
                ...initialState.config,
                users: [
                    { ...initialState.config.users[0], name: 'TestUser', grossSalary: 5000, netSalary: 3500 },
                    { ...initialState.config.users[1], name: '' },
                ],
            },
        });
    });

    it('affiche le score condensé « Santé financière : N/100 »', () => {
        render(<FutureHealthSummary />);
        expect(screen.getByText(/Santé financière/i)).toBeInTheDocument();
        expect(screen.getByText(/\/100/)).toBeInTheDocument();
    });

    it('un clic déclenche le deep-link vers le sous-onglet Santé (Budget)', () => {
        render(<FutureHealthSummary />);
        fireEvent.click(screen.getByRole('button'));
        const state = useFinanceStore.getState();
        expect(state.activeTab).toBe(Tab.BUDGET);
        expect(state.pendingFocus?.section).toBe('sante');
    });
});
