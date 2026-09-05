// tests/components/rentalOwnerSelect.test.tsx
//
// [FISC-RRSP-RENTAL-EARNED] Le champ `owner` d'un immeuble n'existe pour l'utilisateur que s'il a
// une SAISIE (`CHAMP-DANS-LE-TYPE-INATTEIGNABLE-DANS-L-UI`) : on vérifie les deux écrans qui le
// posent, ce qu'ils ÉCRIVENT (l'état, pas le rendu), et que le sélecteur n'apparaît pas en solo —
// un choix sans effet serait une promesse vide.
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { RentalPropertyPanel } from '../../components/PatrimoineExtended';
import { PropertyConfigurator } from '../../components/realestate/PropertyConfigurator';
import { nomsConjoints } from '../../components/ui/SelectProprietaire';
import { useFinanceStore } from '../../store/useFinanceStore';
import type { RentalProperty, RealEstateGoal, User } from '../../types';

const LABEL = "Propriétaire de l'immeuble (droits REER)";
const bien = (over: Partial<RentalProperty> = {}): RentalProperty => ({
    id: 'rp1', name: 'Plex Papineau', purchasePrice: 500_000, currentValue: 600_000,
    mortgageBalance: 300_000, mortgageRate: 5, monthlyRent: 2_000, vacancyPct: 5, monthlyExpenses: 400, ...over,
});

afterEach(cleanup);

describe('[FISC-RRSP-RENTAL-EARNED] nomsConjoints — quand le sélecteur a un sens', () => {
    it('deux prénoms → tuple ; second conjoint sans nom → null ; premier vide → « Conjoint 1 »', () => {
        expect(nomsConjoints([{ name: 'Marc' }, { name: 'Anna' }])).toEqual(['Marc', 'Anna']);
        expect(nomsConjoints([{ name: 'Marc' }, { name: '  ' }])).toBeNull();
        expect(nomsConjoints([{ name: 'Marc' }])).toBeNull();
        expect(nomsConjoints([{ name: '' }, { name: 'Anna' }])).toEqual(['Conjoint 1', 'Anna']);
    });
});

describe('[FISC-RRSP-RENTAL-EARNED] Réglages → Patrimoine : RentalPropertyPanel', () => {
    it('couple : le sélecteur existe, vaut « Les deux » par défaut, et ÉCRIT owner dans l’immeuble', () => {
        const onChange = vi.fn();
        render(<RentalPropertyPanel properties={[bien()]} onChange={onChange} conjoints={['Marc', 'Anna']} />);
        const select = screen.getByLabelText(LABEL) as HTMLSelectElement;
        expect(select.value).toBe('joint');
        expect(Array.from(select.options).map(o => o.textContent)).toEqual(['Les deux (50/50)', 'Marc', 'Anna']);
        fireEvent.change(select, { target: { value: 'user2' } });
        expect(onChange).toHaveBeenCalledTimes(1);
        const next = onChange.mock.calls[0][0] as RentalProperty[];
        expect(next[0].owner).toBe('user2');
        expect(next[0].monthlyRent).toBe(2_000); // le reste de l'immeuble survit au patch
    });

    it('un owner déjà persisté est affiché tel quel', () => {
        render(<RentalPropertyPanel properties={[bien({ owner: 'user1' })]} onChange={vi.fn()} conjoints={['Marc', 'Anna']} />);
        expect((screen.getByLabelText(LABEL) as HTMLSelectElement).value).toBe('user1');
    });

    it('solo (pas de conjoints) : aucun sélecteur — un choix sans effet ne se propose pas', () => {
        render(<RentalPropertyPanel properties={[bien()]} onChange={vi.fn()} />);
        expect(screen.queryByLabelText(LABEL)).toBeNull();
    });
});

describe('[FISC-RRSP-RENTAL-EARNED] onglet Immobilier : PropertyConfigurator', () => {
    const users = [
        { name: 'Marc', grossSalary: 8_000, netSalary: 5_500 },
        { name: 'Anna', grossSalary: 5_000, netSalary: 3_500 },
    ] as unknown as [User, User];
    const setUsers = (u: [User, User]) => act(() => {
        useFinanceStore.setState(s => ({ config: { ...s.config, users: u } }));
    });
    const goal = (over: Partial<RealEstateGoal> = {}) => ({
        price: 450_000, downPayment: 90_000, maxValue: 0, isPrimaryResidence: false, isRented: true, rentalIncomeMonthly: 1_500, ...over,
    } as unknown as RealEstateGoal);
    const renderConf = (g: RealEstateGoal, updateActiveGoal = vi.fn()) => {
        render(
            <PropertyConfigurator
                activeGoal={g} updateActiveGoal={updateActiveGoal}
                mode="AUTO" setMode={vi.fn()}
                taxesYearly={3000} setTaxesYearly={vi.fn()}
                heatingMonthly={100} setHeatingMonthly={vi.fn()}
                condoFees={0} setCondoFees={vi.fn()}
            />,
        );
        return updateActiveGoal;
    };

    it('couple + bien loué : le sélecteur existe et ÉCRIT owner sur le but', () => {
        setUsers(users);
        const update = renderConf(goal());
        const select = screen.getByLabelText(LABEL) as HTMLSelectElement;
        expect(select.value).toBe('joint');
        fireEvent.change(select, { target: { value: 'user1' } });
        expect(update).toHaveBeenCalledWith({ owner: 'user1' });
    });

    it('résidence principale : pas de sélecteur (aucun loyer n’est produit, rien à attribuer)', () => {
        setUsers(users);
        renderConf(goal({ isPrimaryResidence: true, isRented: false }));
        expect(screen.queryByLabelText(LABEL)).toBeNull();
    });

    it('solo (second conjoint sans nom) : pas de sélecteur même pour un bien loué', () => {
        setUsers([users[0], { ...users[1], name: '' }] as [User, User]);
        renderConf(goal());
        expect(screen.queryByLabelText(LABEL)).toBeNull();
    });
});
