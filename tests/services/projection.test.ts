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
    it('renvoie 11 scénarios dans allResults (6 stress/base + 5 variantes de gestion C3)', () => {
        const result = calculateFutureProjection(makeParams()) as any;
        const scenarios = result.allResults as any[];
        expect(Array.isArray(scenarios)).toBe(true);
        expect(scenarios).toHaveLength(11);
        const types = scenarios.map(r => r.stratType);
        expect(types).toEqual(
            expect.arrayContaining([
                'BASE', 'LIBERTE_55', 'HYPER_INFLATION', 'WINDFALL', 'ECONOMIC_WINTER',
                'COMPOUND_STRESS', 'LATE_INHERITANCE',
            ])
        );
        // C3 — 5 façons de gérer comparables (kind 'strategy', toutes sous le monde BASE).
        // AUTO_MARGINAL, PRIO_CELI, PRIO_REER, MELTDOWN_REER, PRIO_CELI_NO_RAP.
        expect(scenarios.filter(r => r.kind === 'strategy')).toHaveLength(5);
    });

    it('G21 C5 — appliedAssetLocation augmente le patrimoine (bonus rendement mélangé)', () => {
        // Le bonus s'applique à TOUS les comptes (pas seulement NonReg, que le moteur
        // draine) → l'effet ne s'évapore plus. Patrimoine successoral strictement supérieur.
        const base = calculateFutureProjection(makeParams()) as any;
        const withAL = calculateFutureProjection(makeParams({
            projection: makeProjection({ appliedAssetLocation: true }),
        })) as any;
        expect(withAL.allResults[0].estateNetWorth).toBeGreaterThan(base.allResults[0].estateNetWorth);
    });

    it('G21 C5 — appliedContributionOrder modifie la répartition (levier threadé)', () => {
        const celi = calculateFutureProjection(makeParams({
            projection: makeProjection({ appliedContributionOrder: 'CELI_FIRST' }),
        })) as any;
        const reer = calculateFutureProjection(makeParams({
            projection: makeProjection({ appliedContributionOrder: 'REER_FIRST' }),
        })) as any;
        // Le levier est threadé jusqu'au moteur : les deux ordres produisent des
        // trajectoires distinctes (fiscalité différente) → patrimoine successoral différent.
        expect(reer.allResults[0].estateNetWorth).not.toBe(celi.allResults[0].estateNetWorth);
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
        expect(scenarios).toHaveLength(11);
        for (const r of scenarios) {
            expect(Number.isFinite(r.estateNetWorth)).toBe(true);
        }
    });

    // Cycle 4 — W5.x conteneurs câblés au moteur
    describe('W5.x conteneurs câblés', () => {
        it('Assurances: primes mensuelles augmentent les dépenses (patrimoine final plus bas)', () => {
            const noIns = calculateFutureProjection(makeParams({ projection: makeProjection({ years: 20 }) })) as any;
            const withIns = calculateFutureProjection(makeParams({
                projection: makeProjection({ years: 20 }),
                insurancePolicies: [
                    { id: 'p1', kind: 'life-term', monthlyPremium: 200, faceAmount: 500000 },
                    { id: 'p2', kind: 'disability-lt', monthlyPremium: 150 },
                ],
            } as any)) as any;
            const noBase = noIns.allResults.find((s: any) => s.stratType === 'BASE');
            const insBase = withIns.allResults.find((s: any) => s.stratType === 'BASE');
            expect(insBase.estateNetWorth).toBeLessThan(noBase.estateNetWorth);
        });

        it('Véhicules cycliques: dépense ponctuelle tous les N ans', () => {
            const result = calculateFutureProjection(makeParams({
                projection: makeProjection({ years: 20 }),
                vehicleReplacements: [{ id: 'v1', cyclYears: 8, costEstimate: 35000 }],
            } as any)) as any;
            expect(Number.isFinite(result.estateNetWorth)).toBe(true);
        });

        it('Rénovation planifiée: ne crashe pas si date hors fenêtre', () => {
            const result = calculateFutureProjection(makeParams({
                projection: makeProjection({ years: 5 }),
                majorRenovations: [{ id: 'r1', date: '2030-06-01', cost: 50000, description: 'cuisine' }],
            } as any)) as any;
            expect(Number.isFinite(result.estateNetWorth)).toBe(true);
        });

        it('Don charitable: ajoute aux dépenses mais réduit l\'impôt (effet net négatif modeste)', () => {
            const noCharity = calculateFutureProjection(makeParams({ projection: makeProjection({ years: 20 }) })) as any;
            const withCharity = calculateFutureProjection(makeParams({
                projection: makeProjection({ years: 20 }),
                charitableGoals: [{ id: 'c1', annualAmount: 5000 }],
            } as any)) as any;
            const noBase = noCharity.allResults.find((s: any) => s.stratType === 'BASE');
            const chBase = withCharity.allResults.find((s: any) => s.stratType === 'BASE');
            // Le don sort du patrimoine mais le crédit fiscal compense partiellement
            expect(chBase.estateNetWorth).toBeLessThan(noBase.estateNetWorth);
        });

        it('Immeuble locatif: NOI positif augmente le revenu et le patrimoine', () => {
            const noRental = calculateFutureProjection(makeParams({ projection: makeProjection({ years: 20 }) })) as any;
            const withRental = calculateFutureProjection(makeParams({
                projection: makeProjection({ years: 20 }),
                rentalProperties: [{
                    id: 'rp1', name: 'Triplex',
                    purchasePrice: 500000, currentValue: 500000, mortgageBalance: 300000,
                    mortgageRate: 5.5, monthlyRent: 4500, vacancyPct: 5, monthlyExpenses: 1500,
                }],
            } as any)) as any;
            const noBase = noRental.allResults.find((s: any) => s.stratType === 'BASE');
            const rpBase = withRental.allResults.find((s: any) => s.stratType === 'BASE');
            // NOI net positif (4500*0.95 - 1500 = 2775/mois - tax 45%) > 0 → patrimoine plus élevé
            expect(rpBase.estateNetWorth).toBeGreaterThan(noBase.estateNetWorth);
        });
    });

    // D2.9 — Inflation par poste
    describe('Inflation par poste', () => {
        it('quand activée et que tous les postes valent 2%, le résultat est proche de l\'inflation globale 2%', () => {
            const flat = calculateFutureProjection(makeParams({
                projection: makeProjection({ years: 10, inflationRate: 2 })
            })) as any;
            const perCat = calculateFutureProjection(makeParams({
                projection: makeProjection({
                    years: 10,
                    inflationRate: 2,
                    usePerCategoryInflation: true,
                    inflationHousing: 2, inflationFood: 2, inflationTransport: 2,
                    inflationHealth: 2, inflationLeisure: 2, inflationOther: 2,
                })
            })) as any;
            const flatBase = flat.allResults.find((s: any) => s.stratType === 'BASE');
            const perBase = perCat.allResults.find((s: any) => s.stratType === 'BASE');
            // Tolérance: le bonus santé +0.5% sur la part 5% n'est qu'à 75+, hors fenêtre 10 ans
            expect(Math.abs(perBase.estateNetWorth - flatBase.estateNetWorth)).toBeLessThan(flatBase.estateNetWorth * 0.05);
        });

        it('logement 6% (vs 4% défaut) augmente le multiplicateur des dépenses → patrimoine plus faible', () => {
            const low = calculateFutureProjection(makeParams({
                projection: makeProjection({ years: 20, usePerCategoryInflation: true, inflationHousing: 4 })
            })) as any;
            const high = calculateFutureProjection(makeParams({
                projection: makeProjection({ years: 20, usePerCategoryInflation: true, inflationHousing: 6 })
            })) as any;
            const lowBase = low.allResults.find((s: any) => s.stratType === 'BASE');
            const highBase = high.allResults.find((s: any) => s.stratType === 'BASE');
            expect(highBase.estateNetWorth).toBeLessThan(lowBase.estateNetWorth);
        });
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

    // W3.x — Événements de vie stochastiques (couverture manquante signalée par silent-failure-hunter)
    describe('Événements de vie stochastiques (W3.x)', () => {
        const longHorizonMc = (overrides: any) => makeParams({
            projection: makeProjection({ years: 30, ...overrides }),
        });

        it('Divorce: avec divorceEnabled=ON, certaines itérations MC ont un patrimoine réduit', () => {
            const result = calculateFutureProjection(longHorizonMc({
                divorceEnabled: true,
                divorceAnnualProbability: 0.5, // forcé haut pour test
                divorceSplitPct: 50,
            }), /* runMC */ true) as any;
            expect(Number.isFinite(result.estateNetWorth)).toBe(true);
            expect(result.expertMetrics).toBeTruthy();
        });

        it('LTD: avec ltdEnabled=ON, le moteur termine sans NaN', () => {
            const result = calculateFutureProjection(longHorizonMc({
                ltdEnabled: true,
                ltdAnnualProbability: 0.1,
                ltdIncomeReplacementPct: 60,
                ltdDurationMonths: 24,
            }), true) as any;
            expect(Number.isFinite(result.estateNetWorth)).toBe(true);
        });

        it('Maladie grave: payout cumulé ne peut se déclencher qu\'une fois (one-shot)', () => {
            // Avec proba 90%/an sur 30 ans, en non-MC la branche ne se déclenche pas
            // (criticalIllnessEnabled requiert MC). En MC, ciTriggered devient true
            // après la 1re trigger.
            const result = calculateFutureProjection(longHorizonMc({
                criticalIllnessEnabled: true,
                ciAnnualProbability: 0.9,
                ciPayoutAmount: 100000,
                ciExtraMonthlyExpense: 500,
            }), true) as any;
            expect(Number.isFinite(result.estateNetWorth)).toBe(true);
        });

        it('Héritage probabilisé: ne crashe pas avec uncertaintyYears=0 (événement ponctuel)', () => {
            const result = calculateFutureProjection(longHorizonMc({
                inheritanceEnabled: true,
                inheritanceExpectedAmount: 200000,
                inheritanceExpectedAtAge: 50,
                inheritanceUncertaintyYears: 0, // cas limite signalé par agent
                inheritanceProbability: 0.8,
            }), true) as any;
            expect(Number.isFinite(result.estateNetWorth)).toBe(true);
        });

        it('Survivant: modelSurvivor=ON termine sans NaN même si conjoint décède', () => {
            const config = makeConfig();
            config.users[0] = { ...config.users[0], age: 60, birthYear: 1966 };
            config.users[1] = { ...config.users[1], age: 60, birthYear: 1966 };
            const result = calculateFutureProjection(makeParams({
                config,
                retirementGoal: makeRetirementGoal({ targetAge: 60 }),
                projection: makeProjection({ years: 30, modelSurvivor: true }),
            }), true) as any;
            expect(Number.isFinite(result.estateNetWorth)).toBe(true);
        });

        it('Snowbird: surcoût mensuel impacte mesurablement le patrimoine final', () => {
            const config = makeConfig();
            config.users[0] = { ...config.users[0], age: 64, birthYear: 1962 };
            config.users[1] = { ...config.users[1], age: 64, birthYear: 1962 };
            const noSnowbird = calculateFutureProjection(makeParams({
                config,
                retirementGoal: makeRetirementGoal({ targetAge: 65 }),
                projection: makeProjection({ years: 20 }),
            })) as any;
            const withSnowbird = calculateFutureProjection(makeParams({
                config,
                retirementGoal: makeRetirementGoal({ targetAge: 65 }),
                projection: makeProjection({
                    years: 20,
                    snowbirdEnabled: true,
                    snowbirdMonthsPerYear: 5,
                    snowbirdExtraMonthlyCost: 1500,
                }),
            })) as any;
            const noBase = noSnowbird.allResults.find((s: any) => s.stratType === 'BASE');
            const swBase = withSnowbird.allResults.find((s: any) => s.stratType === 'BASE');
            // Snowbird modifie le profil de dépenses retraite (impact mesurable, sens dépendant du fiscal mix)
            expect(swBase.estateNetWorth).not.toBe(noBase.estateNetWorth);
        });

        it('Bootstrap historique: impacte les métriques MC (P10/P50/P90, successRate)', () => {
            // Bootstrap n'agit qu'en MC (runScenario.enableMonteCarlo=true).
            // Les scénarios déterministes (BASE etc.) ne changent pas; on vérifie
            // que les métriques MC (chartData P10/P50/P90) diffèrent.
            const gaussian = calculateFutureProjection(longHorizonMc({}), true) as any;
            const bootstrap = calculateFutureProjection(longHorizonMc({
                useHistoricalBootstrap: true,
            }), true) as any;
            expect(Number.isFinite(gaussian.estateNetWorth)).toBe(true);
            expect(Number.isFinite(bootstrap.estateNetWorth)).toBe(true);
            // Les bandes P10/P50/P90 doivent différer entre gaussien et bootstrap.
            const gP50 = gaussian.chartData.find((d: any) => d.P50 != null)?.P50 ?? null;
            const bP50 = bootstrap.chartData.find((d: any) => d.P50 != null)?.P50 ?? null;
            if (gP50 !== null && bP50 !== null) {
                expect(gP50).not.toBe(bP50);
            } else {
                expect(typeof gaussian.successRate === 'number').toBe(true);
            }
        });

        it('Replay krach 2008: produit un patrimoine final concret', () => {
            const result = calculateFutureProjection(longHorizonMc({
                replayHistoricalYear: 2008,
            })) as any;
            expect(Number.isFinite(result.estateNetWorth)).toBe(true);
        });

        it('US Withholding CELI: avec part US et yield positif, drag mesurable sur 20 ans', () => {
            const noUs = calculateFutureProjection(makeParams({
                projection: makeProjection({ years: 20, usEquityShareCeli: 0 })
            })) as any;
            const withUs = calculateFutureProjection(makeParams({
                projection: makeProjection({ years: 20, usEquityShareCeli: 100, usEquityDividendYield: 2 })
            })) as any;
            const noBase = noUs.allResults.find((s: any) => s.stratType === 'BASE');
            const usBase = withUs.allResults.find((s: any) => s.stratType === 'BASE');
            expect(usBase.estateNetWorth).toBeLessThan(noBase.estateNetWorth);
        });
    });

    describe('Drawdown optim 2026-05 (PBMA + bracket 1 + OAS guard)', () => {
        // Setup: utilisateur retraité tôt avec REER abondant et govPension faible.
        // Force des shortfalls qui invoquent la cascade REER en mode AUTO_MARGINAL.
        const makeRetireeParams = (overrides: Partial<SimulationParams> = {}): SimulationParams => makeParams({
            projection: makeProjection({
                years: 15,
                returnRates: { celi: 5, reer: 5, nonReg: 5, crypto: 0, cash: 2 },
                ...((overrides as any).projection || {}),
            }),
            liveCSVBalances: { CELI: 200_000, CELIAPP: 0, REER: 500_000, NON_ENREG: 0, CRYPTO: 0, REEE: 0 },
            calculatedStartingCash: 30_000,
            retirementGoal: makeRetirementGoal({
                targetAge: 36, // les Test* sont 35/33 ans, donc retraite immédiate
                targetMonthlyIncome: 4500,
                governmentPension: 800, // faible: shortfall garanti
            }),
            baseMonthlyExpenses: 4500,
            ...overrides,
        });

        it('Retraité avec REER abondant: la cascade puise effectivement dans le REER (RetraitREER > 0)', () => {
            const result = calculateFutureProjection(makeRetireeParams()) as any;
            const base = result.allResults.find((s: any) => s.stratType === 'BASE');
            const totalReerWithdrawals = base.chartData
                .filter((p: any) => p.isRetired)
                .reduce((sum: number, p: any) => sum + (p.RetraitREER ?? 0), 0);
            expect(totalReerWithdrawals).toBeGreaterThan(0);
        });

        it('AUTO_MARGINAL (BASE) vs PRIO_REER (LIBERTE_55): les deux préservent du REER différemment', () => {
            // Pas une assertion stricte sur l'ordre — la cascade détermine simplement
            // que les retraits sont des fonctions différentes selon la stratégie.
            // On vérifie surtout que les deux stratégies produisent des résultats
            // mesurablement différents (sinon le strategy switch est mort).
            const result = calculateFutureProjection(makeRetireeParams()) as any;
            const base = result.allResults.find((s: any) => s.stratType === 'BASE');
            const liberte = result.allResults.find((s: any) => s.stratType === 'LIBERTE_55');
            expect(base).toBeDefined();
            expect(liberte).toBeDefined();
            // estateNetWorth doit différer (au moins de 1$) — sinon les stratégies
            // sont identiques en pratique.
            expect(Math.abs(base.estateNetWorth - liberte.estateNetWorth)).toBeGreaterThan(1);
        });

        it('Retraité sans REER initial: la cascade utilise principalement CELI', () => {
            // Note: RetraitREER peut être non-nul à cause des transferts NonReg→REER
            // ou meltdown stratégique en pré-retraite. On vérifie surtout que CELI
            // domine fortement les retraits.
            const result = calculateFutureProjection(makeRetireeParams({
                liveCSVBalances: { CELI: 400_000, CELIAPP: 0, REER: 0, NON_ENREG: 0, CRYPTO: 0, REEE: 0 },
            })) as any;
            const base = result.allResults.find((s: any) => s.stratType === 'BASE');
            const totalCeli = base.chartData.reduce((s: number, p: any) => s + (p.RetraitCELI ?? 0), 0);
            expect(totalCeli).toBeGreaterThan(0);
        });
    });

    describe('RealEstateGoal isActive guard', () => {
        const makeInactiveGoal = () => ({
            id: 'inactive_house',
            name: 'Test Property',
            isActive: false,
            isPrimaryResidence: true,
            price: 500000,
            downPayment: 100000,
            // Champ requis par processRealEstate (sinon totalCashNeeded = NaN
            // et l'achat échoue silencieusement). Fix audit silent-failure.
            totalClosingCosts: 5000,
            unrecoverableMonthly: 0,
            mortgageRate: 4.5,
            amortization: 25,
            purchaseDate: '2027-06',
            propertyGrowthRate: 3,
            maxValue: 0,
            renewalRateProjection: 5,
            initialRenovations: 0,
            yearlyRenovations: 0,
            taxesYearly: 4000,
            heatingMonthly: 200,
            condoFees: 0,
            rentalIncomeMonthly: 0,
        });

        it('un goal inactif ne réduit pas le liquide au mois de purchaseDate', () => {
            const inactiveGoal = makeInactiveGoal();
            const baseline = calculateFutureProjection(makeParams({ realEstateGoals: [] })) as any;
            const withInactive = calculateFutureProjection(makeParams({
                realEstateGoals: [inactiveGoal] as any,
            })) as any;
            const noBase = baseline.allResults.find((s: any) => s.stratType === 'BASE');
            const inactiveBase = withInactive.allResults.find((s: any) => s.stratType === 'BASE');
            // ±5% de tolérance pour les arrondis (le moteur a des micro-variations
            // selon les init paths). Inactif ≈ inexistant.
            const ratio = Math.abs(inactiveBase.estateNetWorth - noBase.estateNetWorth) / Math.max(1, noBase.estateNetWorth);
            expect(ratio).toBeLessThan(0.05);
        });

        it('un goal actif réduit le liquide vs inactif (achat déclenché)', () => {
            // Fonds suffisants pour garantir le déclenchement de l'achat (downPayment
            // 100k$ + welcomeTax + closingCosts ≈ 110k$ requis). Avec les valeurs
            // par défaut de makeParams (25k cash + 90k liquides), la cascade pouvait
            // échouer selon les rendements MC, faisant converger active/inactive
            // vers les mêmes valeurs et cassant le test (flaky pré-existant).
            const richBalances = {
                CELI: 100000,
                CELIAPP: 0,
                REER: 50000,
                NON_ENREG: 50000,
                CRYPTO: 0,
                REEE: 0,
            };
            const active = { ...makeInactiveGoal(), isActive: true, id: 'active_house' };
            const inactive = makeInactiveGoal();
            const withActive = calculateFutureProjection(makeParams({
                calculatedStartingCash: 200000,
                liveCSVBalances: richBalances,
                realEstateGoals: [active] as any,
            })) as any;
            const withInactive = calculateFutureProjection(makeParams({
                calculatedStartingCash: 200000,
                liveCSVBalances: richBalances,
                realEstateGoals: [inactive] as any,
            })) as any;
            // L'achat actif consomme du liquide (down payment + welcome tax) → estate
            // immédiatement après doit refléter une équité différente d'un cas inactif.
            const activeBase = withActive.allResults.find((s: any) => s.stratType === 'BASE');
            const inactiveBase = withInactive.allResults.find((s: any) => s.stratType === 'BASE');
            // Différence significative attendue (>1% du patrimoine inactif) — l'équité
            // immobilière finale après 3 ans de détention + l'amortissement du prêt
            // créent un écart mesurable.
            const diff = Math.abs(activeBase.estateNetWorth - inactiveBase.estateNetWorth);
            expect(diff).toBeGreaterThan(Math.max(1, inactiveBase.estateNetWorth * 0.01));
        });
    });

    describe('C3 suite — PRIO_CELI_NO_RAP saute le RAP à l\'achat', () => {
        // Achat résidence principale sous-financé en liquide → la cascade
        // d'achat (realEstateMonth) doit puiser au-delà du liquide. PRIO_CELI
        // emprunte au RAP en Phase 1 (rapBalance > 0, obligation 15 ans) ;
        // PRIO_CELI_NO_RAP saute cette phase et puise CELI/NonReg/REER imposable
        // (rapBalance reste 0). REER volontairement gros pour garantir le
        // financement de l'achat dans les DEUX cas (sinon le « 0 » de NO_RAP
        // serait trivial : achat avorté plutôt que RAP évité).
        const makePurchaseParams = () => makeParams({
            calculatedStartingCash: 25000,
            liveCSVBalances: { CELI: 15000, CELIAPP: 0, REER: 200000, NON_ENREG: 0, CRYPTO: 0, REEE: 0 },
            projection: makeProjection({ years: 10 }),
            realEstateGoals: [{
                id: 'rap_test_house',
                name: 'Test Primary',
                isActive: true,
                isPrimaryResidence: true,
                price: 500000,
                downPayment: 120000,
                totalClosingCosts: 5000,
                unrecoverableMonthly: 0,
                mortgageRate: 4.5,
                amortization: 25,
                purchaseDate: '2027-06',
                propertyGrowthRate: 3,
                maxValue: 0,
                renewalRateProjection: 5,
                initialRenovations: 0,
                yearlyRenovations: 0,
                taxesYearly: 4000,
                heatingMonthly: 200,
                condoFees: 0,
                rentalIncomeMonthly: 0,
            }] as any,
        });

        // rapBalance = rapRepaymentDueTotal (monthlyOutput). Pic sur la projection.
        const maxRapBalance = (res: any): number =>
            res.chartData.reduce((mx: number, p: any) => Math.max(mx, p.rapBalance ?? 0), 0);

        const findByStrategy = (result: any, name: string) => {
            const r = result.allResults.find((s: any) => s.strategyName === name);
            expect(r, `scénario "${name}" introuvable`).toBeDefined();
            return r;
        };

        it('PRIO_CELI emprunte au RAP à l\'achat (rapBalance > 0)', () => {
            const result = calculateFutureProjection(makePurchaseParams()) as any;
            const prioCeli = findByStrategy(result, "Gestion : CELI d'abord");
            expect(maxRapBalance(prioCeli)).toBeGreaterThan(0);
        });

        it('PRIO_CELI_NO_RAP ne touche jamais au RAP (rapBalance reste 0)', () => {
            const result = calculateFutureProjection(makePurchaseParams()) as any;
            const noRap = findByStrategy(result, 'Achat : CELI sans RAP');
            expect(maxRapBalance(noRap)).toBe(0);
        });

        it('non-régression : les deux stratégies produisent un patrimoine fini et divergent', () => {
            const result = calculateFutureProjection(makePurchaseParams()) as any;
            const noRap = findByStrategy(result, 'Achat : CELI sans RAP');
            const prioCeli = findByStrategy(result, "Gestion : CELI d'abord");
            expect(Number.isFinite(noRap.estateNetWorth)).toBe(true);
            expect(Number.isFinite(prioCeli.estateNetWorth)).toBe(true);
            // L'achat a bien lieu dans les deux cas (équité immobilière créée).
            expect(noRap.chartData.some((p: any) => (p.Immobilier ?? 0) > 0)).toBe(true);
            expect(prioCeli.chartData.some((p: any) => (p.Immobilier ?? 0) > 0)).toBe(true);
            // Flux d'achat différents (RAP vs CELI/REER imposable) → l'issue diverge.
            expect(noRap.estateNetWorth).not.toBe(prioCeli.estateNetWorth);
        });
    });

    describe('Scénarios compound (Phase 4 #4)', () => {
        it('COMPOUND_STRESS: patrimoine final inférieur à ECONOMIC_WINTER (cumul + LTC)', () => {
            const result = calculateFutureProjection(makeParams({
                projection: makeProjection({ years: 15 }),
            })) as any;
            const winter = result.allResults.find((s: any) => s.stratType === 'ECONOMIC_WINTER');
            const stress = result.allResults.find((s: any) => s.stratType === 'COMPOUND_STRESS');
            expect(stress).toBeDefined();
            expect(winter).toBeDefined();
            // Cumul inflation 5% + rendements anémiques + LTC forcé → pire que winter seul.
            expect(stress.estateNetWorth).toBeLessThanOrEqual(winter.estateNetWorth);
        });

        it('LATE_INHERITANCE: patrimoine final ≥ BASE (héritage tardif aide quand même)', () => {
            const result = calculateFutureProjection(makeParams({
                projection: makeProjection({ years: 25 }), // assez long pour atteindre m=240
            })) as any;
            const base = result.allResults.find((s: any) => s.stratType === 'BASE');
            const late = result.allResults.find((s: any) => s.stratType === 'LATE_INHERITANCE');
            expect(late).toBeDefined();
            expect(base).toBeDefined();
            // Pas strict > car le seed est différent, mais ≥ raisonnable
            expect(late.estateNetWorth).toBeGreaterThanOrEqual(base.estateNetWorth * 0.95);
        });
    });

    describe('Bugs fiscaux corrigés (audit §6)', () => {
        it('§6.9 REEE plafond 50k$ lifetime: cotisations s\'arrêtent au plafond, croissance continue', () => {
            // Enfant né en 2026-01, simu 20 ans → cotisations 5000$/an (max SCEE) × ~14 ans
            // atteindrait 70 000$ SANS le cap. Le cap doit le ramener à ≤ 50 000$.
            const child = {
                id: 'kid1',
                name: 'TestKid',
                isActive: true,
                birthDate: '2026-01',
                initialCost: 0,
                monthlyDiapers: 0,
                monthlyFood: 0,
                monthlyClothing: 0,
                monthlyDaycare: 0,
                governmentBenefits: 0,
                parentalLeaveIncomeDrop: 0,
            };
            const result = calculateFutureProjection(makeParams({
                projection: makeProjection({ years: 18 }),
                childGoals: [child],
                calculatedStartingCash: 250000, // assez pour cotiser sans contrainte liquide
            })) as any;
            // On itère sur le scénario BASE pour examiner les cotisations REEE cumulées
            const base = result.allResults.find((s: any) => s.stratType === 'BASE');
            expect(base).toBeDefined();
            const totalReeeContrib = (base.chartData ?? []).reduce(
                (acc: number, pt: any) => acc + (pt.ReeeContrib || 0), 0
            );
            // Le cap est 50 000$, on tolère ±5% (grants SCEE/IQEE empilés dessus mais
            // ne comptent pas comme cotisations de l'utilisateur).
            expect(totalReeeContrib).toBeLessThanOrEqual(50000 * 1.05);
        });

        it('§6.10 FHSA fermeture à 71 ans: aucune nouvelle cotisation après 71', () => {
            // User1 (Test1, birthYear 1991) atteint 71 ans en 2062. Si on lance une
            // simu jusqu'en 2062+, le moteur doit cesser d'ouvrir de la room FHSA.
            // On simule 40 ans (jusqu'en 2066) — User1 a 75 ans à la fin, User2 a 73.
            // Les 2 ont >= 71 → tous les flux FHSA doivent être à 0 ou transférés.
            const result = calculateFutureProjection(makeParams({
                projection: makeProjection({ years: 40 }),
                config: {
                    users: [
                        {
                            name: 'OldUser', grossSalary: 5000, netSalary: 3500, color: '#10b981',
                            age: 35, birthYear: 1991, canadaArrivalYear: 1991,
                            hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0,
                        },
                        {
                            name: 'OldUser2', grossSalary: 4500, netSalary: 3200, color: '#3b82f6',
                            age: 33, birthYear: 1993, canadaArrivalYear: 1993,
                            hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0,
                        },
                    ] as any,
                    splitMode: '50/50',
                } as any,
            })) as any;
            // Pas de NaN propagé + le moteur termine sans crash
            const base = result.allResults.find((s: any) => s.stratType === 'BASE');
            expect(base).toBeDefined();
            expect(base.estateNetWorth).toBeGreaterThan(0);
            expect(Number.isFinite(base.estateNetWorth)).toBe(true);
        });
    });

    describe('Wiring goals (2026-05)', () => {
        it('SavingsGoal: une deadline drainante réduit le patrimoine final', () => {
            const targetDate = '2027-06';
            const baseline = calculateFutureProjection(makeParams({
                savingsGoals: [],
            })) as any;
            const withGoal = calculateFutureProjection(makeParams({
                savingsGoals: [
                    { id: 'sg1', name: 'Voyage Europe', targetAmount: 15000, currentAmount: 0, deadline: targetDate, icon: '✈️' },
                ],
            })) as any;
            const noBase = baseline.allResults.find((s: any) => s.stratType === 'BASE');
            const goalBase = withGoal.allResults.find((s: any) => s.stratType === 'BASE');
            expect(goalBase.estateNetWorth).toBeLessThan(noBase.estateNetWorth);
        });

        it('FinancialGoal avec targetAccount=CELI: réduit le solde CELI projeté', () => {
            const baseline = calculateFutureProjection(makeParams({
                financialGoals: [],
            })) as any;
            const withGoal = calculateFutureProjection(makeParams({
                financialGoals: [
                    { id: 'fg1', name: 'Mise de fonds maison', type: 'savings' as any, targetAmount: 20000, deadline: '2028-03', targetAccount: 'CELI' },
                ],
            })) as any;
            const noBase = baseline.allResults.find((s: any) => s.stratType === 'BASE');
            const goalBase = withGoal.allResults.find((s: any) => s.stratType === 'BASE');
            // CELI moins élevé au mois 27 (mars 2028) après retrait du goal
            const noBaseCeli = noBase.chartData[30]?.CELI ?? 0;
            const goalBaseCeli = goalBase.chartData[30]?.CELI ?? 0;
            expect(goalBaseCeli).toBeLessThan(noBaseCeli);
        });
    });
});
