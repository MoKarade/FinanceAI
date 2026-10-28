// tests/services/lifetimeTax.test.ts
//
// [TEST-GAP-LIFETIMETAX] (audit 2026-09-07) `lifetimeTaxTotal` était le seul des 57 sous-modules du
// moteur sans import direct depuis `tests/` — il n'était exercé qu'à travers le classement de
// stratégies (`strategySearch`, `monteCarlo`), c'est-à-dire là où une valeur fausse se voit le moins :
// une somme qui oublie un terme ne casse aucun test de classement tant que l'ordre tient.
import { describe, it, expect } from 'vitest';
import { lifetimeTaxTotal } from '../../services/projection/lifetimeTax';

describe('[TEST-GAP-LIFETIMETAX] lifetimeTaxTotal — la somme des TROIS registres, rien de plus', () => {
    it('somme réglé du vivant + dette à l’horizon (signée) + successoral', () => {
        expect(lifetimeTaxTotal({ totalTaxesPaid: 100_000, unsettledTaxAtHorizon: -2_500, totalEstateTax: 40_000 }))
            .toBe(137_500);
    });

    it('chaque terme COMPTE : retirer l’un des trois change la somme (anti-vacuité par terme)', () => {
        const base = { totalTaxesPaid: 100_000, unsettledTaxAtHorizon: 5_000, totalEstateTax: 40_000 };
        const total = lifetimeTaxTotal(base);
        expect(lifetimeTaxTotal({ ...base, totalTaxesPaid: undefined })).toBe(total - 100_000);
        expect(lifetimeTaxTotal({ ...base, unsettledTaxAtHorizon: undefined })).toBe(total - 5_000);
        expect(lifetimeTaxTotal({ ...base, totalEstateTax: undefined })).toBe(total - 40_000);
    });

    it('un terme NON FINI compte pour 0 sans contaminer les autres (défense en profondeur)', () => {
        expect(lifetimeTaxTotal({ totalTaxesPaid: NaN, unsettledTaxAtHorizon: 5_000, totalEstateTax: 40_000 })).toBe(45_000);
        expect(lifetimeTaxTotal({ totalTaxesPaid: 1, unsettledTaxAtHorizon: Infinity, totalEstateTax: 2 })).toBe(3);
        expect(Number.isFinite(lifetimeTaxTotal({ totalTaxesPaid: -Infinity }))).toBe(true);
    });

    it('scénario absent (null / undefined / objet vide) → 0, jamais une exception ni un NaN', () => {
        expect(lifetimeTaxTotal(null)).toBe(0);
        expect(lifetimeTaxTotal(undefined)).toBe(0);
        expect(lifetimeTaxTotal({})).toBe(0);
    });
});
