// tests/services/taxEstimate.test.ts
//
// [TEST-GAP-TAXESTIMATE] `estimateTaxableInvestmentIncome` est money-critical (assiette fiscale du
// placement, partagée app + MCP depuis TAX-AVGRATE-BASE) et n'avait AUCUN test unitaire direct.
// Les attendus sont dérivés des constantes exportées (pas re-codés) : si un rendement estimé change,
// le test suit — il verrouille la FORMULE (assiette × rendements × inclusion), pas des littéraux.

import { describe, it, expect } from 'vitest';
import {
    estimateTaxableInvestmentIncome,
    EST_DIVIDEND_YIELD,
    EST_CAPITAL_GAINS_YIELD,
} from '../../services/taxEstimate';
import { CAPITAL_GAINS_INCLUSION_STANDARD } from '../../utils/tax';
import type { Asset } from '../../types';

const FX = { CAD: 1, USD: 1.5, EUR: 1.5 };

const asset = (o: Partial<Asset>): Asset => ({
    symbol: 'AAA', name: 'AAA', quantity: 1, currentPrice: 100, buyPrice: 100,
    currency: 'CAD', accountType: 'NON-ENREG',
    ...o,
} as Asset);

/** Revenu attendu pour une valeur CAD donnée — la formule du module, écrite indépendamment. */
const expectedFor = (valueCad: number): number =>
    valueCad * EST_DIVIDEND_YIELD + valueCad * EST_CAPITAL_GAINS_YIELD * CAPITAL_GAINS_INCLUSION_STANDARD;

describe('[TEST-GAP-TAXESTIMATE] estimateTaxableInvestmentIncome', () => {
    it('NON-ENREG : dividendes 100 % + gains en capital × inclusion (50 %)', () => {
        const assets = [asset({ quantity: 100, currentPrice: 100 })]; // 10 000 CAD
        const income = estimateTaxableInvestmentIncome(assets, FX);
        expect(income).toBeCloseTo(expectedFor(10_000), 6);
        expect(income).toBeGreaterThan(0); // non-vacuité
    });

    it('CRYPTO inclus dans l\'assiette (imposable comme le non-enregistré)', () => {
        const assets = [asset({ accountType: 'CRYPTO', quantity: 2, currentPrice: 5_000 })]; // 10 000
        expect(estimateTaxableInvestmentIncome(assets, FX)).toBeCloseTo(expectedFor(10_000), 6);
    });

    it('REER/CELI/CELIAPP/REEE EXCLUS (à l\'abri de l\'impôt) — même gros solde ⇒ 0', () => {
        const assets = (['REER', 'CELI', 'CELIAPP', 'REEE'] as const).map((t) =>
            asset({ symbol: t, accountType: t, quantity: 1_000, currentPrice: 500 }));
        expect(estimateTaxableInvestmentIncome(assets, FX)).toBe(0);
    });

    it('FX : un actif USD est converti en CAD AVANT d\'estimer le revenu', () => {
        const usd = [asset({ currency: 'USD', quantity: 10, currentPrice: 100 })]; // 1 000 USD = 1 500 CAD
        expect(estimateTaxableInvestmentIncome(usd, FX)).toBeCloseTo(expectedFor(1_500), 6);
    });

    it('valeur NÉGATIVE (donnée corrompue) : clampée à 0, jamais un revenu imposable négatif', () => {
        // Un revenu de placement négatif SOUS-évaluerait l'impôt en silence (commentaire du module —
        // ici on le PROUVE au lieu de l'affirmer).
        const corrupted = [asset({ quantity: -100, currentPrice: 100 })];
        expect(estimateTaxableInvestmentIncome(corrupted, FX)).toBe(0);
    });

    it('mélange : seuls NON-ENREG + CRYPTO contribuent, le reste est ignoré', () => {
        const assets = [
            asset({ symbol: 'NR', quantity: 50, currentPrice: 100 }),                      // 5 000 taxable
            asset({ symbol: 'CR', accountType: 'CRYPTO', quantity: 1, currentPrice: 3_000 }), // 3 000 taxable
            asset({ symbol: 'CE', accountType: 'CELI', quantity: 100, currentPrice: 100 }),   // à l'abri
        ];
        expect(estimateTaxableInvestmentIncome(assets, FX)).toBeCloseTo(expectedFor(8_000), 6);
    });

    it('aucun avoir taxable ⇒ 0 (liste vide, fxRates undefined toléré)', () => {
        expect(estimateTaxableInvestmentIncome([], undefined)).toBe(0);
    });
});
