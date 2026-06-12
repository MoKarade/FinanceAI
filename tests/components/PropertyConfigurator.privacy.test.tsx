// D6-SR-2 — intégration : en mode privé, les sliders monétaires de PropertyConfigurator (prix d'achat,
// mise de fonds) exposent aria-valuetext="Montant masqué" au lecteur d'écran (parité avec le blur visuel).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { PropertyConfigurator } from '../../components/realestate/PropertyConfigurator';
import { useFinanceStore } from '../../store/useFinanceStore';
import type { RealEstateGoal } from '../../types';

const goal = { price: 450000, downPayment: 90000, maxValue: 0 } as unknown as RealEstateGoal;

const renderConfigurator = () =>
    render(
        <PropertyConfigurator
            activeGoal={goal} updateActiveGoal={vi.fn()}
            mode="AUTO" setMode={vi.fn()}
            taxesYearly={3000} setTaxesYearly={vi.fn()}
            heatingMonthly={100} setHeatingMonthly={vi.fn()}
            condoFees={0} setCondoFees={vi.fn()}
        />,
    );

describe('PropertyConfigurator — sliders masqués au SR en mode privé (D6-SR-2)', () => {
    afterEach(() => {
        cleanup();
        act(() => { useFinanceStore.setState({ isPrivacyMode: false }); });
    });

    it('mode privé : les sliders monétaires portent aria-valuetext="Montant masqué"', () => {
        act(() => { useFinanceStore.setState({ isPrivacyMode: true }); });
        renderConfigurator();
        const masked = screen.getAllByRole('slider').filter(
            (el) => el.getAttribute('aria-valuetext') === 'Montant masqué',
        );
        // prix d'achat + mise de fonds = 2 sliders monétaires masqués (le plafond maxValue ne l'est pas).
        expect(masked.length).toBe(2);
        // Parité complète : les ÉTIQUETTES de valeur (PrivateAmount : prix + mise de fonds) annoncent
        // aussi « Montant masqué » au SR (sr-only) — sinon la fuite serait juste déplacée du slider au label.
        expect(screen.getAllByText('Montant masqué').length).toBeGreaterThanOrEqual(2);
    });

    it('mode normal : aucun slider n\'est masqué (le SR annonce la vraie valeur)', () => {
        act(() => { useFinanceStore.setState({ isPrivacyMode: false }); });
        renderConfigurator();
        const masked = screen.getAllByRole('slider').filter(
            (el) => el.getAttribute('aria-valuetext') === 'Montant masqué',
        );
        expect(masked.length).toBe(0);
    });

    it('chaque slider monétaire porte un NOM accessible (aria-label) — les <label> ne sont pas associés', () => {
        renderConfigurator();
        // Trouvable par son nom accessible = le SR sait quel contrôle c'est (et pas juste « curseur »).
        expect(screen.getByRole('slider', { name: 'Prix d\'achat' })).toBeInTheDocument();
        expect(screen.getByRole('slider', { name: 'Mise de fonds' })).toBeInTheDocument();
    });
});
