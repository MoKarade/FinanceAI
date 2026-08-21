// tests/services/divDerivedBases.test.ts
//
// [FISC-DIV-DERIVED-BASES] (panel #564) — deux assiettes dérivées ignoraient le dividende
// MAJORÉ alors qu'elles incluent les gains : l'assiette FSS (§1.6) et le revenu de récupération
// PSV (ligne 23400 ARC). Toutes les valeurs pinnées sont MESURÉES.
import { describe, it, expect } from 'vitest';
import { processDecemberTaxFiling, computeOasClawback, computeAnnualNonRegDividends, type DecemberContext, type DecemberHelpers } from '../../services/projection/taxDecember';
import { calculateFiscalReport, getMarginalRate, calculateDividendTax, getDividendGrossUpRate } from '../../utils/tax';

const helpers: DecemberHelpers = { calculateFiscalReport, getMarginalRate, calculateDividendTax, getDividendGrossUpRate };
const ZERO_TAX = { revenu: 0, gains: 0, divers: 0, reer: 0, donCredit: 0 };
const ctx = (o: Partial<DecemberContext>): DecemberContext => ({
    isRetired: true, age: 70, ageSpouse: 70, activeUsersCount: 2,
    incomeRetirementMonthly: 60_000 / 12, accRentesYear: 0, accRetraitsReerYear: 0,
    accCapitalGainsYear: 0, nonReg: 0, baseNonRegRate: 0,
    grossMarcBaseAnnual: 0, grossAnnaBaseAnnual: 0, simSalaryGrowth: 0, yearsElapsed: 0,
    loopYear: 2026, enableMonteCarlo: false, inflationFactor: 1, ramqExempt: true,
    ...o,
} as unknown as DecemberContext);

describe('[FISC-DIV-DERIVED-BASES] le dividende majoré entre dans les assiettes dérivées', () => {
    it('FSS : un non-enregistré à dividendes AUGMENTE la cotisation (mesuré +70 $/ménage)', () => {
        const sans = processDecemberTaxFiling(11, ctx({}), helpers, ZERO_TAX);
        const avec = processDecemberTaxFiling(11, ctx({ nonReg: 500_000, baseNonRegRate: 5 }), helpers, ZERO_TAX);
        // divers contient FSS (+RAMQ exemptée ici). Le delta FSS mesuré : 2 × 35 = 70 $ — mais
        // `divers` porte AUSSI l'impôt des dividendes… non : l'impôt du §3 va à `gains`. On isole
        // le delta de `divers` : seul le FSS bouge entre les deux contextes.
        const delta = avec.newTaxCurrentYear.divers - sans.newTaxCurrentYear.divers;
        expect(delta).toBeCloseTo(70, 0);
        expect(delta).toBeGreaterThan(0); // ancre de sens : l'ancienne assiette rendait 0
    });

    it('PSV : la récupération voit le dividende majoré (mesuré +1 552,50 $/an, couple riche)', () => {
        // ⚠️ Le premier chiffrage (jetable) disait +3 006 $ : il oubliait la part distribuée
        // (NONREG_DIVIDEND_DISTRIBUTION_SHARE = 0,3) — les pins ci-dessous viennent de la VRAIE
        // formule (source unique). Couple 100 k$/conjoint : le majoré per-conjoint (5 175 $)
        // franchit le seuil indexé ; à 90 k$/conjoint le delta est 0 (sous le seuil, testé).
        const grossedUp = computeAnnualNonRegDividends(500_000, 5) * getDividendGrossUpRate('eligible');
        expect(grossedUp).toBeCloseTo(10_350, 2);
        const sans = computeOasClawback(11, 12, true, 70, 1, 200_000 / 12, 0, 0, 600, 2, 2, undefined, undefined, 0, 600, 0);
        const avec = computeOasClawback(11, 12, true, 70, 1, 200_000 / 12, 0, 0, 600, 2, 2, undefined, undefined, 0, 600, grossedUp);
        expect(avec.clawbackAnnual - sans.clawbackAnnual).toBeCloseTo(1552.50, 1);
        const sousSeuiln = computeOasClawback(11, 12, true, 70, 1, 180_000 / 12, 0, 0, 600, 2, 2, undefined, undefined, 0, 600, grossedUp);
        expect(sousSeuiln.clawbackAnnual).toBeCloseTo(0, 2); // sous le seuil : rien, pas d'invention
    });

    it('rétro-compat : dividende omis (défaut 0) → bit-identique à l\'ancien calcul', () => {
        const legacy = computeOasClawback(11, 12, true, 70, 1, 180_000 / 12, 0, 0, 600, 2, 2, undefined, undefined, 0, 600);
        expect(legacy.clawbackAnnual).toBeCloseTo(0, 6);
    });

    it('la source unique est UNE formule (3 sites la consomment, aucun ne la recopie)', () => {
        // 500 k$ × 5 % × part distribuée 0,3 = 7 500 $ de dividendes cash.
        expect(computeAnnualNonRegDividends(500_000, 5)).toBeCloseTo(7_500, 6);
        expect(computeAnnualNonRegDividends(Number.NaN, 5)).toBe(0);
        expect(computeAnnualNonRegDividends(500_000, Number.NaN)).toBe(0);
    });
});
