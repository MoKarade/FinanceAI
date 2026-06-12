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

    // RE-GAIN-SUCC — disposition réputée au décès : gain latent locatif imposable à 50 %.
    it('RE-GAIN-SUCC : un gain latent locatif augmente l\'impôt successoral (50 % × taux) et réduit estateNetWorth', () => {
        const without = computeEstateNetWorth(base, fiscalStub);
        const withGain = computeEstateNetWorth({ ...base, realEstateLatentGain: 200000 }, fiscalStub);
        // liquidation additionnelle = 0,5 × 200000 = 100000 ; impôt (stub 30 %) = +30000.
        expect(withGain.totalEstateTax - without.totalEstateTax).toBeCloseTo(30000, 0);
        expect(withGain.estateNetWorth).toBeLessThan(without.estateNetWorth);
    });

    it('PV-6 : un liquidDebt (insolvabilité) réduit finalRawNetWorth et estateNetWorth $-pour-$', () => {
        const without = computeEstateNetWorth(base, fiscalStub);
        const withDebt = computeEstateNetWorth({ ...base, liquidDebt: 40000 }, fiscalStub);
        expect(without.finalRawNetWorth - withDebt.finalRawNetWorth).toBeCloseTo(40000, 0);
        expect(withDebt.estateNetWorth).toBeLessThan(without.estateNetWorth);
    });

    it('PV-6 : liquidDebt absent == 0 (non-régression)', () => {
        const absent = computeEstateNetWorth(base, fiscalStub);
        const zero = computeEstateNetWorth({ ...base, liquidDebt: 0 }, fiscalStub);
        expect(zero.estateNetWorth).toBe(absent.estateNetWorth);
    });

    it('RE-GAIN-SUCC : absent == 0 (non-régression stricte)', () => {
        const absent = computeEstateNetWorth(base, fiscalStub);
        const zero = computeEstateNetWorth({ ...base, realEstateLatentGain: 0 }, fiscalStub);
        expect(zero.estateNetWorth).toBe(absent.estateNetWorth);
        expect(zero.totalEstateTax).toBe(absent.totalEstateTax);
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

describe('computeEstateNetWorth — FA-5 (audit 2026-06-09) : NPV des rentes NON multipliée par N', () => {
    // `governmentPension` est déjà FAMILIAL dans tout le moteur (retirementIncome ne multiplie
    // pas par N). L'ancien code multipliait rrqExpected/psvExpected par activeUsersCount →
    // NPV ~doublée pour un couple → estateNetWorth gonflé de dizaines de k$.
    // Extraction : estateNetWorth = finalRawNetWorth − totalEstateTax + 0,7×(rrqNPV+psvNPV)
    //   → (rrqNPV+psvNPV) = (estateNetWorth − finalRawNetWorth + totalEstateTax) / 0,7.
    const extractNPV = (r: ReturnType<typeof computeEstateNetWorth>): number =>
        (r.estateNetWorth - r.finalRawNetWorth + r.totalEstateTax) / 0.7;

    it('RÉGRESSION : couple et solo au même governmentPension familial → même (rrqNPV+psvNPV)', () => {
        const solo = computeEstateNetWorth({ ...base, activeUsersCount: 1 }, fiscalStub);
        const couple = computeEstateNetWorth({ ...base, activeUsersCount: 2 }, fiscalStub);
        expect(extractNPV(couple)).toBeCloseTo(extractNPV(solo), 6);
        // Le stub fiscal est plat → totalEstateTax identique (M-2) → le patrimoine successoral
        // COMPLET doit être identique solo vs couple. Avant FA-5 : couple = solo + 0,7×NPV en trop.
        expect(couple.estateNetWorth).toBeCloseTo(solo.estateNetWorth, 6);
    });

    it('NPV PINNÉE à la formule FAMILIALE (sans ×N) : pension×infl^années×facteur d\'annuité', () => {
        // base : finalAge = 35+30 = 65 → branche SANS escompte pré-65 ; 95−65 = 30 ans restants.
        const npvFactor = (1 - Math.pow(1.02, -30)) / 0.02;
        const expected = 1200 * Math.pow(1 + 2 / 100, 30) * npvFactor; // (0,65+0,35) = 1 → familial
        const couple = computeEstateNetWorth({ ...base, activeUsersCount: 2 }, fiscalStub);
        expect(extractNPV(couple)).toBeCloseTo(expected, 4);
        // Contre-preuve : l'ancienne valeur ×2 (≈ 97 k$ au lieu de ≈ 49 k$) est exclue.
        expect(extractNPV(couple)).toBeLessThan(expected * 2 - 1000);
    });

    it('équivalence solo/couple maintenue AVANT 65 ans (branche escomptée 1,02^-(65-âge))', () => {
        const cfg = { ...base, simulationYears: 20 }; // finalAge 55 < 65 → escompte sur 10 ans
        const solo = computeEstateNetWorth({ ...cfg, activeUsersCount: 1 }, fiscalStub);
        const couple = computeEstateNetWorth({ ...cfg, activeUsersCount: 2 }, fiscalStub);
        expect(extractNPV(couple)).toBeCloseTo(extractNPV(solo), 6);
        expect(extractNPV(couple)).toBeGreaterThan(0);
    });

    it('governmentPension = 0 → composante NPV nulle, peu importe N', () => {
        const solo = computeEstateNetWorth({ ...base, governmentPension: 0, activeUsersCount: 1 }, fiscalStub);
        const couple = computeEstateNetWorth({ ...base, governmentPension: 0, activeUsersCount: 2 }, fiscalStub);
        expect(extractNPV(solo)).toBeCloseTo(0, 6);
        expect(extractNPV(couple)).toBeCloseTo(0, 6);
    });

});

describe('computeEstateNetWorth — FA-8 : estimés précis par rente priment sur le split 65/35', () => {
    const extractNPV = (r: ReturnType<typeof computeEstateNetWorth>): number =>
        (r.estateNetWorth - r.finalRawNetWorth + r.totalEstateTax) / 0.7;
    // base : finalAge 35+30 = 65 → branche SANS escompte pré-65 ; 95−65 = 30 ans restants.
    const npvFactor = (1 - Math.pow(1.02, -30)) / 0.02;
    const inflPow = Math.pow(1 + 2 / 100, 30);

    it('estimés fournis (solo) → NPV basée sur RRQ+PSV estimés, PAS sur le split 65/35 de l\'agrégé', () => {
        // estimés per-personne 800+600 = 1400/mois familial (solo) ≠ split de governmentPension (1200).
        const r = computeEstateNetWorth({ ...base, rrqEstimateMonthly: 800, psvEstimateMonthly: 600, activeUsersCount: 1 }, fiscalStub);
        expect(extractNPV(r)).toBeCloseTo((800 + 600) * inflPow * npvFactor, 4);
        // Contre-preuve : différent du repli agrégé (1200) — les estimés ont bien primé.
        const fallback = computeEstateNetWorth({ ...base, activeUsersCount: 1 }, fiscalStub);
        expect(extractNPV(r)).not.toBeCloseTo(extractNPV(fallback), 0);
    });

    it('estimés PER-PERSONNE → ×activeUsersCount (comme retirementIncome) ; le repli AGRÉGÉ reste SANS ×N (garde FA-5)', () => {
        // couple : estimés (800+600)×2 = 2800/mois familial.
        const couple = computeEstateNetWorth({ ...base, rrqEstimateMonthly: 800, psvEstimateMonthly: 600, activeUsersCount: 2 }, fiscalStub);
        expect(extractNPV(couple)).toBeCloseTo((800 + 600) * 2 * inflPow * npvFactor, 4);
        // Le repli agrégé (sans estimé) ne prend toujours PAS de ×N : couple == solo (FA-5 non régressé).
        const fallbackCouple = computeEstateNetWorth({ ...base, activeUsersCount: 2 }, fiscalStub);
        expect(extractNPV(fallbackCouple)).toBeCloseTo(1200 * inflPow * npvFactor, 4);
    });

    it('estimés absents → repli sur le split 65/35 (non-régression stricte)', () => {
        const withUndef = computeEstateNetWorth({ ...base, rrqEstimateMonthly: undefined, psvEstimateMonthly: undefined }, fiscalStub);
        const baseline = computeEstateNetWorth(base, fiscalStub);
        expect(withUndef.estateNetWorth).toBe(baseline.estateNetWorth);
    });

    it('un seul estimé fourni → indépendance par rente : l\'estimé pour la sienne, le split 65/35 pour l\'autre', () => {
        // rrqEstimate 900 fourni, psv absent → psv = 0,35 × 1200 = 420. Σ = 1320.
        const r = computeEstateNetWorth({ ...base, rrqEstimateMonthly: 900, activeUsersCount: 1 }, fiscalStub);
        expect(extractNPV(r)).toBeCloseTo((900 + 1200 * 0.35) * inflPow * npvFactor, 4);
    });
});
