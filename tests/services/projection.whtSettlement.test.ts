// tests/services/projection.whtSettlement.test.ts
//
// [FISC-WHT-92PCT] (GO Marc 2026-08-01) — retenue employeur = 100 % de l'impôt sans déductions.
// L'ancien `estimatedWithholding = totalEmployerTax * 0.92` (taxDecember.ts, non sourcé) facturait
// ~8 % de l'impôt salarial EN DOUBLE chaque avril : le netSalary saisi incorpore déjà ~100 % de la
// retenue réelle (vérifié numériquement, FISCAL_REFERENCE §9). Le solde d'avril ne règle plus que
// l'écart dû aux déductions (REER…) — ~0 sur une fixture sans déductions.
//
// DISCRIMINANT (mesuré séquentiellement avant/après le fix, 2026-08-01, même fixture) :
//   AVANT (×0,92) : ttp 106 915,04 · finalNW 720 557,13 · flux d'impôt réel 2 702,05 $/an
//   APRÈS (×1,0)  : ttp  57 722,84 · finalNW 819 490,94 · flux réel 1 458,82 $/an (Δ = 1 243,23 $/an
//   réel = exactement 8 % de l'impôt employeur du couple — la double facturation supprimée).
// Le RETRAITÉ est bit-identique (la branche retenue est phase ACTIVE seulement) — pins retraité
// couverts par projection.bracketRealIndex.test.ts (48 314,04 / −196 188,58, inchangés).

import { describe, it, expect } from 'vitest';
import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal } from '../../types';
import type { AllocationStrategy } from '../../services/projection/types';

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

describe('[FISC-WHT-92PCT] retenue employeur 100 % — plus de double facturation des 8 %', () => {
    it('salarié : ttp et NW pinnés post-fix (l\'ancien ×0,92 sur-imposait de 1 243 $/an réel)', () => {
        const r = __runScenarioForTests(salarie, 'AUTO_MARGINAL' as AllocationStrategy, false, false);
        // AVANT fix : ttp 106 915,04 / nw 720 557,13 — l'écart est UNIQUEMENT la fin du
        // double-comptage des 8 % (le netSalary paie déjà 100 % de la vraie retenue).
        expect(r.totalTaxesPaid).toBeCloseTo(57_722.84, 0);
        expect(r.finalNetWorth).toBeCloseTo(819_490.94, 0);
    });

    it('invariant sémantique : sans déductions, T1213 ON ≡ OFF au bit près (survit aux re-bases)', () => {
        // Recommandation financial-integrity #558 : les pins ci-dessus se re-basent ; CETTE
        // propriété, non. Sans déductions, retenue(100 %) == impôt réel == retenue T1213 →
        // le flag ne peut RIEN changer. Sous l'ancien ×0,92 les deux mondes divergeaient
        // (OFF facturait +8 % en avril, ON non) → discriminant structurel du fix.
        const off = __runScenarioForTests(salarie, 'AUTO_MARGINAL' as AllocationStrategy, false, false);
        const on = __runScenarioForTests(
            { ...salarie, projection: { ...salarie.projection, optimizeSourceDeductions: true } } as SimulationParams,
            'AUTO_MARGINAL' as AllocationStrategy, false, false,
        );
        expect(on.totalTaxesPaid).toBe(off.totalTaxesPaid);
        expect(on.finalNetWorth).toBe(off.finalNetWorth);
    });
});
