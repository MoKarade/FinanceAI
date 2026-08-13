import { describe, it, expect } from 'vitest';
import { computeDonationCredit, DONATION_FIRST_TIER_CEILING, DONATION_CREDIT_RATES } from '../../utils/donationCredit';
import { QC_FEDERAL_ABATEMENT_RATE } from '../../utils/tax';

// [FA-6] Crédit d'impôt non remboursable pour dons (féd + QC, par paliers).
// Réf : docs/FISCAL_REFERENCE.md §10.
// [FISC-DON-ABATEMENT] La part FÉDÉRALE ne vaut que 83,5 % pour un résident du Québec : un crédit
// non remboursable fédéral réduit l'impôt fédéral de BASE, sur lequel l'abattement de 16,5 % est
// calculé ENSUITE. Effectif QC : 32,5 % sur les 1ers 200 $, 48,2 % au-delà.

/** Taux effectifs QC, DÉRIVÉS des constantes — jamais recopiés (une garde à valeurs en dur dérive). */
const EFF_FIRST = DONATION_CREDIT_RATES.fed.first * (1 - QC_FEDERAL_ABATEMENT_RATE) + DONATION_CREDIT_RATES.qc.first;
const EFF_EXCESS = DONATION_CREDIT_RATES.fed.excess * (1 - QC_FEDERAL_ABATEMENT_RATE) + DONATION_CREDIT_RATES.qc.excess;

describe('computeDonationCredit — crédit dons par paliers (FA-6)', () => {
    it('don ≤ 200 $ : 32,5 % combiné effectif (15 féd × 83,5 % + 20 QC)', () => {
        expect(computeDonationCredit(200)).toBeCloseTo(EFF_FIRST * 200, 6);
        expect(computeDonationCredit(100)).toBeCloseTo(EFF_FIRST * 100, 6);
        // Ancrage NUMÉRIQUE indépendant des constantes : 0,15×0,835 + 0,20 = 0,32525.
        expect(computeDonationCredit(200)).toBeCloseTo(65.05, 6);
    });

    it('don > 200 $ : 32,5 % sur 200 $ + 48,2 % sur l\'excédent', () => {
        expect(computeDonationCredit(1200)).toBeCloseTo(EFF_FIRST * 200 + EFF_EXCESS * 1000, 6);
        // 12000 $ : féd (0,15·200 + 0,29·11800) × 0,835 = 2882,42 ; QC 2872 → 5754,42
        expect(computeDonationCredit(12000)).toBeCloseTo(5754.42, 2);
    });

    // ── LE test discriminant : il ÉCHOUE sur le code d'avant (crédit fédéral au taux plein). ──
    // Écarts MESURÉS par l'audit et re-vérifiés ici : le surcrédit annuel valait exactement
    // 16,5 % de la part fédérale.
    it('[FISC-DON-ABATEMENT] la part fédérale est amputée de l\'abattement QC (16,5 %)', () => {
        for (const [don, surcreditAttendu] of [[5000, 234.63], [20000, 952.38]] as const) {
            const first = Math.min(don, DONATION_FIRST_TIER_CEILING);
            const excess = Math.max(0, don - DONATION_FIRST_TIER_CEILING);
            const fedPlein = DONATION_CREDIT_RATES.fed.first * first + DONATION_CREDIT_RATES.fed.excess * excess;
            const qc = DONATION_CREDIT_RATES.qc.first * first + DONATION_CREDIT_RATES.qc.excess * excess;
            const ancienModele = fedPlein + qc;              // ce que rendait le code d'avant
            expect(ancienModele - computeDonationCredit(don)).toBeCloseTo(surcreditAttendu, 2);
            expect(computeDonationCredit(don)).toBeCloseTo(fedPlein * (1 - QC_FEDERAL_ABATEMENT_RATE) + qc, 6);
        }
    });

    // La part QUÉBÉCOISE, elle, vaut 100 % : l'abattement ne la touche pas. Sans cette assertion,
    // un correctif qui amputerait TOUT le crédit de 16,5 % passerait aussi au vert.
    it('la part québécoise n\'est PAS amputée', () => {
        const don = 10000;
        const excess = don - DONATION_FIRST_TIER_CEILING;
        const qc = DONATION_CREDIT_RATES.qc.first * DONATION_FIRST_TIER_CEILING + DONATION_CREDIT_RATES.qc.excess * excess;
        expect(computeDonationCredit(don)).toBeGreaterThan(qc);
        // Le crédit total moins la part QC intacte = la part fédérale ABATTUE, jamais la pleine.
        const fedRestant = computeDonationCredit(don) - qc;
        const fedPlein = DONATION_CREDIT_RATES.fed.first * DONATION_FIRST_TIER_CEILING + DONATION_CREDIT_RATES.fed.excess * excess;
        expect(fedRestant).toBeCloseTo(fedPlein * (1 - QC_FEDERAL_ABATEMENT_RATE), 6);
    });

    it('reste PLUS généreux que l\'ancien 33 % plat au-delà de 200 $ (48,2 % > 33 %)', () => {
        // L'ancien modèle pré-FA-6 : 0,33 × don. Même après l'abattement, les paliers restent
        // meilleurs — l'abattement corrige une SURévaluation, il ne repasse pas sous le 33 % plat.
        const don = 10000;
        expect(computeDonationCredit(don)).toBeGreaterThan(don * 0.33);
    });

    it('palier exactement à la borne (200 $)', () => {
        expect(computeDonationCredit(DONATION_FIRST_TIER_CEILING)).toBeCloseTo(EFF_FIRST * 200, 6);
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
