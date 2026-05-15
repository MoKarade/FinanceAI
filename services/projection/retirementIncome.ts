// services/projection/retirementIncome.ts
// Cycle 13: calcul du revenu de retraite mensuel (RRQ + PSV + DB).
// Pure function: aucun side effect. Retourne incomeRetirement (avant
// affectation à monthlyIncome par le caller).

import type { RetirementGoal, User } from '../../types';

export interface RetirementIncomeCtx {
    m: number;
    age: number;
    simInflation: number;
    activeUsersCount: number;
    baseGrossAnnual: number;
    delayPensions: boolean;
    survivorMode: boolean;
    monthlyOasReduction: number;
    dbSurvivorPct: number;
    rrqSurvivorPct: number;
    psvResidencyYears: number[];
}

/**
 * Calcule le revenu mensuel brut de retraite (RRQ + PSV + DB − écrêtement PSV).
 * Appelé une fois par mois quand isRetired === true.
 */
export function computeRetirementIncome(
    ctx: RetirementIncomeCtx,
    retirementGoal: RetirementGoal,
    users: User[],
): number {
    const {
        m, age, simInflation, activeUsersCount, baseGrossAnnual,
        delayPensions, survivorMode, monthlyOasReduction,
        dbSurvivorPct, rrqSurvivorPct, psvResidencyYears,
    } = ctx;

    let totalPsvProrata = 0;
    let totalRrqMpeRatio = 0;
    const yearsElapsed = Math.floor(m / 12);
    const RRQ_MPE_ESTIMATE = 73200 * Math.pow(1 + (simInflation + 0.5) / 100, yearsElapsed);

    users.filter(u => u).forEach((u, idx) => {
        const currentGrossUser = u.grossSalary || (baseGrossAnnual / activeUsersCount);
        totalRrqMpeRatio += Math.min(1.0, currentGrossUser / RRQ_MPE_ESTIMATE);
        totalPsvProrata += Math.min(1.0, psvResidencyYears[idx] / 40);
    });
    const psvProrata = totalPsvProrata / activeUsersCount;
    const rrqMpeRatio = totalRrqMpeRatio / activeUsersCount;

    const workedYearsAtRetirement = Math.max(0, retirementGoal.targetAge - Math.max(18, users[0]?.canadaArrivalYear || 18));
    const rrqProrata = Math.min(1, workedYearsAtRetirement / 39) * rrqMpeRatio;

    let rrqFactor = 1.0;
    let psvFactor = 1.0;
    let rrqStartAge = Math.max(60, retirementGoal.targetAge);
    let psvStartAge = Math.max(65, retirementGoal.targetAge);

    if (delayPensions) {
        rrqStartAge = 70;
        psvStartAge = 70;
        rrqFactor = 1.42;
        psvFactor = 1.36;
    } else {
        const monthsFrom65 = (rrqStartAge - 65) * 12;
        if (monthsFrom65 < 0) rrqFactor = 1 + Math.max(monthsFrom65, -60) * 0.006;
        else rrqFactor = 1 + Math.min(monthsFrom65, 60) * 0.007;

        const monthsPsvFrom65 = (psvStartAge - 65) * 12;
        if (monthsPsvFrom65 > 0) psvFactor = 1 + Math.min(monthsPsvFrom65, 60) * 0.006;
    }

    const rrqBaseIndiv = (retirementGoal.rrqEstimateMonthly !== undefined)
        ? (retirementGoal.rrqEstimateMonthly * activeUsersCount)
        : (retirementGoal.governmentPension * 0.65);
    const psvBaseIndiv = (retirementGoal.psvEstimateMonthly !== undefined)
        ? (retirementGoal.psvEstimateMonthly * activeUsersCount)
        : (retirementGoal.governmentPension * 0.35);

    const survivorRrqFactor = survivorMode ? (1 - 0.5 + 0.5 * rrqSurvivorPct) : 1;
    const survivorPsvFactor = survivorMode ? 0.5 : 1;
    const rrqMonthly = age >= rrqStartAge ? (rrqBaseIndiv * rrqProrata * rrqFactor * survivorRrqFactor) : 0;
    const psvMonthly = age >= psvStartAge ? (psvBaseIndiv * psvProrata * psvFactor * survivorPsvFactor) : 0;

    const inflFactor = Math.pow(1 + simInflation / 100, m / 12);

    const dbStartAge = retirementGoal.dbPensionStartAge ?? retirementGoal.targetAge;
    const dbBaseMonthly = retirementGoal.dbPensionMonthly || 0;
    const dbIndexationFraction = Math.min(1, Math.max(0, (retirementGoal.dbPensionIndexationPct ?? 100) / 100));
    const dbInflFactor = 1 + (inflFactor - 1) * dbIndexationFraction;
    const dbSurvivorFactor = survivorMode ? dbSurvivorPct : 1;
    const dbMonthly = age >= dbStartAge ? dbBaseMonthly * dbInflFactor * dbSurvivorFactor : 0;

    return Math.max(0, (rrqMonthly + psvMonthly) * inflFactor + dbMonthly - monthlyOasReduction);
}
