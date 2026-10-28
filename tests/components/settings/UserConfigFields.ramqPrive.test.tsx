// [ENG-RAMQ-FIELDS] (lot 155) — la case « Assurance médicaments privée » écrit bien
// `User.hasPrivateDrugInsurance` PAR utilisateur. Sans producteur, le champ du type serait une
// intention jamais livrée (UN-CHAMP-TYPE-SANS-PRODUCTEUR) : ce test est la preuve du producteur,
// le scan de source de tests/services/ramqExemptParAdulte.test.ts est celle du consommateur.
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
                { ...init.users[1], name: 'Conjoint', grossSalary: 4000, netSalary: 3200 },
            ] as [User, User],
        },
    });
});

describe('UserConfigFields (fiscal) — assurance médicaments privée', () => {
    it('cocher écrit hasPrivateDrugInsurance pour CET utilisateur seulement', () => {
        render(<UserConfigFields section="fiscal" />);
        const cases = screen.getAllByRole('checkbox', { name: /Assurance médicaments privée/ });
        expect(cases).toHaveLength(2); // une par conjoint — l'exemption est PAR ADULTE
        expect((cases[0] as HTMLInputElement).checked).toBe(false);

        fireEvent.click(cases[0]);
        const users = useFinanceStore.getState().config.users;
        expect(users[0].hasPrivateDrugInsurance).toBe(true);
        expect(users[1].hasPrivateDrugInsurance ?? false).toBe(false);
    });

    it('décocher revient au régime public (false explicite, pas une suppression)', () => {
        const init = useFinanceStore.getState().config;
        useFinanceStore.setState({
            config: {
                ...init,
                users: [
                    { ...init.users[0], hasPrivateDrugInsurance: true },
                    { ...init.users[1] },
                ] as [User, User],
            },
        });
        render(<UserConfigFields section="fiscal" />);
        const cases = screen.getAllByRole('checkbox', { name: /Assurance médicaments privée/ });
        expect((cases[0] as HTMLInputElement).checked).toBe(true);
        fireEvent.click(cases[0]);
        expect(useFinanceStore.getState().config.users[0].hasPrivateDrugInsurance).toBe(false);
    });
});
