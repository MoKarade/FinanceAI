/**
 * [WHT-DISPLAY-MELTDOWN + ENG-MELTDOWN-FLOW-INVISIBLE] (V2, findings financial-integrity
 * MESURÉS 2026-07-31) — le meltdown REER doit alimenter les compteurs d'AFFICHAGE comme
 * les tirages en cascade :
 *  1. `chartData.RetraitREER` : l'ancien code rendait ~4 % des sorties réelles visibles
 *     (mesuré SUR CE scénario : 30 496 $ affichés pour 794 303 $ tirés) →
 *     tooltip/modal/milestoneIcons/MCP aveugles.
 *  2. `totalTaxesPaid` : la retenue du meltdown n'y entrait jamais → convention DIFFÉRENTE
 *     des autres stratégies (mesuré : 137 940 $ vs 229 338 $ AUTO, ratio 0,601) —
 *     `strategyRanking` (poids 25-100 % sur ce compteur) recommandait MELTDOWN_REER à tort
 *     sous l'objectif « impôt » (corrigé, mesuré). ⚠️ Le compteur double-compte la retenue
 *     pour TOUTES les stratégies (pré-existant) : ticket [PROJ-TTP-DOUBLECOUNT].
 * Discriminant prouvé par restauration du code d'avant (les deux assertions échouent).
 * Aucun impact NW : PROUVÉ bit-identique par le validator (301 mois × 9 grandeurs) et
 * pinné par le golden de neutralité ci-dessous.
 */
import { describe, it, expect } from 'vitest';
import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal } from '../../types';
import type { AllocationStrategy } from '../../services/projection/types';

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

const REER_START = 700_000;

const projection: ProjectionConfig = {
    years: 25,
    returnRate: 5,
    inflationRate: 2,
    savingsMode: 'manual',
    manualContribution: 0,
    usePortfolioRate: false,
    returnRates: { celi: 5, reer: 5, nonReg: 5, crypto: 6, cash: 1 },
    emergencyFundMonths: 6,
    salaryGrowth: 2,
    propertyGrowthRate: 3,
};

// Couple DÉJÀ retraité (62 ans) à gros REER — le profil mesuré par l'analyse fiscale.
const config: BudgetConfig = {
    users: [
        { name: 'Marc', grossSalary: 0, netSalary: 0, color: '#10b981', age: 62, birthYear: 1964, canadaArrivalYear: 1964, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
        { name: 'Anna', grossSalary: 0, netSalary: 0, color: '#3b82f6', age: 62, birthYear: 1964, canadaArrivalYear: 1964, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
    ],
    splitMode: '50/50',
};

const retirementGoal: RetirementGoal = { targetAge: 60, targetMonthlyIncome: 4500, governmentPension: 1500, lifeExpectancy: 95 };

const params: SimulationParams = {
    projection,
    calculatedStartingCash: 20_000,
    liveCSVBalances: { CELI: 0, CELIAPP: 0, REER: REER_START, NON_ENREG: 0, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [],
    debts: [],
    childGoals: [],
    travelGoals: [],
    lifeEvents: [],
    retirementGoal,
    config,
    baseGrossAnnual: 0,
    baseNetAnnual: 0,
    currentRentExpense: 0,
    baseMonthlyExpenses: 3_800,
    startYear: 2026,
    startMonth: 0,
} as SimulationParams;

const runWith = (strategy: AllocationStrategy) => __runScenarioForTests(params, strategy, false, false);

describe('Meltdown REER — compteurs d\'affichage honnêtes', () => {
    it('les retraits du meltdown sont VISIBLES dans chartData.RetraitREER (≥ 90 % du REER drainé)', () => {
        const melt = runWith('MELTDOWN_REER' as AllocationStrategy);
        const cd = melt.chartData;
        const sumRetraits = cd.reduce((s, d) => s + num(d.RetraitREER), 0);
        const reerEnd = num(cd[cd.length - 1].REER);
        const drained = REER_START - reerEnd;
        // Non-vacuité : le scénario melt VRAIMENT (sinon le test ne prouve rien).
        expect(drained).toBeGreaterThan(300_000);
        // Ancien code mesuré : ratio 0,044 → échoue. Nouveau : 1,135 (croissance incluse).
        expect(sumRetraits).toBeGreaterThanOrEqual(0.9 * drained);
    });

    it('totalTaxesPaid compte la retenue du meltdown (plus jamais << AUTO_MARGINAL pour un estate ≥)', () => {
        const melt = runWith('MELTDOWN_REER' as AllocationStrategy);
        const auto = runWith('AUTO_MARGINAL' as AllocationStrategy);
        // Ancien code mesuré : 137 940 / 229 338 = 0,601 → échoue à 0,8. Nouveau : 1,400.
        expect(auto.totalTaxesPaid).toBeGreaterThan(0);
        expect(melt.totalTaxesPaid / auto.totalTaxesPaid).toBeGreaterThan(0.8);
    });

    it('[ENG-FERR-FLOW-INVISIBLE] la FERR obligatoire (71+) est VISIBLE dans RetraitREER (4e source)', () => {
        // Fixture où la FERR DOMINE : pension publique couvre les dépenses (cascade ≈ 0),
        // couple 73 ans → conversions FERR obligatoires chaque janvier. Ancien code : la FERR
        // n'alimentait pas retraitReerMois → Σ RetraitREER ≈ 0 pour un REER pourtant drainé
        // (mesuré panel #551 : 113 418 $ = 11,6 % invisibles sur AUTO_MARGINAL) → ÉCHOUE avant.
        const ferrParams = {
            ...params,
            projection: { ...projection, years: 10, returnRates: { celi: 3, reer: 3, nonReg: 3, crypto: 4, cash: 1 } },
            liveCSVBalances: { CELI: 0, CELIAPP: 0, REER: 400_000, NON_ENREG: 0, CRYPTO: 0, REEE: 0 },
            retirementGoal: { targetAge: 60, targetMonthlyIncome: 3000, governmentPension: 4500, lifeExpectancy: 95 },
            baseMonthlyExpenses: 2_800,
            config: {
                ...config,
                users: config.users.map(u => ({ ...u, age: 73, birthYear: 1953 })) as typeof config.users,
            },
        } as SimulationParams;
        const r = __runScenarioForTests(ferrParams, 'AUTO_MARGINAL' as AllocationStrategy, false, false);
        const cd = r.chartData;
        const sumRetraits = cd.reduce((s, d) => s + num(d.RetraitREER), 0);
        const reerEnd = num(cd[cd.length - 1].REER);
        const drained = 400_000 - reerEnd;
        expect(drained).toBeGreaterThan(80_000); // non-vacuité : la FERR draine vraiment
        expect(sumRetraits).toBeGreaterThanOrEqual(0.9 * drained); // ancien code : ≈ 0 → échoue
    });

    it('NEUTRALITÉ NW : les compteurs d\'affichage ne touchent AUCUNE grandeur de patrimoine (golden)', () => {
        // Pin de la preuve bit-identique du validator (301 mois × 9 grandeurs, 2 worktrees) :
        // si un futur refactor fait fuir un compteur d'affichage dans un solde, ce golden casse.
        const melt = runWith('MELTDOWN_REER' as AllocationStrategy);
        expect(melt.finalNetWorth).toBeCloseTo(3628, 0);
        expect(melt.estateNetWorth).toBeCloseTo(155057, 0);
    });
});
