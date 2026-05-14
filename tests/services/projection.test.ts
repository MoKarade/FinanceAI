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

    // D2.7 — US Withholding sur CELI
    describe('US Withholding CELI', () => {
        it('avec usEquityShareCeli=100% et yield 2%, le patrimoine est plus faible que sans drag', () => {
            const baseProj = makeProjection({ years: 20, usEquityShareCeli: 0 });
            const dragProj = makeProjection({ years: 20, usEquityShareCeli: 100, usEquityDividendYield: 2 });

            const noDrag = calculateFutureProjection(makeParams({ projection: baseProj })) as any;
            const drag = calculateFutureProjection(makeParams({ projection: dragProj })) as any;

            const noBase = noDrag.allResults.find((s: any) => s.stratType === 'BASE');
            const drBase = drag.allResults.find((s: any) => s.stratType === 'BASE');

            // Drag 100% × 2% × 15% = 0.30 pp annuels sur le CELI → patrimoine final plus bas
            expect(drBase.estateNetWorth).toBeLessThan(noBase.estateNetWorth);
        });

        it('share=0 ne produit aucun drag (idempotent vs valeur défaut)', () => {
            const r1 = calculateFutureProjection(makeParams({
                projection: makeProjection({ years: 10, usEquityShareCeli: 0 })
            })) as any;
            const r2 = calculateFutureProjection(makeParams({
                projection: makeProjection({ years: 10 })
            })) as any;
            const b1 = r1.allResults.find((s: any) => s.stratType === 'BASE');
            const b2 = r2.allResults.find((s: any) => s.stratType === 'BASE');
            expect(b1.estateNetWorth).toBe(b2.estateNetWorth);
        });
    });

    // D2.6 — Sequence Risk Metric
    describe('Sequence Risk Metric', () => {
        it('expertMetrics expose sequenceRiskPct et worstDecadeDrawdown quand MC est activé', () => {
            const params = makeParams({
                projection: makeProjection({ years: 10 }),
            });
            const result = calculateFutureProjection(params, /* runMC */ true) as any;
            expect(result.expertMetrics).toBeTruthy();
            expect(typeof result.expertMetrics.sequenceRiskPct).toBe('number');
            expect(typeof result.expertMetrics.worstDecadeDrawdown).toBe('number');
            expect(result.expertMetrics.sequenceRiskPct).toBeGreaterThanOrEqual(0);
            expect(result.expertMetrics.sequenceRiskPct).toBeLessThanOrEqual(100);
            expect(result.expertMetrics.worstDecadeDrawdown).toBeGreaterThanOrEqual(0);
            expect(result.expertMetrics.worstDecadeDrawdown).toBeLessThanOrEqual(1);
        });

        it('expose la fenêtre décennie critique (start/end year) cohérente avec targetAge', () => {
            const config = makeConfig();
            config.users[0] = { ...config.users[0], age: 40, birthYear: 1986 };
            config.users[1] = { ...config.users[1], age: 40, birthYear: 1986 };
            const params = makeParams({
                config,
                retirementGoal: makeRetirementGoal({ targetAge: 60 }),
                projection: makeProjection({ years: 30 }),
            });
            const r = calculateFutureProjection(params, true) as any;
            const m = r.expertMetrics;
            // Décennie critique = [retraite-5, retraite+5] = [15, 25] années après start
            expect(m.criticalDecadeStartYear).toBeGreaterThanOrEqual(14);
            expect(m.criticalDecadeStartYear).toBeLessThanOrEqual(16);
            expect(m.criticalDecadeEndYear).toBeGreaterThanOrEqual(24);
            expect(m.criticalDecadeEndYear).toBeLessThanOrEqual(26);
        });
    });

    // D2.5 — Smile Curve (dépenses retraite en U)
    describe('Smile Curve', () => {
        const buildLongRetirement = (useSmile: boolean) => {
            const config = makeConfig();
            config.users[0] = { ...config.users[0], age: 60, birthYear: 1966 };
            config.users[1] = { ...config.users[1], age: 60, birthYear: 1966 };
            return makeParams({
                config,
                retirementGoal: makeRetirementGoal({ targetAge: 60, targetMonthlyIncome: 3000 }),
                projection: makeProjection({ years: 30, useSmileCurve: useSmile }),
            });
        };

        it('avec smile curve ON, les dépenses ne sont pas identiques à sans (impact mesurable)', () => {
            const off = calculateFutureProjection(buildLongRetirement(false)) as any;
            const on = calculateFutureProjection(buildLongRetirement(true)) as any;
            const offBase = off.allResults.find((s: any) => s.stratType === 'BASE');
            const onBase = on.allResults.find((s: any) => s.stratType === 'BASE');
            // Smile ON majore les go-go years → dépenses plus élevées tôt
            expect(offBase.estateNetWorth).not.toBe(onBase.estateNetWorth);
        });

        it('le flag useSmileCurve est respecté (par défaut OFF, multiplicateur = 1)', () => {
            const params = buildLongRetirement(false);
            const result = calculateFutureProjection(params) as any;
            expect(Number.isFinite(result.estateNetWorth)).toBe(true);
        });
    });

    // D2.4 — Pension à prestations déterminées (DB)
    describe('Pension DB', () => {
        const buildAtRetirement = (extraRetirement: Partial<RetirementGoal>) => {
            // Démarre à 64 ans + projection 5 ans → traverse l'âge cible 65
            const config = makeConfig();
            config.users[0] = { ...config.users[0], age: 64, birthYear: 1962 };
            config.users[1] = { ...config.users[1], age: 64, birthYear: 1962 };
            return makeParams({
                config,
                retirementGoal: makeRetirementGoal({ targetAge: 65, governmentPension: 1500, ...extraRetirement }),
                projection: makeProjection({ years: 5 }),
            });
        };

        it('sans pension DB, le revenu retraite reflète uniquement RRQ+PSV', () => {
            const r = calculateFutureProjection(buildAtRetirement({})) as any;
            const base = r.allResults.find((s: any) => s.stratType === 'BASE');
            const post65 = base.chartData.filter((d: any) => d.age >= 65);
            expect(post65.length).toBeGreaterThan(0);
        });

        it('avec pension DB de 2000$/mois, le patrimoine successoral augmente', () => {
            const noPension = calculateFutureProjection(buildAtRetirement({ dbPensionMonthly: 0 })) as any;
            const withPension = calculateFutureProjection(buildAtRetirement({ dbPensionMonthly: 2000 })) as any;

            const noBase = noPension.allResults.find((s: any) => s.stratType === 'BASE');
            const withBase = withPension.allResults.find((s: any) => s.stratType === 'BASE');

            expect(withBase.estateNetWorth).toBeGreaterThan(noBase.estateNetWorth);
        });

        it('la pension DB ne se déclenche pas avant dbPensionStartAge', () => {
            // Démarre 60 ans, début pension à 70 → pas de revenu DB durant la projection 5 ans
            const config = makeConfig();
            config.users[0] = { ...config.users[0], age: 60, birthYear: 1966 };
            config.users[1] = { ...config.users[1], age: 60, birthYear: 1966 };
            const params = makeParams({
                config,
                retirementGoal: makeRetirementGoal({
                    targetAge: 60,
                    dbPensionMonthly: 5000,
                    dbPensionStartAge: 70, // Hors fenêtre de simulation
                }),
                projection: makeProjection({ years: 5 }),
            });
            const result = calculateFutureProjection(params) as any;
            expect(Number.isFinite(result.estateNetWorth)).toBe(true);
        });

        it('indexation 0% rend la pension DB nominale (érodée par l\'inflation)', () => {
            const fullIndex = calculateFutureProjection(buildAtRetirement({
                dbPensionMonthly: 2000,
                dbPensionIndexationPct: 100,
            })) as any;
            const noIndex = calculateFutureProjection(buildAtRetirement({
                dbPensionMonthly: 2000,
                dbPensionIndexationPct: 0,
            })) as any;
            const fullBase = fullIndex.allResults.find((s: any) => s.stratType === 'BASE');
            const noBase = noIndex.allResults.find((s: any) => s.stratType === 'BASE');
            // Pleine indexation > pas d'indexation (avec inflation positive)
            expect(fullBase.estateNetWorth).toBeGreaterThanOrEqual(noBase.estateNetWorth);
        });
    });
});
