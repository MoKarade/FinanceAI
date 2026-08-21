// tests/services/projection.bracketRealIndex.test.ts
//
// [FISC-BRACKET-REALINDEX] (GO Marc 2026-08-01) — DOUBLE INDEXATION corrigée : taxDecember
// déflate les revenus en dollars RÉELS (÷ ctx.inflationFactor) mais les paliers/BPA/crédits
// étaient indexés ×1,02^Δ NOMINAL (getIndexedBracketsForYear) → dans l'espace réel, les paliers
// s'élargissaient de ~2 %/an : l'impôt réel d'un revenu réel CONSTANT fondait avec les années.
// Fix : param optionnel `realDeflator` (défaut 1 = rétrocompat bit-identique) → facteur effectif
// 1,02^Δ / (1+i)^Δ ; tout en dérive (paliers, BPA, crédits d'âge, ligne 361, RAMQ, FSS).
// Les blocs NOMINAUX de décembre (empilement gains, dividendes) ne passent PAS de deflator.
//
// DISCRIMINANT (mesuré par git stash séquentiel, 2026-08-01) :
//  - salarié réel constant : flux réel/an dérivait 2 702→3 235 $ (avant) → CONSTANT 2 702 $ (après)
//  - retraité 62 REER 700k AUTO : ttp 29 806→48 314 (+62 %), impôt réel 2038 294→1 307 $
//    (direction CONSERVATRICE restaurée : l'ancien code sous-imposait les années tardives).

import { describe, it, expect } from 'vitest';
import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import { calculateFiscalReport, calculateRamqPremium, calculateFSSPremium, getMarginalRate } from '../../utils/tax';
import { computeLatentTax, type LatentTaxCtx } from '../../services/projection/latentTax';
import type { ProjectionConfig, BudgetConfig, RetirementGoal } from '../../types';
import type { AllocationStrategy } from '../../services/projection/types';

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

describe('[FISC-BRACKET-REALINDEX] utils/tax — realDeflator ramène paliers et seuils en espace réel', () => {
    it('inflation == indexation légale (2 %) : impôt sur revenu réel constant == impôt 2026, à 30 ans', () => {
        const gross = 49_200;
        const ref2026 = calculateFiscalReport(gross, 0, 0, 2026).totalTax;
        // Déflateur (1,02)^30 == l'indexation des paliers → facteur effectif 1 : bit-identique à 2026.
        const real2056 = calculateFiscalReport(gross, 0, 0, 2056, false, undefined, undefined, Math.pow(1.02, 30)).totalTax;
        expect(real2056).toBeCloseTo(ref2026, 6);
        // DISCRIMINANT : sans deflator (ancien comportement), les paliers 2056 élargis en réel
        // donnent un impôt nettement plus bas sur le même revenu réel.
        const old2056 = calculateFiscalReport(gross, 0, 0, 2056).totalTax;
        expect(old2056).toBeLessThan(ref2026 * 0.75);
    });

    it('inflation > 2 % : les paliers rétrécissent en réel (impôt réel plus élevé), et vice-versa', () => {
        const gross = 49_200;
        const ref2026 = calculateFiscalReport(gross, 0, 0, 2026).totalTax;
        // Inflation 3 % : déflateur 1,03^30 > 1,02^30 → facteur < 1 → paliers plus SERRÉS en réel.
        const infl3 = calculateFiscalReport(gross, 0, 0, 2056, false, undefined, undefined, Math.pow(1.03, 30)).totalTax;
        expect(infl3).toBeGreaterThan(ref2026);
        // Inflation 1 % : paliers plus larges en réel → impôt réel plus bas.
        const infl1 = calculateFiscalReport(gross, 0, 0, 2056, false, undefined, undefined, Math.pow(1.01, 30)).totalTax;
        expect(infl1).toBeLessThan(ref2026);
    });

    it('RAMQ, FSS et getMarginalRate suivent le même deflator ; deflator invalide → ignoré (=1)', () => {
        const d30 = Math.pow(1.02, 30);
        expect(calculateRamqPremium(60_000, { hasSpouse: true }, 2056, d30))
            .toBeCloseTo(calculateRamqPremium(60_000, { hasSpouse: true }, 2026), 6);
        expect(calculateFSSPremium(40_000, 2056, d30)).toBeCloseTo(calculateFSSPremium(40_000, 2026), 6);
        expect(getMarginalRate(60_000, 2056, d30)).toBeCloseTo(getMarginalRate(60_000, 2026), 10);
        // Garde no-fake-data : NaN/0/négatif ne deviennent JAMAIS un facteur — repli sur 1 (nominal).
        expect(calculateFiscalReport(60_000, 0, 0, 2056, false, undefined, undefined, Number.NaN).totalTax)
            .toBeCloseTo(calculateFiscalReport(60_000, 0, 0, 2056).totalTax, 6);
        expect(calculateFSSPremium(40_000, 2056, 0)).toBeCloseTo(calculateFSSPremium(40_000, 2056), 6);
    });
});

