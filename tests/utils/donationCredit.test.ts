import { describe, it, expect } from 'vitest';
import { computeDonationCredit, DONATION_FIRST_TIER_CEILING } from '../../utils/donationCredit';

// [FA-6] Crédit d'impôt non remboursable pour dons (féd + QC, par paliers).
// Réf : docs/FISCAL_REFERENCE.md §10. Effectif 35 % sur 1ers 200 $, 53 % au-delà.

describe('computeDonationCredit — crédit dons par paliers (FA-6)', () => {
    it('don ≤ 200 $ : 35 % combiné (15 féd + 20 QC)', () => {
        expect(computeDonationCredit(200)).toBeCloseTo(70, 6);     // 0,35 × 200
        expect(computeDonationCredit(100)).toBeCloseTo(35, 6);     // 0,35 × 100
    });

    it('don > 200 $ : 35 % sur 200 $ + 53 % sur l\'excédent', () => {
        // 1200 $ : 70 (1ers 200) + 0,53 × 1000 = 70 + 530 = 600
        expect(computeDonationCredit(1200)).toBeCloseTo(600, 6);
        // 12000 $ : féd 0,15·200 + 0,29·11800 = 3452 ; QC 0,20·200 + 0,24·11800 = 2872 → 6324
        expect(computeDonationCredit(12000)).toBeCloseTo(6324, 6);
    });

    it('strictement PLUS généreux que l\'ancien 33 % plat au-delà de 200 $', () => {
        // L'ancien code : 0,33 × don. Le nouveau doit créditer davantage (53 % > 33 % sur l'excédent).
        const don = 10000;
        expect(computeDonationCredit(don)).toBeGreaterThan(don * 0.33);
    });

    it('palier exactement à la borne (200 $)', () => {
        expect(computeDonationCredit(DONATION_FIRST_TIER_CEILING)).toBeCloseTo(70, 6);
    });

    it('0 / négatif / NaN / undefined → 0 (pas de NaN)', () => {
        expect(computeDonationCredit(0)).toBe(0);
        expect(computeDonationCredit(-500)).toBe(0);
        expect(computeDonationCredit(NaN)).toBe(0);
        expect(computeDonationCredit(undefined as unknown as number)).toBe(0);
        expect(Number.isNaN(computeDonationCredit(NaN))).toBe(false);
    });

    it('monotone croissant avec le montant du don', () => {
        expect(computeDonationCredit(5000)).toBeGreaterThan(computeDonationCredit(1000));
        expect(computeDonationCredit(1000)).toBeGreaterThan(computeDonationCredit(200));
    });
});
