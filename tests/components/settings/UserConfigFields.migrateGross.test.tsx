// [MIGRATE-GROSS-PROPOSER] L'avis « brut fabriqué par l'ancienne version » du Profil : détecté →
// PROPOSÉ, jamais écrit seul (décision de Marc, 2026-09-03 — écraser une saisie est irréversible,
// et une coïncidence est possible). Les trois faits défendus :
//   1. l'avis n'apparaît QUE sur la signature exacte (et pas après confirmation) ;
//   2. AUCUNE écriture de salaire sans clic — le rendu seul ne change pas le store ;
//   3. chaque bouton fait EXACTEMENT ce qu'il dit (recalcul = inversion fiscale + confirmé ;
//      « c'est bien mon brut » = confirmé SEULEMENT, salaire intact).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { useFinanceStore } from '../../../store/useFinanceStore';
import { UserConfigFields } from '../../../components/settings/UserConfigFields';
import { proposedGrossMonthlyFromNet } from '../../../services/legacyGrossSignature';
import type { User } from '../../../types';

vi.mock('../../../components/ui/Toast', () => ({ showToast: vi.fn() }));

const initial = useFinanceStore.getState();
const AVIS = 'fabriquée automatiquement';

function poserUser1(patch: Partial<User>) {
    useFinanceStore.setState(initial, true);
    const init = useFinanceStore.getState().config;
    useFinanceStore.setState({
        config: {
            ...init,
            users: [
                { ...init.users[0], name: 'Moi', grossSalary: 0, netSalary: 0, grossSalaryConfirmed: undefined, ...patch },
                { ...init.users[1], name: '' },
            ] as [User, User],
        },
    });
}

beforeEach(() => poserUser1({}));

describe('[MIGRATE-GROSS-PROPOSER] avis du Profil', () => {
    it('signature détectée (5 000 net / 6 750 brut) → l\'avis et ses DEUX boutons apparaissent', () => {
        poserUser1({ netSalary: 5000, grossSalary: 6750 });
        const { container, getByText } = render(<UserConfigFields section="salary" />);
        expect(container.textContent).toContain(AVIS);
        expect(getByText(/Recalculer depuis mon net/)).toBeTruthy();
        expect(getByText('C\'est bien mon brut')).toBeTruthy();
    });

    it('le RENDU seul n\'écrit RIEN : détecter n\'est pas migrer', async () => {
        poserUser1({ netSalary: 5000, grossSalary: 6750 });
        render(<UserConfigFields section="salary" />);
        // Flush : une écriture DIFFÉRÉE (setTimeout/effet) est aussi une écriture silencieuse —
        // la perturbation `setTimeout(patch, 0)` restait verte sans cette attente (mesuré).
        await new Promise((r) => setTimeout(r, 10));
        const u = useFinanceStore.getState().config.users[0];
        expect(u.grossSalary).toBe(6750);
        expect(u.grossSalaryConfirmed).toBeUndefined();
    });

    it('brut SANS la signature → aucun avis (contrôle négatif)', () => {
        poserUser1({ netSalary: 5000, grossSalary: 7000 });
        const { container } = render(<UserConfigFields section="salary" />);
        expect(container.textContent).not.toContain(AVIS);
    });

    it('déjà confirmé → aucun avis, même avec la signature', () => {
        poserUser1({ netSalary: 5000, grossSalary: 6750, grossSalaryConfirmed: true });
        const { container } = render(<UserConfigFields section="salary" />);
        expect(container.textContent).not.toContain(AVIS);
    });

    it('« Recalculer depuis mon net » écrit l\'inversion fiscale exacte ET confirme — au clic, pas avant', () => {
        poserUser1({ netSalary: 5000, grossSalary: 6750 });
        const { getByText, container } = render(<UserConfigFields section="salary" />);
        fireEvent.click(getByText(/Recalculer depuis mon net/));
        const u = useFinanceStore.getState().config.users[0];
        // La valeur attendue vient du MÊME service que le bouton — le fait défendu ici est le
        // CÂBLAGE bouton→store, l'exactitude de l'inversion est prouvée par la garde de PROPRIÉTÉ
        // de legacyGrossSignature.test.ts (le brut repassé au fiscal redonne le net).
        const attendu = proposedGrossMonthlyFromNet({ netSalary: 5000 }, new Date().getFullYear(), 1);
        expect(u.grossSalary).toBe(attendu);
        expect(u.grossSalary).not.toBe(6750); // anti-vacuité : la valeur a réellement bougé
        expect(u.grossSalaryConfirmed).toBe(true);
        expect(container.textContent).not.toContain(AVIS); // l'avis s'éteint
    });

    it('« C\'est bien mon brut » confirme SEULEMENT — le salaire ne bouge pas d\'un dollar', () => {
        poserUser1({ netSalary: 5000, grossSalary: 6750 });
        const { getByText, container } = render(<UserConfigFields section="salary" />);
        fireEvent.click(getByText('C\'est bien mon brut'));
        const u = useFinanceStore.getState().config.users[0];
        expect(u.grossSalary).toBe(6750);
        expect(u.grossSalaryConfirmed).toBe(true);
        expect(container.textContent).not.toContain(AVIS);
    });

    it('mode discret ACTIF → aucun avis, même avec la signature (structure indiscernable + la proposition s\'examine à découvert)', () => {
        poserUser1({ netSalary: 5000, grossSalary: 6750 });
        act(() => { useFinanceStore.setState({ isPrivacyMode: true }); });
        try {
            const { container } = render(<UserConfigFields section="salary" />);
            expect(container.textContent).not.toContain(AVIS);
            // ⚠️ isPrivacyMode est un état de MODULE-store : remise à zéro obligatoire (finally),
            // sinon ce cas contamine les suivants (leçon mesurée du dépôt).
        } finally {
            act(() => { useFinanceStore.setState({ isPrivacyMode: false }); });
        }
    });

    it('salaire estampillé fiche de paie → aucun avis (un document réel n\'est pas un fabriqué)', () => {
        poserUser1({ netSalary: 5000, grossSalary: 6750, salarySource: { kind: 'payslip', appliedAt: 1 } as User['salarySource'] });
        const { container } = render(<UserConfigFields section="salary" />);
        expect(container.textContent).not.toContain(AVIS);
    });
});
