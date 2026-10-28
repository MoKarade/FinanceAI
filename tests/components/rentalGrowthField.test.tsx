// tests/components/rentalGrowthField.test.tsx
// [ENG-PROPGROWTH-PAR-IMMEUBLE] Le champ « Croissance %/an » du panneau des immeubles locatifs.
// Le contrat qui compte est celui du 0 : un champ VIDÉ écrit `undefined` (défaut moteur 3 %),
// un 0 TAPÉ reste 0 — c'est exactement la saisie que ENG-PROPGROWTH-ZERO-INEXPRIMABLE a rendue
// possible côté buts immobiliers, appliquée aux locatifs.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RentalPropertyPanel } from '../../components/PatrimoineExtended';
import type { RentalProperty } from '../../types';

const IMMEUBLE: RentalProperty = {
    id: 'r1', name: 'Duplex', purchasePrice: 700_000, currentValue: 800_000,
    mortgageBalance: 500_000, mortgageRate: 5, monthlyRent: 3_800, vacancyPct: 5,
    monthlyExpenses: 900,
};

const champ = (): HTMLInputElement =>
    screen.getByLabelText(/Croissance annuelle de la valeur/) as HTMLInputElement;

describe('[ENG-PROPGROWTH-PAR-IMMEUBLE] le champ de croissance par immeuble', () => {
    it('taper une valeur écrit propertyGrowthRate sur CET immeuble', () => {
        const onChange = vi.fn();
        render(<RentalPropertyPanel properties={[IMMEUBLE]} onChange={onChange} />);
        fireEvent.change(champ(), { target: { value: '5.5' } });
        expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ id: 'r1', propertyGrowthRate: 5.5 })]);
    });

    it('taper 0 écrit 0 — jamais rabattu sur le défaut', () => {
        const onChange = vi.fn();
        render(<RentalPropertyPanel properties={[IMMEUBLE]} onChange={onChange} />);
        fireEvent.change(champ(), { target: { value: '0' } });
        expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ propertyGrowthRate: 0 })]);
    });

    it('vider le champ écrit undefined (retour au défaut moteur), pas 0', () => {
        const onChange = vi.fn();
        render(<RentalPropertyPanel properties={[{ ...IMMEUBLE, propertyGrowthRate: 4 }]} onChange={onChange} />);
        expect(champ().value).toBe('4');
        fireEvent.change(champ(), { target: { value: '' } });
        const ecrit = onChange.mock.calls[0][0][0] as RentalProperty;
        expect(ecrit.propertyGrowthRate).toBeUndefined();
    });

    it('un 0 déjà SAUVÉ se réaffiche 0 dans son propre champ (pas le placeholder du défaut)', () => {
        render(<RentalPropertyPanel properties={[{ ...IMMEUBLE, propertyGrowthRate: 0 }]} onChange={vi.fn()} />);
        expect(champ().value).toBe('0');
    });
});
