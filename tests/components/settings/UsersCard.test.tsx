// tests/components/settings/UsersCard.test.tsx
//
// Régression money-correctness : le champ « Salaire Brut » des Réglages est saisi
// en ANNUEL mais stocké en MENSUEL (convention canonique du store ; le moteur
// ré-annualise ×12, cf utils/salary + TaxCenter). Avant le correctif, ce champ
// stockait l'annuel tel quel → revenu ~12× trop haut (impôt/projection/retraite
// faux). Ces tests verrouillent : affichage = grossSalary×12, saisie convertie ÷12,
// net inchangé (déjà mensuel), libellés explicites.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useFinanceStore } from '../../../store/useFinanceStore';
import { UsersCard } from '../../../components/settings/sections/UsersCard';
import type { AppState, User } from '../../../types';

vi.mock('../../../components/ui/Toast', () => ({ showToast: vi.fn() }));

const baseConfig = (): AppState['config'] => {
    const init = useFinanceStore.getState().config;
    return {
        ...init,
        users: [
            { ...init.users[0], name: 'Moi', grossSalary: 5000, netSalary: 4000 },
            { ...init.users[1], name: '' },
        ] as [User, User],
        splitMode: 'prorata',
    };
};

const grossInput = (c: HTMLElement) =>
    c.querySelector('[data-focus-section="profile-user1-grossSalary"] input') as HTMLInputElement;
const netInput = (c: HTMLElement) =>
    c.querySelector('[data-focus-section="profile-user1-netSalary"] input') as HTMLInputElement;

describe('UsersCard — salaire brut annuel ↔ mensuel', () => {
    it('libellés explicites (brut annuel, net mensuel)', () => {
        render(<UsersCard config={baseConfig()} setConfig={vi.fn()} />);
        expect(screen.getAllByText('Salaire Brut annuel ($)').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Salaire Net mensuel ($)').length).toBeGreaterThan(0);
    });

    it('affiche le brut en ANNUEL (grossSalary mensuel × 12)', () => {
        const { container } = render(<UsersCard config={baseConfig()} setConfig={vi.fn()} />);
        // grossSalary stocké = 5000/mois → champ affiche 60000/an.
        expect(grossInput(container).value).toBe('60000');
        // net déjà mensuel → affiché tel quel.
        expect(netInput(container).value).toBe('4000');
    });

    it('saisie ANNUELLE → stockage MENSUEL (÷12)', () => {
        const setConfig = vi.fn();
        const { container } = render(<UsersCard config={baseConfig()} setConfig={setConfig} />);
        fireEvent.change(grossInput(container), { target: { value: '84000' } });
        expect(setConfig).toHaveBeenCalledTimes(1);
        const next = setConfig.mock.calls[0][0] as AppState['config'];
        // 84000/an → 7000/mois stocké (annualSalaryToMonthly = round(/12)).
        expect(next.users[0].grossSalary).toBe(7000);
    });

    it('le champ net reste mensuel (stocké tel quel, sans ×12 ni ÷12)', () => {
        const setConfig = vi.fn();
        const { container } = render(<UsersCard config={baseConfig()} setConfig={setConfig} />);
        fireEvent.change(netInput(container), { target: { value: '4200' } });
        const next = setConfig.mock.calls[0][0] as AppState['config'];
        expect(next.users[0].netSalary).toBe(4200);
    });

    it('le brouillon laisse taper une valeur libre sans la mutiler', () => {
        // Sans brouillon, un input contrôlé grossSalary×12 transformerait « 7 »
        // en round(7/12)×12 = 0 à l'affichage. Avec brouillon, on tape librement.
        const setConfig = vi.fn();
        const { container } = render(<UsersCard config={baseConfig()} setConfig={setConfig} />);
        const input = grossInput(container);
        fireEvent.change(input, { target: { value: '7' } });
        expect(input.value).toBe('7'); // l'affichage suit la frappe (brouillon)
    });
});
