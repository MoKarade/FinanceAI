// tests/services/psvResidencyStartAgeWiring.test.ts
//
// [FISC-CONST-ANCHOR-DEBT] (lot 207) — le moteur initialise les années de résidence PSV d'un natif
// depuis ses 18 ans (`PSV_RESIDENCY_START_AGE`, Service Canada : « résidence au Canada après 18 ans »).
// Le site vit dans `projection.ts`, hors de portée d'un test unitaire de `retirementIncome` : on
// OBSERVE l'argument `psvResidencyYears` remis à `computeRetirementIncome` (espion sur le vrai module),
// jamais on ne le reconstruit. Fait défendu : natif né en 1960, départ 2026 → 2026 − (1960 + 18) = 48
// ans de résidence. Perturbation mesurée : la constante à 30 donne 36.
import { describe, it, expect, vi } from 'vitest';
import type { RetirementIncomeCtx } from '../../services/projection/retirementIncome';

vi.mock('../../services/projection/retirementIncome', async (importOriginal) => {
    const mod = await importOriginal<typeof import('../../services/projection/retirementIncome')>();
    return { ...mod, computeRetirementIncome: vi.fn(mod.computeRetirementIncome) };
});

import { computeRetirementIncome } from '../../services/projection/retirementIncome';
import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, User } from '../../types';
import type { AllocationStrategy } from '../../services/projection/types';

const spy = vi.mocked(computeRetirementIncome);

const params = (): SimulationParams => ({
    projection: {
        years: 2, returnRate: 5, inflationRate: 2, savingsMode: 'manual', manualContribution: 0,
        usePortfolioRate: false, returnRates: { celi: 5, reer: 5, nonReg: 5, crypto: 6, cash: 1 },
        emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3,
    } as ProjectionConfig,
    calculatedStartingCash: 30_000,
    liveCSVBalances: { CELI: 50_000, CELIAPP: 0, REER: 100_000, NON_ENREG: 0, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: { targetAge: 65, targetMonthlyIncome: 3_000, governmentPension: 1_400, lifeExpectancy: 92, dbPensionMonthly: 0 } as unknown as RetirementGoal,
    config: {
        // Natif : ni `isImmigrant` ni année d'arrivée → la résidence part de l'âge de majorité.
        users: [{ name: 'Natif', grossSalary: 0, netSalary: 0, color: '#10b981', age: 66, birthYear: 1960, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 } as unknown as User],
        splitMode: '50/50',
    } as unknown as BudgetConfig,
    baseGrossAnnual: 0, baseNetAnnual: 0, currentRentExpense: 0,
    baseMonthlyExpenses: 2_500, startYear: 2026, startMonth: 0,
} as unknown as SimulationParams);

describe('[FISC-CONST-ANCHOR-DEBT] la résidence PSV d\'un natif est comptée depuis ses 18 ans', () => {
    it('natif né en 1960, départ 2026 : 48 ans de résidence remis au calcul des rentes dès le premier mois', () => {
        spy.mockClear();
        __runScenarioForTests(params(), 'AUTO_MARGINAL' as AllocationStrategy, false, false, 0, 'BASE', {}, { verboseMonthlyPoints: true });
        const ctxs = spy.mock.calls.map((c) => c[0] as RetirementIncomeCtx);
        expect(ctxs.length, 'aucun appel observé : espion non câblé ou retraité jamais servi').toBeGreaterThan(12);
        const annees = Number(ctxs[0].psvResidencyYears?.[0]);
        expect(Number.isFinite(annees)).toBe(true);
        expect(annees).toBeCloseTo(48, 6);
        // Et la résidence continue de s'accumuler mois après mois (1/12 par mois avant 65 ans seulement :
        // à 66 ans elle est figée — c'est l'AUTRE site de la même constante qui borne l'accumulation).
        expect(Number(ctxs[12].psvResidencyYears?.[0])).toBeCloseTo(48, 6);
    });
});
