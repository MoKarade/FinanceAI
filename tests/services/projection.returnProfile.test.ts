// PH4-FUT-B — levier « profil de rendement » BOUT-EN-BOUT dans le moteur déterministe.
// On vérifie 3 propriétés money-critical de runScenario (via calculateFutureProjection,
// runMC=false → 100 % déterministe, zéro flake) :
//   1. NON-RÉGRESSION STRICTE : profil absent OU 'balanced' == run historique (même finalNetWorth
//      au bit près) — garanti par returnRatesForProfile qui renvoie la MÊME référence returnRates,
//      donc effectiveParams === params (aucun clone, aucun recalcul différent).
//   2. MONOTONIE : conservative < balanced < aggressive (plus de rendement ⇒ plus de patrimoine),
//      sur un horizon assez long pour que la composition domine.
//   3. PIN : les 3 valeurs sont figées (toBeCloseTo) → toute dérive future du modèle est détectée.
import { describe, it, expect } from 'vitest';
import { calculateFutureProjection, type SimulationParams } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal } from '../../types';

// --- Fixtures (mêmes valeurs que projection.test.ts, horizon allongé à 30 ans) ---

const makeProjection = (overrides: Partial<ProjectionConfig> = {}): ProjectionConfig => ({
    years: 30,
    returnRate: 6,
    inflationRate: 2,
    savingsMode: 'manual',
    manualContribution: 1500,
    usePortfolioRate: false,
    returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
    emergencyFundMonths: 6,
    salaryGrowth: 2,
    propertyGrowthRate: 3,
    ...overrides,
});

const makeConfig = (): BudgetConfig => ({
    users: [
        { name: 'Test1', grossSalary: 5000, netSalary: 3500, color: '#10b981', age: 35, birthYear: 1991, canadaArrivalYear: 1991, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
        { name: 'Test2', grossSalary: 4500, netSalary: 3200, color: '#3b82f6', age: 33, birthYear: 1993, canadaArrivalYear: 1993, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
    ],
    splitMode: '50/50',
});

const makeRetirementGoal = (overrides: Partial<RetirementGoal> = {}): RetirementGoal => ({
    targetAge: 65,
    targetMonthlyIncome: 4500,
    governmentPension: 1500,
    ...overrides,
});

const makeParams = (overrides: Partial<SimulationParams> = {}): SimulationParams => ({
    projection: makeProjection(),
    calculatedStartingCash: 25000,
    liveCSVBalances: { CELI: 30000, CELIAPP: 0, REER: 50000, NON_ENREG: 10000, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [],
    debts: [],
    childGoals: [],
    travelGoals: [],
    lifeEvents: [],
    retirementGoal: makeRetirementGoal(),
    config: makeConfig(),
    baseGrossAnnual: 114000,
    baseNetAnnual: 80400,
    currentRentExpense: 1500,
    baseMonthlyExpenses: 5000,
    startYear: 2026,
    startMonth: 0,
    ...overrides,
});

// finalNetWorth déterministe pour un profil donné (undefined = champ absent = run historique).
const finalNetWorth = (
    profile: 'conservative' | 'balanced' | 'aggressive' | undefined,
    extra: Partial<ProjectionConfig> = {},
): number => {
    const projection = makeProjection(extra);
    if (profile !== undefined) projection.appliedReturnProfile = profile;
    const res = calculateFutureProjection(makeParams({ projection }), false, 0);
    expect(res.finalNetWorth).toBeDefined();
    return res.finalNetWorth!;
};

describe('PH4-FUT-B — profil de rendement dans le moteur (déterministe, 30 ans)', () => {
    it("NON-RÉGRESSION : appliedReturnProfile absent == 'balanced' == undefined explicite (au bit près)", () => {
        const historical = finalNetWorth(undefined);   // champ jamais posé
        const balanced = finalNetWorth('balanced');     // posé à 'balanced'
        expect(balanced).toBe(historical);              // égalité STRICTE (même référence returnRates)
        expect(balanced).toBeGreaterThan(0);
    });

    it('MONOTONIE : conservative < balanced < aggressive (strict)', () => {
        const conservative = finalNetWorth('conservative');
        const balanced = finalNetWorth('balanced');
        const aggressive = finalNetWorth('aggressive');
        expect(conservative).toBeLessThan(balanced);
        expect(balanced).toBeLessThan(aggressive);
        // Écarts substantiels (pas un bruit d'arrondi) : le levier a un effet matériel à 30 ans.
        expect(balanced - conservative).toBeGreaterThan(100_000);
        expect(aggressive - balanced).toBeGreaterThan(100_000);
    });

    it('PIN : valeurs figées des 3 profils (détecte toute dérive du modèle)', () => {
        // Calibré le 2026-06-11 sur cette fixture (horizon 30 ans, runMC=false, selectedIdx=0).
        expect(finalNetWorth('conservative')).toBeCloseTo(1_546_548.50, 1);
        expect(finalNetWorth('balanced')).toBeCloseTo(1_883_795.82, 1);
        expect(finalNetWorth('aggressive')).toBeCloseTo(2_966_848.07, 1);
        // Le run historique (champ absent) est pinné sur la valeur 'balanced'.
        expect(finalNetWorth(undefined)).toBeCloseTo(1_883_795.82, 1);
    });

    it("'aggressive' + asset location > 'aggressive' seul (le bonus 0.4pp s'empile sur le preset)", () => {
        const aggressive = finalNetWorth('aggressive');
        const aggressiveAL = finalNetWorth('aggressive', { appliedAssetLocation: true });
        expect(aggressiveAL).toBeGreaterThan(aggressive);
    });

    it("'conservative' + asset location reste < 'balanced' sans AL (le profil domine le bonus)", () => {
        // Garde-fou : un bonus de 0,4pp ne doit pas faire franchir un cran entier de profil
        // (4,5 % + 0,4 = 4,9 % < 6 %). Confirme que profil et asset-location sont des effets distincts.
        const conservativeAL = finalNetWorth('conservative', { appliedAssetLocation: true });
        const balanced = finalNetWorth('balanced');
        expect(conservativeAL).toBeLessThan(balanced);
    });

    it("'balanced' RESPECTE des returnRates édités à la main (≠ défaut) — pas d'écrasement par un preset", () => {
        // Cas réel : l'utilisateur a édité ses taux. 'balanced' doit les garder TELS QUELS
        // (et ne pas retomber sur un preset). On le prouve par égalité stricte avec le run absent.
        const edited = { returnRates: { celi: 5.25, reer: 5.75, nonReg: 5.5, crypto: 11, cash: 1.5 } };
        const historicalEdited = finalNetWorth(undefined, edited);
        const balancedEdited = finalNetWorth('balanced', edited);
        expect(balancedEdited).toBe(historicalEdited);
        // Et ces taux édités ne coïncident avec AUCUN preset → le résultat diffère des profils pressetés.
        expect(balancedEdited).not.toBeCloseTo(finalNetWorth('conservative', edited), 1);
        expect(balancedEdited).not.toBeCloseTo(finalNetWorth('aggressive', edited), 1);
    });
});
