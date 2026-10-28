// tests/services/projection.reerByUserParity.test.ts
//
// [PV-11e] PIN de l'invariant Σ(reerByUser) == reer — PAS un bug : l'invariant est préservé par
// construction (`stepReerByUser` re-répartit retrait/cotisation/pool de fin chaque mois). Ce test
// le VERROUILLE sur le cas le plus mélangé : couple INÉGAL (parts REER différentes) + un but
// financier qui TIRE du REER à une deadline + des cotisations REER le même mois — le mois où
// retrait de goal ET cotisation se superposent est celui où une régression de répartition
// per-conjoint casserait la somme sans toucher la conservation globale (angle mort des 12
// invariants : l'argent reste conservé, c'est la VENTILATION par conjoint qui divergerait —
// et elle pilote la FERR per-conjoint 71+ et l'impôt du décaissement).

import { describe, it, expect } from 'vitest';
import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, FinancialGoal } from '../../types';
import type { AllocationStrategy } from '../../services/projection/types';

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

const projection: ProjectionConfig = {
    years: 6, returnRate: 4, inflationRate: 2, savingsMode: 'manual', manualContribution: 1_000,
    usePortfolioRate: false, returnRates: { celi: 4, reer: 4, nonReg: 4, crypto: 5, cash: 1 },
    emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3,
};

// Couple INÉGAL en emploi (réponse 3 de Marc : « les deux ont un salaire mais possible que pendant
// un temps juste un en ai ») : salaires 2:1 → parts REER inégales, cotisations mensuelles actives.
const config: BudgetConfig = {
    users: [
        { name: 'A', grossSalary: 8_000, netSalary: 5_600, color: '#10b981', age: 45, birthYear: 1981, canadaArrivalYear: 1981, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
        { name: 'B', grossSalary: 4_000, netSalary: 3_000, color: '#3b82f6', age: 43, birthYear: 1983, canadaArrivalYear: 1983, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
    ],
    splitMode: '50/50',
};

// But financier qui TIRE 30 k$ du REER en cours de simulation (deadline année 3) — le mois de la
// deadline superpose retrait de goal et cotisation mensuelle (salariés actifs).
const reerGoal: FinancialGoal = {
    id: 'fg_reer', name: 'Retrait REER planifié', type: 'other' as FinancialGoal['type'],
    targetAmount: 30_000, deadline: '2029-06-15', status: 'active', targetAccount: 'REER',
};

const params = {
    projection,
    calculatedStartingCash: 25_000,
    liveCSVBalances: { CELI: 10_000, CELIAPP: 0, REER: 120_000, NON_ENREG: 5_000, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: { targetAge: 65, targetMonthlyIncome: 4_000, governmentPension: 1_200, lifeExpectancy: 95 } as RetirementGoal,
    config,
    baseGrossAnnual: 144_000, baseNetAnnual: 103_200, currentRentExpense: 0,
    baseMonthlyExpenses: 4_500,
    startYear: 2026, startMonth: 0,
    financialGoals: [reerGoal],
} as SimulationParams;

describe('[PV-11e] Σ(reerByUser) == reer — couple inégal + goal REER + cotisation même mois', () => {
    it('la ventilation per-conjoint somme EXACTEMENT au pool REER final (± 1 $)', () => {
        const r = __runScenarioForTests(params, 'AUTO_MARGINAL' as AllocationStrategy, false, false);
        const cd = r.chartData;
        expect(cd.length).toBeGreaterThan(60);

        // Non-vacuité 1 : le goal a VRAIMENT tiré du REER (leçon FUZZ-ONETIME-FLOWS : générer un
        // flux ≠ l'exercer) — Σ RetraitREER couvre au moins le tirage du goal.
        const sumRetraits = cd.reduce((s, d) => s + num(d.RetraitREER), 0);
        expect(sumRetraits).toBeGreaterThanOrEqual(29_000);

        // Non-vacuité 2 : les DEUX conjoints portent une part (couple inégal, pas un solo déguisé).
        const byUser = r.reerByUserFinal ?? [];
        expect(byUser.length).toBe(2);
        expect(byUser[0]).toBeGreaterThan(0);
        expect(byUser[1]).toBeGreaterThan(0);

        // L'invariant : Σ parts per-conjoint == solde REER final du pool.
        const reerFinal = num(cd[cd.length - 1].REER);
        const sumByUser = byUser.reduce((s, v) => s + num(v), 0);
        expect(Math.abs(sumByUser - reerFinal)).toBeLessThan(1);

        // Les parts restent INÉGALES (salaires 2:1 → cotisations inégales) : une régression qui
        // re-splitterait 50/50 chaque mois passerait le Σ mais pas ce discriminant.
        expect(byUser[0]).toBeGreaterThan(byUser[1] * 1.05);
    });
});
