/**
 * [WHT-DISPLAY-MELTDOWN + ENG-MELTDOWN-FLOW-INVISIBLE] (V2, findings financial-integrity
 * MESURÉS 2026-07-31) — le meltdown REER doit alimenter les compteurs d'AFFICHAGE comme
 * les tirages en cascade :
 *  1. `chartData.RetraitREER` : l'ancien code rendait ~3 % des sorties réelles visibles
 *     (22 547 $ affichés pour ~796 k$ tirés) → tooltip/modal/milestoneIcons/MCP aveugles.
 *  2. `totalTaxesPaid` (somme `rrspWithholdingMois`, projection.ts:1446) : la retenue du
 *     meltdown n'y entrait jamais → 139 306 $ vs 243 549 $ (AUTO_MARGINAL) pour un estate
 *     SUPÉRIEUR — `strategyRanking` (poids 25-100 % sur ce compteur) recommandait
 *     MELTDOWN_REER sur un impôt truqué.
 * Discriminant prouvé par restauration du code d'avant (les deux assertions échouent).
 * Aucun impact NW (décembre crédite la retenue, avril ne paie que la réconciliation).
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
        // Ancien code : sumRetraits ≈ tirages cascade seuls (petite fraction) → échoue.
        expect(sumRetraits).toBeGreaterThanOrEqual(0.9 * drained);
    });

    it('totalTaxesPaid compte la retenue du meltdown (plus jamais << AUTO_MARGINAL pour un estate ≥)', () => {
        const melt = runWith('MELTDOWN_REER' as AllocationStrategy);
        const auto = runWith('AUTO_MARGINAL' as AllocationStrategy);
        // Ancien code mesuré : ratio 139 306 / 243 549 ≈ 0,57 (impôt truqué) → échoue à 0,8.
        expect(auto.totalTaxesPaid).toBeGreaterThan(0);
        expect(melt.totalTaxesPaid / auto.totalTaxesPaid).toBeGreaterThan(0.8);
    });
});