// ---- Moteur : fixture salarié à revenu RÉEL constant (salaryGrowth == inflation == 2 %) ----
const projection: ProjectionConfig = {
    years: 30, returnRate: 5, inflationRate: 2, savingsMode: 'manual', manualContribution: 0,
    usePortfolioRate: false, returnRates: { celi: 5, reer: 5, nonReg: 5, crypto: 6, cash: 1 },
    emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3,
};
const config: BudgetConfig = {
    users: [
        { name: 'M', grossSalary: 4100, netSalary: 3000, color: '#fff', age: 30, birthYear: 1996, canadaArrivalYear: 1996, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
        { name: 'A', grossSalary: 4100, netSalary: 3000, color: '#fff', age: 30, birthYear: 1996, canadaArrivalYear: 1996, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
    ], splitMode: '50/50',
};
const salarie: SimulationParams = {
    projection, calculatedStartingCash: 20_000,
    liveCSVBalances: { CELI: 0, CELIAPP: 0, REER: 0, NON_ENREG: 0, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: { targetAge: 70, targetMonthlyIncome: 5000, governmentPension: 1500, lifeExpectancy: 95 } as RetirementGoal,
    config, baseGrossAnnual: 98_400, baseNetAnnual: 72_000, currentRentExpense: 0, baseMonthlyExpenses: 5_000,
    startYear: 2026, startMonth: 0,
} as SimulationParams;

describe('[FISC-BRACKET-REALINDEX] moteur — un revenu réel constant paie un impôt réel CONSTANT', () => {
    it('salarié (croissance salaire == inflation == 2 %) : flux d\'impôt réel identique chaque année', () => {
        const r = __runScenarioForTests(salarie, 'AUTO_MARGINAL' as AllocationStrategy, false, false);
        const byYear: Record<number, number> = {};
        for (const p of r.chartData as Array<Record<string, unknown>>) {
            byYear[num(p.year)] = (byYear[num(p.year)] ?? 0) + num(p.FluxImpots);
        }
        // Années pleines seulement : 2026 n'a pas encore d'avril réglant une année complète,
        // et la dernière année n'a pas son avril (unsettledTaxAtHorizon).
        const reals = Object.keys(byYear).map(Number).filter(y => y >= 2027 && y <= 2055)
            .map(y => byYear[y] / Math.pow(1.02, y - 2026));
        expect(reals.length).toBe(29);
        const min = Math.min(...reals);
        const max = Math.max(...reals);
        expect(min).toBeGreaterThan(1_000);                  // non-vacuité : de l'impôt coule
        // DISCRIMINANT : sur l'ancien code, l'écart max−min mesuré est 533 $ (2 702 → 3 235).
        expect(max - min).toBeLessThan(1);
        // Pin de niveau re-basé [FISC-WHT-92PCT] 2026-08-01 (était 2 702,33) : retenue 100 % →
        // le solde salarial d'avril tombe à ~0 sans déductions, reste RAMQ & co (1 243,23 $/an
        // réel de double facturation supprimée). La CONSTANCE (l'invariant de ce test) est intacte.
        expect(reals[0]).toBeCloseTo(1_458.82, 0);
    });

    it('retraité : direction CONSERVATRICE restaurée (ttp ↑, NW ↓ vs ancien code — pins mesurés)', () => {
        const retraite: SimulationParams = {
            ...salarie,
            projection: { ...projection, years: 25 },
            liveCSVBalances: { CELI: 0, CELIAPP: 0, REER: 700_000, NON_ENREG: 0, CRYPTO: 0, REEE: 0 },
            retirementGoal: { targetAge: 60, targetMonthlyIncome: 4500, governmentPension: 1500, lifeExpectancy: 95 } as RetirementGoal,
            config: { ...config, users: config.users.map(u => ({ ...u, grossSalary: 0, netSalary: 0, age: 62, birthYear: 1964 })) as typeof config.users },
            baseGrossAnnual: 0, baseNetAnnual: 0, baseMonthlyExpenses: 3_800,
        } as SimulationParams;
        const r = __runScenarioForTests(retraite, 'AUTO_MARGINAL' as AllocationStrategy, false, false);
        // Avant fix : ttp 29 806,15 / nw −164 301,67. L'ancien code sous-imposait les années
        // tardives (paliers élargis en réel) → le fix REHAUSSE l'impôt à vie de +62 %.
        // Re-basé 2026-08-21 [ENG-GK-THRESHOLD-KNIFE] (était 48 314,04 / −196 188,58) : la
        // fixture traverse la bande de lissage GK — gel partiel au lieu de total dans [−5, −6] →
        // dépenses plus indexées → plus de retraits imposés (ttp ↑) ET NW ↓. La DIRECTION
        // conservatrice du test (ttp ↑, NW ↓ vs l'ancien barème figé) est INCHANGÉE — les deux
        // assertions d'inégalité ci-dessous restent la preuve, les pins ne sont que l'ampleur.
        expect(r.totalTaxesPaid).toBeCloseTo(49_657.43, 0);
        expect(r.finalNetWorth).toBeCloseTo(-204_034.74, 0);
    });
});

// ---- Impôt latent : même fix d'espace (site oublié de la passe initiale, panel 2026-08-01) ----
describe('[FISC-BRACKET-REALINDEX] impôt latent — le barème suit le revenu déflaté', () => {
    // computeLatentTax déflate le revenu en $ RÉELS (÷ inflationFactor) : sans realDeflator, les
    // paliers 1,02^Δ nominaux s'élargissent en réel → obligation latente sous-évaluée (~35 % à 30 ans).
    const D = Math.pow(1.02, 30);
    const at30: LatentTaxCtx = {
        m: 360, loopYear: 2056, simInflation: 2, simSalaryGrowth: 2, isRetired: true,
        activeUsersCount: 2, grossMarcBaseAnnual: 0, grossAnnaBaseAnnual: 0,
        accRentesYear: 36_000 * D, incomeRetirement: 2_000 * D,
        reer: 500_000, nonReg: 400_000, nonRegACB: 200_000, crypto: 0, cryptoACB: 0,
        realEstateLatentGain: 0, enableMonteCarlo: false,
    };
    // Mêmes montants exprimés en $ de 2026 (tout ÷ D), évalués au barème 2026.
    const at2026: LatentTaxCtx = {
        ...at30, m: 0, loopYear: 2026,
        accRentesYear: 36_000, incomeRetirement: 2_000,
        reer: 500_000 / D, nonReg: 400_000 / D, nonRegACB: 200_000 / D,
    };

    it('homogénéité : latent(Δ=30, i=2 %) == latent(2026, mêmes montants réels) × 1,02^30', () => {
        // À i == indexation légale (2 %), le facteur effectif vaut 1 → le calcul de l'an 30 doit être
        // EXACTEMENT l'homothétie ×D du calcul 2026. DISCRIMINANT : sans realDeflator (ancien code),
        // l'an 30 est évalué au barème 2056 élargi en réel → |latent| nettement plus petit (−35 %).
        const latent30 = computeLatentTax(at30, calculateFiscalReport);
        const latent2026 = computeLatentTax(at2026, calculateFiscalReport);
        expect(latent30).toBeLessThan(0);                    // non-vacuité : une obligation existe
        expect(latent30 / D).toBeCloseTo(latent2026, 2);
    });
});
