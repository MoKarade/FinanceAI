import { describe, it, expect } from 'vitest';
import { computeEstateNetWorth, type EstateCalcInputs } from '../../services/projection/estateCalculation';
import type { FiscalReport } from '../../utils/tax';

// Stub fiscal : computeEstateNetWorth ne lit que report.totalTax.
const fiscalStub = (gross: number): FiscalReport =>
    ({ totalTax: Math.max(0, gross) * 0.3 } as FiscalReport);

const base: EstateCalcInputs = {
    liquid: 50000, celi: 100000, celiapp: 0, reer: 200000, nonReg: 80000, nonRegACB: 60000,
    crypto: 10000, cryptoACB: 0, reee: 20000, realEstateEquity: 300000, mortgageBalance: 150000, smithManoeuvreDebt: 0,
    incomeRetirement: 4000, accRentesYear: 0, accRetraitsReerYear: 0,
    grossMarcBaseAnnual: 70000, grossAnnaBaseAnnual: 0, simSalaryGrowth: 2,
    simulationYears: 30, startYear: 2026, currentAge: 35, retirementTargetAge: 65,
    governmentPension: 1200, activeUsersCount: 1, simInflation: 2, enableMonteCarlo: false,
    startingCash: 50000, startingCELI: 100000, startingCELIAPP: 0, startingREER: 200000,
    startingNonReg: 80000, startingCrypto: 10000, startingREEE: 20000,
};

describe('computeEstateNetWorth — robustesse aux entrées (garde TB3)', () => {
    it('calcule un patrimoine fini avec des entrées valides', () => {
        const r = computeEstateNetWorth(base, fiscalStub);
        expect(Number.isFinite(r.finalRawNetWorth)).toBe(true);
        expect(Number.isFinite(r.estateNetWorth)).toBe(true);
        // realEstateEquity (300k) est DÉJÀ net d'hypothèque → plus de soustraction
        // de mortgageBalance (fix double-comptage 2026-05).
        // 50k+100k+0+200k+80k+10k+20k+300k −0(smith) = 760k
        expect(r.finalRawNetWorth).toBe(760000);
        expect(r.estateNetWorth).toBeGreaterThan(0);
    });

    it('TB3 : un liquide NaN ne zérote PAS tout le patrimoine (contribue 0)', () => {
        const r = computeEstateNetWorth({ ...base, liquid: NaN }, fiscalStub);
        expect(Number.isFinite(r.finalRawNetWorth)).toBe(true);
        expect(Number.isFinite(r.estateNetWorth)).toBe(true);
        // liquid NaN → 0 : 760000 - 50000
        expect(r.finalRawNetWorth).toBe(710000);
    });

    it('TB3 : un champ de config undefined (coercé NaN) reste fini', () => {
        const r = computeEstateNetWorth(
            { ...base, governmentPension: undefined as unknown as number, incomeRetirement: NaN },
            fiscalStub,
        );
        expect(Number.isFinite(r.estateNetWorth)).toBe(true);
        expect(Number.isFinite(r.totalEstateTax)).toBe(true);
    });

    it('TB3 : plusieurs soldes NaN simultanés restent finis', () => {
        const r = computeEstateNetWorth(
            { ...base, celi: NaN, reer: NaN, nonReg: NaN, realEstateEquity: NaN },
            fiscalStub,
        );
        expect(Number.isFinite(r.finalRawNetWorth)).toBe(true);
        expect(Number.isFinite(r.estateNetWorth)).toBe(true);
        // realEstateEquity NaN→0 ; seuls liquid(50k)+crypto(10k)+reee(20k) restent.
        // Plus de soustraction d'hypothèque → 80000 (au lieu de l'ancien -70000).
        expect(r.finalRawNetWorth).toBe(80000);
    });

    it('M-2 : impôt successoral cohérent en couple (base et final à la même échelle)', () => {
        // Stub plat 30 %. Liquidation = reer(200k) + gains NonReg imposables(20k×0.5=10k)
        // + crypto imposable(10k×0.5=5k) = 215 000. Revenu retraite final = 4000×12 = 48 000.
        // Symétrique : totalEstateTax = 0.3×(48 000+215 000) − 0.3×48 000 = 0.3×215 000 = 64 500,
        // INDÉPENDANT de activeUsersCount. (Avant le fix, N=2 donnait 71 700 — terme parasite
        // 0.3×24 000 dû à la base divisée par 2.)
        const single = computeEstateNetWorth({ ...base, activeUsersCount: 1 }, fiscalStub);
        const couple = computeEstateNetWorth({ ...base, activeUsersCount: 2 }, fiscalStub);
        expect(single.totalEstateTax).toBeCloseTo(64500, 0);
        expect(couple.totalEstateTax).toBeCloseTo(64500, 0); // même impôt incrémental, peu importe N
    });

    it('M-4 : seul le GAIN crypto est imposable au décès (coût de base déduit)', () => {
        // crypto 10000. ACB=0 → gain 10000 (taxable 5000) ; ACB=10000 → gain 0.
        const allGain = computeEstateNetWorth({ ...base, crypto: 10000, cryptoACB: 0 }, fiscalStub);
        const noGain = computeEstateNetWorth({ ...base, crypto: 10000, cryptoACB: 10000 }, fiscalStub);
        expect(noGain.totalEstateTax).toBeLessThan(allGain.totalEstateTax);
        // écart = impôt (stub 0.3) sur la portion gain imposable : 0.3 × (10000 × 0.5) = 1500.
        expect(allGain.totalEstateTax - noGain.totalEstateTax).toBeCloseTo(1500, 0);
    });

    it('startNW fini même si soldes initiaux NaN', () => {
        const r = computeEstateNetWorth(
            { ...base, startingCash: NaN, startingREER: NaN },
            fiscalStub,
        );
        expect(Number.isFinite(r.startNW)).toBe(true);
        // 0 + 100k + 0 + 0 + 80k + 10k + 20k
        expect(r.startNW).toBe(210000);
    });
});
