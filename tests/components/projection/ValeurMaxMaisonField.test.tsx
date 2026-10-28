// [FUTUR-MOBILE-PR4] ValeurMaxMaisonField — extraction VERBATIM de `ProjectionControls.tsx:256`
// (BACKLOG : « se déplace tel quel, PrivateAmount + formatCompactCAD, test mode discret sur le
// fragment isolé »). `PrivateAmount` lit `isPrivacyMode` directement dans le store GLOBAL (pas une
// prop) — le masquage visuel fonctionne donc déjà, et ce test le prouve isolément, hors de
// `ProjectionControls` en entier (c'est le fragment qui doit être sûr, pas seulement son parent).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ValeurMaxMaisonField } from '../../../components/projection/macroFields/ValeurMaxMaisonField';
import { useFinanceStore } from '../../../store/useFinanceStore';
import type { RealEstateGoal } from '../../../types';

const goals = [{ maxValue: 1500000 } as unknown as RealEstateGoal];

describe('ValeurMaxMaisonField — mode discret (fragment isolé)', () => {
    beforeEach(() => {
        useFinanceStore.setState({ isPrivacyMode: false });
    });

    it('mode NORMAL : affiche le montant formaté (formatCompactCAD)', () => {
        render(<ValeurMaxMaisonField realEstateGoals={goals} setRealEstateGoals={vi.fn()} isPrivacyMode={false} />);
        expect(screen.getByText('1,50 M$')).toBeInTheDocument();
    });

    it('mode DISCRET : le montant réel n\'est PAS dans le DOM, « ••• » le remplace', () => {
        useFinanceStore.setState({ isPrivacyMode: true });
        render(<ValeurMaxMaisonField realEstateGoals={goals} setRealEstateGoals={vi.fn()} isPrivacyMode={true} />);
        expect(screen.queryByText('1,50 M$')).not.toBeInTheDocument();
        expect(screen.getByText('•••')).toBeInTheDocument();
    });

    it('mode DISCRET : le curseur porte aria-valuetext="Montant masqué" (parité lecteur d\'écran)', () => {
        render(<ValeurMaxMaisonField realEstateGoals={goals} setRealEstateGoals={vi.fn()} isPrivacyMode={true} />);
        expect(screen.getByRole('slider', { name: 'Valeur Max Maison' })).toHaveAttribute('aria-valuetext', 'Montant masqué');
    });

    it('mode NORMAL : pas d\'aria-valuetext masquant sur le curseur', () => {
        render(<ValeurMaxMaisonField realEstateGoals={goals} setRealEstateGoals={vi.fn()} isPrivacyMode={false} />);
        expect(screen.getByRole('slider', { name: 'Valeur Max Maison' })).not.toHaveAttribute('aria-valuetext');
    });
});
