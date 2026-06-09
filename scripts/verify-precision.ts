// scripts/verify-precision.ts
// Script CLI : la sortie console est volontaire.
/* eslint-disable no-console */
// Script de vérification: hash + dump complet de chaque champ de chartData sur
// plusieurs scénarios déterministes. Permet de comparer 2 commits.

import { createHash } from 'crypto';
import { writeFileSync } from 'fs';
import { calculateFutureProjection, type SimulationParams } from '../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal } from '../types';
import type { ProjectionResult } from '../services/projection/types';

const makeProjection = (overrides: Partial<ProjectionConfig> = {}): ProjectionConfig => ({
    years: 20,
    returnRate: 6,
    inflationRate: 2,
    savingsMode: 'manual',
    manualContribution: 1500,
    usePortfolioRate: false,
    returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
    emergencyFundMonths: 6,
    salaryGrowth: 2,
    propertyGrowthRate: 3,
    monteCarloIterations: 100,
    ...overrides,
});

const makeConfig = (): BudgetConfig => ({
    users: [
        { name: 'A', grossSalary: 5000, netSalary: 3500, color: '#10b981', age: 35, birthYear: 1991, canadaArrivalYear: 1991, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
        { name: 'B', grossSalary: 4500, netSalary: 3200, color: '#3b82f6', age: 33, birthYear: 1993, canadaArrivalYear: 1993, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
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

// [UI-SCEN] — le moteur ne calcule plus que le scénario sélectionné par défaut : chaque
// golden de stress DEMANDE explicitement son stratType (l'ancien mapping par idx renvoyait
// silencieusement des clones de BASE — garde-fou neutralisé, attrapé par performance-optimizer).
const cases = [
    { name: 'base-deterministic-20y', params: makeParams(), runMC: false, only: undefined },
    { name: 'base-deterministic-30y', params: makeParams({ projection: makeProjection({ years: 30 }) }), runMC: false, only: undefined },
    { name: 'liberte-55-deterministic', params: makeParams(), runMC: false, only: ['LIBERTE_55'] },
    { name: 'hyper-inflation', params: makeParams(), runMC: false, only: ['HYPER_INFLATION'] },
    { name: 'windfall', params: makeParams(), runMC: false, only: ['WINDFALL'] },
    { name: 'economic-winter', params: makeParams(), runMC: false, only: ['ECONOMIC_WINTER'] },
    { name: 'mc-200-iterations', params: makeParams({ projection: makeProjection({ monteCarloIterations: 200 }) }), runMC: true, only: undefined },
];

// Snapshot : valeurs de sortie agrégées par scénario (scalaires + échantillons chartData).
// `unknown` pour les champs chartData dont la forme exacte est opaque depuis ce script.
type SnapshotEntry = {
    durationMs: number;
    finalNetWorth: number | undefined;
    estateNetWorth: number | undefined;
    totalEstateTax: number | undefined;
    totalTaxesPaid: number | undefined;
    totalGrowth: number | undefined;
    totalExpenses: number | undefined;
    minNetWorth: number | undefined;
    shortfallRate: number | undefined;
    startNW: number | undefined;
    fireNumber: number | undefined;
    successRate: number | null | undefined;
    fvi: number | null | undefined;
    chartDataLength: number;
    chartDataHash: string;
    sampleM0: unknown;
    sampleM60: unknown;
    sampleM120: unknown;
    sampleM180: unknown;
    sampleM240: unknown;
};
const snapshot: Record<string, SnapshotEntry | number> = {};
const t0 = Date.now();

for (const c of cases) {
    const tStart = Date.now();
    const res: ProjectionResult = calculateFutureProjection(c.params, c.runMC, 0, c.only);
    const tEnd = Date.now();

    snapshot[c.name] = {
        durationMs: tEnd - tStart,
        finalNetWorth: res.finalNetWorth,
        estateNetWorth: res.estateNetWorth,
        totalEstateTax: res.totalEstateTax as number | undefined,
        totalTaxesPaid: res.totalTaxesPaid,
        totalGrowth: res.totalGrowth,
        totalExpenses: res.totalExpenses,
        minNetWorth: res.minNetWorth,
        shortfallRate: res.shortfallRate,
        startNW: res.startNW as number | undefined,
        fireNumber: res.fireNumber,
        successRate: res.successRate,
        fvi: res.fvi,
        chartDataLength: res.chartData.length,
        chartDataHash: createHash('sha256').update(JSON.stringify(res.chartData)).digest('hex'),
        // Échantillons mois 0, 60, 120, 180, 240 (toutes les 5 années)
        sampleM0: res.chartData[0],
        sampleM60: res.chartData[60],
        sampleM120: res.chartData[120],
        sampleM180: res.chartData[180],
        sampleM240: res.chartData[240],
    };
}

snapshot._totalDurationMs = Date.now() - t0;

writeFileSync(process.argv[2] || 'snapshot.json', JSON.stringify(snapshot, null, 2));
console.log(`Snapshot écrit. Total: ${snapshot._totalDurationMs}ms`);
for (const c of cases) {
    const entry = snapshot[c.name] as SnapshotEntry;
    console.log(`  ${c.name}: ${entry.durationMs}ms — hash=${entry.chartDataHash.slice(0, 16)}`);
}
