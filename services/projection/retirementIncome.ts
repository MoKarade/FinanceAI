// services/projection/retirementIncome.ts
// Cycle 13: calcul du revenu de retraite mensuel (RRQ + PSV + DB).
// Pure function: aucun side effect. Retourne incomeRetirement (avant
// affectation à monthlyIncome par le caller).

import type { RetirementGoal, User } from '../../types';
import { RRQ_MPE, calculateGISBenefit } from '../../utils/tax';

// Constantes RRQ/PSV 2026 (Retraite Québec + Service Canada)
const RRQ_DENOMINATOR_YEARS = 39;       // Années cotisées pour pleine RRQ (8/47 plus faibles retirées)
const PSV_MIN_RESIDENCY_YEARS = 10;     // Minimum 10 ans résidence Canada après 18 ans pour PSV
const PSV_FULL_RESIDENCY_YEARS = 40;    // Pleine pension à 40 ans
const PSV_BONUS_75_PLUS = 0.10;         // +10% automatique à partir de 75 ans (depuis juillet 2022)

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
    startYear: number;  // pour calcul arrivalAge depuis canadaArrivalYear
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
        dbSurvivorPct, rrqSurvivorPct, psvResidencyYears, startYear,
    } = ctx;

    let totalPsvProrata = 0;
    let totalRrqMpeRatio = 0;
    const yearsElapsed = Math.floor(m / 12);
    // MGA RRQ projeté: base 2026 (RRQ_MPE) indexée à inflation + croissance salariale ~0.5%/an
    const rrqMpeProjected = RRQ_MPE * Math.pow(1 + (simInflation + 0.5) / 100, yearsElapsed);

    users.filter(u => u).forEach((u, idx) => {
        const currentGrossUser = u.grossSalary || (baseGrossAnnual / activeUsersCount);
        totalRrqMpeRatio += Math.min(1.0, currentGrossUser / rrqMpeProjected);

        // PSV résidence: prorata 1/40, mais 0 si < 10 ans (règle Service Canada)
        const residencyYears = psvResidencyYears[idx] ?? 0;
        const psvIndividualProrata = residencyYears < PSV_MIN_RESIDENCY_YEARS
            ? 0
            : Math.min(1.0, residencyYears / PSV_FULL_RESIDENCY_YEARS);
        totalPsvProrata += psvIndividualProrata;
    });
    const psvProrata = totalPsvProrata / activeUsersCount;
    const rrqMpeRatio = totalRrqMpeRatio / activeUsersCount;

    // Prorata RRQ basé sur années cotisées au Canada entre 18 ans et l'âge de retraite.
    // canadaArrivalYear est une ANNÉE calendaire (ex. 2010), il faut la convertir en ÂGE
    // via birthYear. Si pas d'immigration documentée, on suppose présence depuis 18 ans.
    const u0 = users[0];
    let arrivalAge = 18;
    if (u0?.canadaArrivalYear && u0?.birthYear) {
        arrivalAge = Math.max(18, u0.canadaArrivalYear - u0.birthYear);
    } else if (u0?.canadaArrivalYear && !u0?.birthYear) {
        // Fallback: si on n'a que arrivalYear, estimer via startYear et âge courant
        const currentAge = age;
        const currentYear = startYear + yearsElapsed;
        const estimatedBirthYear = currentYear - currentAge;
        arrivalAge = Math.max(18, u0.canadaArrivalYear - estimatedBirthYear);
    }
    const workedYearsAtRetirement = Math.max(0, retirementGoal.targetAge - arrivalAge);
    const rrqProrata = Math.min(1, workedYearsAtRetirement / RRQ_DENOMINATOR_YEARS) * rrqMpeRatio;

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
    // Bonification automatique PSV +10% à partir de 75 ans (depuis juillet 2022)
    const psv75Bonus = age >= 75 ? (1 + PSV_BONUS_75_PLUS) : 1;
    const rrqMonthly = age >= rrqStartAge ? (rrqBaseIndiv * rrqProrata * rrqFactor * survivorRrqFactor) : 0;
    const psvMonthly = age >= psvStartAge ? (psvBaseIndiv * psvProrata * psvFactor * psv75Bonus * survivorPsvFactor) : 0;

    const inflFactor = Math.pow(1 + simInflation / 100, m / 12);

    const dbStartAge = retirementGoal.dbPensionStartAge ?? retirementGoal.targetAge;
    const dbBaseMonthly = retirementGoal.dbPensionMonthly || 0;
    const dbIndexationFraction = Math.min(1, Math.max(0, (retirementGoal.dbPensionIndexationPct ?? 100) / 100));
    const dbInflFactor = 1 + (inflFactor - 1) * dbIndexationFraction;
    const dbSurvivorFactor = survivorMode ? dbSurvivorPct : 1;
    const dbMonthly = age >= dbStartAge ? dbBaseMonthly * dbInflFactor * dbSurvivorFactor : 0;

    // §6.3 — SRG (Supplément de revenu garanti) pour retraités 65+ recevant la PSV.
    // Approximation : on estime le revenu autre que PSV via RRQ + DB pension
    // (annualisés). Cette approximation ignore les retraits REER, gains capitaux,
    // et rentes Non-Reg qui sont gérés ailleurs dans le moteur — donc le SRG
    // calculé ici peut être surestimé pour ces profils. TODO : intégration plus
    // précise via taxDecember si l'audit le requiert.
    const currentYear = startYear + yearsElapsed;
    const otherIncomeAnnualPerAdult = (rrqMonthly + dbMonthly) * 12;
    const otherIncomeAnnualFamily = otherIncomeAnnualPerAdult * activeUsersCount;
    const hasSpouseWithOAS = activeUsersCount > 1 && age >= psvStartAge;
    const gisMonthlyPerAdult = (age >= psvStartAge && psvMonthly > 0)
        ? calculateGISBenefit(
            hasSpouseWithOAS ? otherIncomeAnnualFamily : otherIncomeAnnualPerAdult,
            hasSpouseWithOAS,
            currentYear,
        )
        : 0;
    const gisMonthly = gisMonthlyPerAdult * activeUsersCount;

    return Math.max(0, (rrqMonthly + psvMonthly + gisMonthly) * inflFactor + dbMonthly - monthlyOasReduction);
}
