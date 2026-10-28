// D6-SR-2 — maskedSliderAria : parité lecteur d'écran ↔ blur visuel sur les sliders monétaires.
import { describe, it, expect } from 'vitest';
import { maskedSliderAria } from '../../utils/privacyAria';

describe('maskedSliderAria (D6-SR-2)', () => {
    it('mode privé → aria-valuetext "Montant masqué"', () => {
        expect(maskedSliderAria(true)).toEqual({ 'aria-valuetext': 'Montant masqué' });
    });
    it('mode normal → aucun override (le SR annonce la vraie valeur)', () => {
        expect(maskedSliderAria(false)).toEqual({});
        expect(maskedSliderAria(false)['aria-valuetext']).toBeUndefined();
    });
});
