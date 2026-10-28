// Fixture partagée du lot [FISC-BANDES-FRERES-SANS-AGEOPTS] : un couple dont les DEUX âges
// diffèrent (64 et 62) — un couple du même âge ne discriminerait pas la transmission par déclarant
// (`UN-COUPLE-DU-MEME-AGE-EPINGLE-LE-REGISTRE-PER-CONJOINT`).
import type { ProjectionConfig, BudgetConfig, RetirementGoal } from '../../../types';
import type { SimulationParams } from '../../../services/projection';

export const PROJECTION: ProjectionConfig = {
    years: 5, returnRate: 5, inflationRate: 2, savingsMode: 'manual', manualContribution: 0,
    usePortfolioRate: false, returnRates: { celi: 5, reer: 5, nonReg: 5, crypto: 6, cash: 1 },
    emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3,
};

export const CONFIG: BudgetConfig = {
    users: [
        { name: 'M', grossSalary: 4100, netSalary: 3000, color: '#fff', age: 64, birthYear: 1962, canadaArrivalYear: 1962, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
        { name: 'A', grossSalary: 4100, netSalary: 3000, color: '#fff', age: 62, birthYear: 1964, canadaArrivalYear: 1964, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
    ], splitMode: '50/50',
};

export const PARAMS: SimulationParams = {
    projection: PROJECTION, calculatedStartingCash: 20_000,
    liveCSVBalances: { CELI: 0, CELIAPP: 0, REER: 300_000, NON_ENREG: 100_000, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: { targetAge: 70, targetMonthlyIncome: 5000, governmentPension: 1500, lifeExpectancy: 95 } as RetirementGoal,
    config: CONFIG, baseGrossAnnual: 98_400, baseNetAnnual: 72_000, currentRentExpense: 0, baseMonthlyExpenses: 5_000,
    startYear: 2026, startMonth: 0,
} as SimulationParams;
