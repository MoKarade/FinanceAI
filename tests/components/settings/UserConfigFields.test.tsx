// tests/components/settings/UserConfigFields.test.tsx
//
// Régression money-correctness (déplacée depuis UsersCard.test) : le champ
// « Salaire Brut » — désormais dans l'onglet Impôts via UserConfigFields — est
// saisi en ANNUEL mais stocké en MENSUEL (le moteur ré-annualise ×12). Avant le
// correctif, l'annuel stocké tel quel donnait un revenu ~12× trop haut.
// UserConfigFields lit/écrit le STORE (pas de props) → on vérifie le store.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useFinanceStore } from '../../../store/useFinanceStore';
import { UserConfigFields } from '../../../components/settings/UserConfigFields';
import type { User } from '../../../types';

vi.mock('../../../components/ui/Toast', () => ({ showToast: vi.fn() }));

const initial = useFinanceStore.getState();

beforeEach(() => {
    useFinanceStore.setState(initial, true);
    const init = useFinanceStore.getState().config;
    useFinanceStore.setState({
        config: {
            ...init,
            users: [
                { ...init.users[0], name: 'Moi', grossSalary: 5000, netSalary: 4000 },
                { ...init.users[1], name: '' },
            ] as [User, User],
            splitMode: 'prorata',
        },
    });
});

const grossInput = (c: HTMLElement) =>
    c.querySelector('[data-focus-section="profile-user1-grossSalary"] input') as HTMLInputElement;
const netInput = (c: HTMLElement) =>
    c.querySelector('[data-focus-section="profile-user1-netSalary"] input') as HTMLInputElement;

describe('UserConfigFields (salary) — brut annuel ↔ mensuel', () => {
    it('libellés explicites (brut annuel, net mensuel)', () => {
        render(<UserConfigFields section="salary" />);
        expect(screen.getAllByText('Salaire Brut annuel ($)').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Salaire Net mensuel ($)').length).toBeGreaterThan(0);
    });

    it('affiche le brut en ANNUEL (grossSalary mensuel × 12)', () => {
        const { container } = render(<UserConfigFields section="salary" />);
        expect(grossInput(container).value).toBe('60000');
        expect(netInput(container).value).toBe('4000');
    });

    it('saisie ANNUELLE → stockage MENSUEL (÷12)', () => {
        const { container } = render(<UserConfigFields section="salary" />);
        fireEvent.change(grossInput(container), { target: { value: '84000' } });
        expect(useFinanceStore.getState().config.users[0].grossSalary).toBe(7000);
    });

    it('le champ net reste mensuel (stocké tel quel)', () => {
        const { container } = render(<UserConfigFields section="salary" />);
        fireEvent.change(netInput(container), { target: { value: '4200' } });
        expect(useFinanceStore.getState().config.users[0].netSalary).toBe(4200);
    });

    it('le brouillon laisse taper une valeur libre sans la mutiler', () => {
        const { container } = render(<UserConfigFields section="salary" />);
        const input = grossInput(container);
        fireEvent.change(input, { target: { value: '7' } });
        expect(input.value).toBe('7');
    });
});
