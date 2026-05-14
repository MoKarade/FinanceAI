import { describe, it, expect } from 'vitest';
import { calculateFutureProjection, type SimulationParams } from '../../services/projection';
import type {
    ProjectionConfig,
    BudgetConfig,
    RetirementGoal,
    Debt,
} from '../../types';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const makeProjection = (overrides: Partial<ProjectionConfig> = {}): ProjectionConfig => ({
    years: 5,
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
        {
            name: 'Test1',
            grossSalary: 5000,
            netSalary: 3500,
            color: '#10b981',
            age: 35,
            birthYear: 1991,
            canadaArrivalYear: 1991,
            hasOwnedPropertyLast4Years: false,
            celiContributed: 0,
            rrspContributed: 0,
        },
        {
            name: 'Test2',
            grossSalary: 4500,
            netSalary: 3200,
            color: '#3b82f6',
            age: 33,
            birthYear: 1993,
            canadaArrivalYear: 1993,
            hasOwnedPropertyLast4Years: false,
            celiContributed: 0,
            rrspContributed: 0,
        },
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
    liveCSVBalances: {
        CELI: 30000,
        CELIAPP: 0,
        REER: 50000,
        NON_ENREG: 10000,
        CRYPTO: 0,
        REEE: 0,
    },
    realEstateGoals: [],
    debts: [],
    childGoals: [],
    travelGoals: [],
    lifeEvents: [],
    retirementGoal: makeRetirementGoal(),
    config: makeConfig(),
    baseGrossAnnual: 114000, // 9500 / mois * 12
    baseNetAnnual: 80400,    // 6700 / mois * 12
    currentRentExpense: 1500,
    baseMonthlyExpenses: 5000,
    startYear: 2026,
    startMonth: 0,
    ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('calculateFutureProjection', () => {
    it('renvoie exactement 5 scénarios dans allResults (BASE, LIBERTE_55, HYPER_INFLATION, WINDFALL, ECONOMIC_WINTER)', () => {
        const result = calculateFutureProjection(makeParams()) as any;
        const scenarios = result.allResults as any[];
        expect(Array.isArray(scenarios)).toBe(true);
        expect(scenarios).toHaveLength(5);
        const types = scenarios.map(r => r.stratType);
        expect(types).toEqual(
            expect.arrayContaining(['BASE', 'LIBERTE_55', 'HYPER_INFLATION', 'WINDFALL', 'ECONOMIC_WINTER'])
        );
    });

    it('chaque scénario a un chartData non vide proche de years*12 entrées', () => {
        const params = makeParams();
        const result = calculateFutureProjection(params) as any;
        const scenarios = result.allResults as any[];
        const expectedMonths = (params.projection.years || 5) * 12;
        for (const r of scenarios) {
            expect(r.chartData.length).toBeGreaterThan(expectedMonths - 2);
            expect(r.chartData.length).toBeLessThanOrEqual(expectedMonths + 2);
        }
    });

    it('gainVsAuto vaut 0 pour le scénario BASE', () => {
        const result = calculateFutureProjection(makeParams()) as any;
        const scenarios = result.allResults as any[];
        const base = scenarios.find(r => r.stratType === 'BASE');
        expect(base).toBeDefined();
        expect(base.gainVsAuto).toBe(0);
    });

    it('estateNetWorth est numérique non-NaN dans tous les scénarios', () => {
        const result = calculateFutureProjection(makeParams()) as any;
        const scenarios = result.allResults as any[];
        for (const r of scenarios) {
            expect(typeof r.estateNetWorth).toBe('number');
            expect(Number.isNaN(r.estateNetWorth)).toBe(false);
            expect(Number.isFinite(r.estateNetWorth)).toBe(true);
        }
    });

    it('WINDFALL augmente le patrimoine vs BASE (héritage 250k $)', () => {
        const result = calculateFutureProjection(makeParams()) as any;
        const scenarios = result.allResults as any[];
        const base = scenarios.find(r => r.stratType === 'BASE');
        const windfall = scenarios.find(r => r.stratType === 'WINDFALL');
        expect(windfall.estateNetWorth).toBeGreaterThan(base.estateNetWorth);
    });

    it('HYPER_INFLATION dégrade le patrimoine vs BASE (en réel)', () => {
        const result = calculateFutureProjection(makeParams()) as any;
        const scenarios = result.allResults as any[];
        const base = scenarios.find(r => r.stratType === 'BASE');
        const hyper = scenarios.find(r => r.stratType === 'HYPER_INFLATION');
        // L'inflation 5.5% érode la valeur réelle nette même avec rendements similaires
        expect(hyper.estateNetWorth).toBeLessThan(base.estateNetWorth);
    });

    it('patrimoine positif avec cash + revenus normaux et 5 ans d\'horizon', () => {
        const result = calculateFutureProjection(makeParams()) as any;
        const scenarios = result.allResults as any[];
        const base = scenarios.find(r => r.stratType === 'BASE');
        expect(base.estateNetWorth).toBeGreaterThan(0);
    });

    it('ne crash pas avec des dettes en input', () => {
        const debts: Debt[] = [
            { id: 'd1', name: 'Carte crédit', balance: 5000, interestRate: 21, minimumPayment: 200, category: 'CreditCard' },
            { id: 'd2', name: 'Prêt auto', balance: 18000, interestRate: 6.5, minimumPayment: 350, category: 'Car' },
        ];
        expect(() => calculateFutureProjection(makeParams({ debts }))).not.toThrow();
    });

    it('ne crash pas avec toutes les listes vides', () => {
        expect(() => calculateFutureProjection(makeParams({
            realEstateGoals: [],
            debts: [],
            childGoals: [],
            travelGoals: [],
            lifeEvents: [],
        }))).not.toThrow();
    });

    it('shortfallRate ∈ [0, 1] dans tous les scénarios', () => {
        const result = calculateFutureProjection(makeParams()) as any;
        const scenarios = result.allResults as any[];
        for (const r of scenarios) {
            expect(r.shortfallRate).toBeGreaterThanOrEqual(0);
            expect(r.shortfallRate).toBeLessThanOrEqual(1);
        }
    });

    it('chaque entrée de chartData expose NetWorth numérique', () => {
        const result = calculateFutureProjection(makeParams()) as any;
        const scenarios = result.allResults as any[];
        const base = scenarios.find(r => r.stratType === 'BASE');
        for (const d of base.chartData) {
            expect(typeof d.NetWorth).toBe('number');
            expect(Number.isFinite(d.NetWorth)).toBe(true);
        }
    });

    it('cash de départ nul + 0 revenus → patrimoine fini, pas d\'erreur', () => {
        const zeroIncome: Partial<SimulationParams> = {
            calculatedStartingCash: 0,
            liveCSVBalances: { CELI: 0, CELIAPP: 0, REER: 0, NON_ENREG: 0, CRYPTO: 0, REEE: 0 },
            baseGrossAnnual: 0,
            baseNetAnnual: 0,
            baseMonthlyExpenses: 0,
            currentRentExpense: 0,
            config: {
                ...makeConfig(),
                users: [
                    { ...makeConfig().users[0], grossSalary: 0, netSalary: 0 },
                    { ...makeConfig().users[1], grossSalary: 0, netSalary: 0 },
                ] as BudgetConfig['users'],
            },
        };
        const result = calculateFutureProjection(makeParams(zeroIncome)) as any;
        const scenarios = result.allResults as any[];
        expect(scenarios).toHaveLength(5);
        for (const r of scenarios) {
            expect(Number.isFinite(r.estateNetWorth)).toBe(true);
        }
    });
});
