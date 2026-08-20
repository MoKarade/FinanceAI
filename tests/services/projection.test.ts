import { describe, it, expect } from 'vitest';
import { calculateFutureProjection, type SimulationParams } from '../../services/projection';
import { computeDonationCredit } from '../../utils/donationCredit';
import type {
    ProjectionConfig,
    BudgetConfig,
    RetirementGoal,
    Debt,
    RealEstateGoal,
} from '../../types';
import type { ProjectionResult, ProjectionChartPoint } from '../../services/projection/types';

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

// [UI-SCEN] (2026-06-09) — par défaut le moteur ne calcule QUE la stratégie sélectionnée
// (projection.withdrawalStrategy, défaut AUTO_MARGINAL). Les tests qui comparent des
// SCÉNARIOS demandent explicitement les types voulus via onlyStratTypes :
const ALL_TYPES = ['BASE', 'LIBERTE_55', 'HYPER_INFLATION', 'WINDFALL', 'ECONOMIC_WINTER', 'COMPOUND_STRESS', 'LATE_INHERITANCE'];

    it('[UI-SCEN] par DÉFAUT : UN seul scénario (la stratégie sélectionnée, AUTO_MARGINAL)', () => {
        const result: ProjectionResult = calculateFutureProjection(makeParams());
        const scenarios = result.allResults as ProjectionResult[];
        expect(scenarios).toHaveLength(1);
        expect(scenarios[0].stratType).toBe('BASE');
        expect(scenarios[0].strategyName).toBe('Le Plan de Base');
    });

    it('[UI-SCEN] withdrawalStrategy sélectionne la façon de gérer calculée', () => {
        const result: ProjectionResult = calculateFutureProjection(makeParams({
            projection: makeProjection({ withdrawalStrategy: 'PRIO_CELI' }),
        }));
        expect(result.allResults).toHaveLength(1);
        expect(result.allResults![0].strategyName).toBe("Gestion : CELI d'abord");
    });

    it('[UI-SCEN] stress-tests demandés explicitement → stratégie sélectionnée + 6 chocs', () => {
        const result: ProjectionResult = calculateFutureProjection(makeParams(), false, 0, ALL_TYPES);
        const scenarios = result.allResults as ProjectionResult[];
        expect(scenarios).toHaveLength(7); // 1 façon de gérer (la sélectionnée) + 6 stress
        const types = scenarios.map(r => r.stratType);
        expect(types).toEqual(
            expect.arrayContaining([
                'BASE', 'LIBERTE_55', 'HYPER_INFLATION', 'WINDFALL', 'ECONOMIC_WINTER',
                'COMPOUND_STRESS', 'LATE_INHERITANCE',
            ])
        );
        expect(scenarios.filter(r => (r as ProjectionResult & { kind?: string }).kind === 'strategy')).toHaveLength(1);
    });

    it('G21 C5 — appliedAssetLocation augmente le patrimoine (bonus rendement mélangé)', () => {
        // Le bonus s'applique à TOUS les comptes (pas seulement NonReg, que le moteur
        // draine) → l'effet ne s'évapore plus. Patrimoine successoral strictement supérieur.
        const base: ProjectionResult = calculateFutureProjection(makeParams());
        const withAL: ProjectionResult = calculateFutureProjection(makeParams({
            projection: makeProjection({ appliedAssetLocation: true }),
        }));
        expect(withAL.allResults![0].estateNetWorth).toBeGreaterThan(base.allResults![0].estateNetWorth!);
    });

    it('G21 C5 — appliedContributionOrder modifie la répartition (levier threadé)', () => {
        const celi: ProjectionResult = calculateFutureProjection(makeParams({
            projection: makeProjection({ appliedContributionOrder: 'CELI_FIRST' }),
        }));
        const reer: ProjectionResult = calculateFutureProjection(makeParams({
            projection: makeProjection({ appliedContributionOrder: 'REER_FIRST' }),
        }));
        // Le levier est threadé jusqu'au moteur : les deux ordres produisent des
        // trajectoires distinctes (fiscalité différente) → patrimoine successoral différent.
        expect(reer.allResults![0].estateNetWorth).not.toBe(celi.allResults![0].estateNetWorth);
    });

    it('chaque scénario a un chartData non vide proche de years*12 entrées', () => {
        const params = makeParams();
        const result: ProjectionResult = calculateFutureProjection(params);
        const scenarios = result.allResults as ProjectionResult[];
        const expectedMonths = (params.projection.years || 5) * 12;
        for (const r of scenarios) {
            expect(r.chartData.length).toBeGreaterThan(expectedMonths - 2);
            expect(r.chartData.length).toBeLessThanOrEqual(expectedMonths + 2);
        }
    });

    it('gainVsAuto vaut 0 pour le scénario BASE', () => {
        const result: ProjectionResult = calculateFutureProjection(makeParams());
        const scenarios = result.allResults as ProjectionResult[];
        const base = scenarios.find(r => r.stratType === 'BASE');
        expect(base).toBeDefined();
        expect(base!.gainVsAuto).toBe(0);
    });

    it('estateNetWorth est numérique non-NaN dans tous les scénarios', () => {
        const result: ProjectionResult = calculateFutureProjection(makeParams());
        const scenarios = result.allResults as ProjectionResult[];
        for (const r of scenarios) {
            expect(typeof r.estateNetWorth).toBe('number');
            expect(Number.isNaN(r.estateNetWorth)).toBe(false);
            expect(Number.isFinite(r.estateNetWorth)).toBe(true);
        }
    });

    it('WINDFALL augmente le patrimoine vs BASE (héritage 250k $)', () => {
        const result: ProjectionResult = calculateFutureProjection(makeParams(), false, 0, ALL_TYPES);
        const scenarios = result.allResults as ProjectionResult[];
        const base = scenarios.find(r => r.stratType === 'BASE');
        const windfall = scenarios.find(r => r.stratType === 'WINDFALL');
        expect(windfall!.estateNetWorth).toBeGreaterThan(base!.estateNetWorth!);
    });

    it('HYPER_INFLATION dégrade le PORTEFEUILLE vs BASE (dépenses inflatées à 5,5 %)', () => {
        const result: ProjectionResult = calculateFutureProjection(makeParams(), false, 0, ALL_TYPES);
        const scenarios = result.allResults as ProjectionResult[];
        const base = scenarios.find(r => r.stratType === 'BASE');
        const hyper = scenarios.find(r => r.stratType === 'HYPER_INFLATION');
        // L'inflation 5,5 % érode le PORTEFEUILLE (`finalNetWorth` = patrimoine net de fin) : des dépenses
        // qui inflent plus vite réduisent l'épargne mensuelle → moins d'actifs accumulés.
        // ⚠️ On NE teste PAS `estateNetWorth` ici : depuis [FISC-ESTATE-PENSION-NPV] (annualisation ×12),
        // la NPV des rentes publiques RRQ/PSV — qui sont INDEXÉES à l'inflation, donc une COUVERTURE
        // contre l'inflation — est correctement dimensionnée et gonfle nominalement avec l'inflation.
        // Sous hyper-inflation, cette couverture peut faire DÉPASSER l'estate nominal de la base
        // (comportement économiquement correct). L'érosion se mesure donc sur le portefeuille, pas l'estate.
        expect(hyper!.finalNetWorth).toBeLessThan(base!.finalNetWorth!);
    });

    it('patrimoine positif avec cash + revenus normaux et 5 ans d\'horizon', () => {
        const result: ProjectionResult = calculateFutureProjection(makeParams());
        const scenarios = result.allResults as ProjectionResult[];
        const base = scenarios.find(r => r.stratType === 'BASE');
        expect(base!.estateNetWorth).toBeGreaterThan(0);
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

    it('CELIAPP — un achat de résidence principale FUTUR laisse le FHSA s\'accumuler à un solde visible avant l\'achat', () => {
        // Régression du bug « on me recommande le CELIAPP mais je ne le vois jamais
        // sur la courbe ». Cause racine : la fixture test datait l'achat « aujourd'hui »
        // (offset 0). realEstateMonth.ts:147 vidait alors TOUT le CELIAPP vers les
        // liquidités CHAQUE mois pour l'achat « imminent » → le solde restait ≈ 1 mois
        // de cotisation (invisible à l'échelle du patrimoine), alors que la reco lit le
        // flux cumulé (contribCELIAPP) et s'affichait quand même. Avec une date FUTURE,
        // la garde realEstateMonth.ts:115 (`m < purchaseOffset`) protège le compte
        // jusqu'à l'achat → le FHSA s'accumule puis sert à l'achat (son vrai rôle).
        const mkGoal = (purchaseDate: string, id: string): RealEstateGoal => ({
            id, name: 'Maison', price: 450000, downPayment: 90000,
            mortgageRate: 4.5, amortization: 25, isActive: true, isPrimaryResidence: true,
            purchaseDate, propertyGrowthRate: 3, totalClosingCosts: 8000,
        } as unknown as RealEstateGoal);

        const maxCeliapp = (goal: RealEstateGoal): number => {
            const result = calculateFutureProjection(makeParams({
                projection: makeProjection({ years: 6 }), // horizon couvre l'achat 2030
                realEstateGoals: [goal],
            }));
            const base = (result.allResults as ProjectionResult[]).find(r => r.stratType === 'BASE')!;
            return Math.max(...base.chartData.map((d: ProjectionChartPoint) => d.CELIAPP ?? 0));
        };

        const future = maxCeliapp(mkGoal('2030-06-01', 're-future'));   // ~4,4 ans après 2026
        const immediate = maxCeliapp(mkGoal('2026-01-01', 're-now'));   // = startYear/startMonth → offset 0

        // Achat futur : le CELIAPP atteint un solde clairement visible (FHSA accumulé).
        expect(future).toBeGreaterThan(10000);
        // Achat immédiat (ancien comportement) : le CELIAPP reste résiduel.
        expect(immediate).toBeLessThan(future / 2);
    });

    it('shortfallRate ∈ [0, 1] dans tous les scénarios', () => {
        const result: ProjectionResult = calculateFutureProjection(makeParams());
        const scenarios = result.allResults as ProjectionResult[];
        for (const r of scenarios) {
            expect(r.shortfallRate).toBeGreaterThanOrEqual(0);
            expect(r.shortfallRate).toBeLessThanOrEqual(1);
        }
    });

    it('chaque entrée de chartData expose NetWorth numérique', () => {
        const result: ProjectionResult = calculateFutureProjection(makeParams());
        const scenarios = result.allResults as ProjectionResult[];
        const base = scenarios.find(r => r.stratType === 'BASE');
        for (const d of base!.chartData) {
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
        const result: ProjectionResult = calculateFutureProjection(makeParams(zeroIncome), false, 0, ALL_TYPES);
        const scenarios = result.allResults as ProjectionResult[];
        expect(scenarios).toHaveLength(7);
        for (const r of scenarios) {
            expect(Number.isFinite(r.estateNetWorth)).toBe(true);
        }
    });

    // Cycle 4 — W5.x conteneurs câblés au moteur
    describe('W5.x conteneurs câblés', () => {
        it('Assurances: primes mensuelles augmentent les dépenses (patrimoine final plus bas)', () => {
            const noIns: ProjectionResult = calculateFutureProjection(makeParams({ projection: makeProjection({ years: 20 }) }));
            const withIns: ProjectionResult = calculateFutureProjection(makeParams({
                projection: makeProjection({ years: 20 }),
                insurancePolicies: [
                    { id: 'p1', kind: 'life-term', monthlyPremium: 200, faceAmount: 500000 },
                    { id: 'p2', kind: 'disability-lt', monthlyPremium: 150 },
                ],
            }));
            const noBase = noIns.allResults!.find((s: ProjectionResult) => s.stratType === 'BASE');
            const insBase = withIns.allResults!.find((s: ProjectionResult) => s.stratType === 'BASE');
            expect(insBase!.estateNetWorth).toBeLessThan(noBase!.estateNetWorth!);
        });

        it('Véhicules cycliques: dépense ponctuelle tous les N ans', () => {
            const result: ProjectionResult = calculateFutureProjection(makeParams({
                projection: makeProjection({ years: 20 }),
                vehicleReplacements: [{ id: 'v1', cyclYears: 8, costEstimate: 35000 }],
            }));
            expect(Number.isFinite(result.estateNetWorth)).toBe(true);
        });

        it('Rénovation planifiée: ne crashe pas si date hors fenêtre', () => {
            const result: ProjectionResult = calculateFutureProjection(makeParams({
                projection: makeProjection({ years: 5 }),
                majorRenovations: [{ id: 'r1', date: '2030-06-01', cost: 50000, description: 'cuisine' }],
            }));
            expect(Number.isFinite(result.estateNetWorth)).toBe(true);
        });

        it('Don charitable: ajoute aux dépenses mais réduit l\'impôt (effet net négatif modeste)', () => {
            const noCharity: ProjectionResult = calculateFutureProjection(makeParams({ projection: makeProjection({ years: 20 }) }));
            const withCharity: ProjectionResult = calculateFutureProjection(makeParams({
                projection: makeProjection({ years: 20 }),
                charitableGoals: [{ id: 'c1', annualAmount: 5000 }],
            }));
            const noBase = noCharity.allResults!.find((s: ProjectionResult) => s.stratType === 'BASE');
            const chBase = withCharity.allResults!.find((s: ProjectionResult) => s.stratType === 'BASE');
            // Le don sort du patrimoine mais le crédit fiscal compense partiellement
            expect(chBase!.estateNetWorth).toBeLessThan(noBase!.estateNetWorth!);
        });

        it('[FA-6] le crédit-don s\'applique en année ACTIVE (survit décembre via le bucket divers)', () => {
            // DISCRIMINANT money-critical : avant le fix, le crédit allait dans taxCurrentYear.revenu,
            // ÉCRASÉ en décembre pour un salarié actif (taxDecember:406) → le don n'avait AUCUN effet
            // fiscal en phase active. Le fix le route vers `divers` (jamais écrasé) → il s'applique.
            // Horizon court (3 ans) : le persona (35 ans) est ACTIF tout du long.
            const noCharity: ProjectionResult = calculateFutureProjection(makeParams({ projection: makeProjection({ years: 3 }) }));
            const withCharity: ProjectionResult = calculateFutureProjection(makeParams({
                projection: makeProjection({ years: 3 }),
                charitableGoals: [{ id: 'c1', annualAmount: 10000 }],
            }));
            const noBase = noCharity.allResults!.find((s: ProjectionResult) => s.stratType === 'BASE')!;
            const chBase = withCharity.allResults!.find((s: ProjectionResult) => s.stratType === 'BASE')!;
            // Impôt « divers » TOTAL payé sur l'horizon. RAMQ/FSS sont identiques pour les deux → leur
            // différence ≈ −crédit. La magnitude est DÉRIVÉE de computeDonationCredit (jamais un montant
            // figé : il change à chaque correction fiscale) → le donateur paie NETTEMENT moins de divers.
            const sumDivers = (r: ProjectionResult): number =>
                (r.chartData ?? []).reduce((acc: number, p: ProjectionChartPoint) => acc + (p.TaxPaidDivers ?? 0), 0);
            // Tous les mois exercés sont en phase active (aucun isRetired) — garde la prémisse du test.
            expect((chBase.chartData ?? []).some((p: ProjectionChartPoint) => p.isRetired)).toBe(false);
            // Avant le fix : crédit jeté → sumDivers(donateur) ≈ sumDivers(non-donateur) → ÉCHEC.
            expect(sumDivers(chBase)).toBeLessThan(sumDivers(noBase) - 1000);
            // MAGNITUDE (ancre sur la vraie valeur fiscale, pas un chiffre magique) : l'écart de divers
            // vaut le crédit annuel × le nb de règlements d'avril tombant dans l'horizon (~2 sur 3 ans).
            // Seuil à 1,5× le crédit annuel : prouve la magnitude-crédit, robuste au compte exact de règlements.
            const gap = sumDivers(noBase) - sumDivers(chBase);
            expect(gap).toBeGreaterThan(computeDonationCredit(10000) * 1.5);
        });

        it('Immeuble locatif: NOI positif augmente le revenu et le patrimoine', () => {
            const noRental: ProjectionResult = calculateFutureProjection(makeParams({ projection: makeProjection({ years: 20 }) }));
            const withRental: ProjectionResult = calculateFutureProjection(makeParams({
                projection: makeProjection({ years: 20 }),
                rentalProperties: [{
                    id: 'rp1', name: 'Triplex',
                    purchasePrice: 500000, currentValue: 500000, mortgageBalance: 300000,
                    mortgageRate: 5.5, monthlyRent: 4500, vacancyPct: 5, monthlyExpenses: 1500,
                }],
            }));
            const noBase = noRental.allResults!.find((s: ProjectionResult) => s.stratType === 'BASE');
            const rpBase = withRental.allResults!.find((s: ProjectionResult) => s.stratType === 'BASE');
            // NOI net positif (4500*0.95 - 1500 = 2775/mois - tax 45%) > 0 → patrimoine plus élevé
            expect(rpBase!.estateNetWorth).toBeGreaterThan(noBase!.estateNetWorth!);
        });
    });

    // D2.9 — Inflation par poste
    describe('Inflation par poste', () => {
        it('quand activée et que tous les postes valent 2%, le résultat est proche de l\'inflation globale 2%', () => {
            const flat: ProjectionResult = calculateFutureProjection(makeParams({
                projection: makeProjection({ years: 10, inflationRate: 2 })
            }));
            const perCat: ProjectionResult = calculateFutureProjection(makeParams({
                projection: makeProjection({
                    years: 10,
                    inflationRate: 2,
                    usePerCategoryInflation: true,
                    inflationHousing: 2, inflationFood: 2, inflationTransport: 2,
                    inflationHealth: 2, inflationLeisure: 2, inflationOther: 2,
                })
            }));
            const flatBase = flat.allResults!.find((s: ProjectionResult) => s.stratType === 'BASE');
            const perBase = perCat.allResults!.find((s: ProjectionResult) => s.stratType === 'BASE');
            // Tolérance: le bonus santé +0.5% sur la part 5% n'est qu'à 75+, hors fenêtre 10 ans
            expect(Math.abs(perBase!.estateNetWorth! - flatBase!.estateNetWorth!)).toBeLessThan(flatBase!.estateNetWorth! * 0.05);
        });

        it('logement 6% (vs 4% défaut) augmente le multiplicateur des dépenses → patrimoine plus faible', () => {
            const low: ProjectionResult = calculateFutureProjection(makeParams({
                projection: makeProjection({ years: 20, usePerCategoryInflation: true, inflationHousing: 4 })
            }));
            const high: ProjectionResult = calculateFutureProjection(makeParams({
                projection: makeProjection({ years: 20, usePerCategoryInflation: true, inflationHousing: 6 })
            }));
            const lowBase = low.allResults!.find((s: ProjectionResult) => s.stratType === 'BASE');
            const highBase = high.allResults!.find((s: ProjectionResult) => s.stratType === 'BASE');
            expect(highBase!.estateNetWorth).toBeLessThan(lowBase!.estateNetWorth!);
        });
    });

    // D2.7 — US Withholding sur CELI
    describe('US Withholding CELI', () => {
        it('avec usEquityShareCeli=100% et yield 2%, le patrimoine est plus faible que sans drag', () => {
            const baseProj = makeProjection({ years: 20, usEquityShareCeli: 0 });
            const dragProj = makeProjection({ years: 20, usEquityShareCeli: 100, usEquityDividendYield: 2 });

            const noDrag: ProjectionResult = calculateFutureProjection(makeParams({ projection: baseProj }));
            const drag: ProjectionResult = calculateFutureProjection(makeParams({ projection: dragProj }));

            const noBase = noDrag.allResults!.find((s: ProjectionResult) => s.stratType === 'BASE');
            const drBase = drag.allResults!.find((s: ProjectionResult) => s.stratType === 'BASE');

            // Drag 100% × 2% × 15% = 0.30 pp annuels sur le CELI → patrimoine final plus bas
            expect(drBase!.estateNetWorth).toBeLessThan(noBase!.estateNetWorth!);
        });

        it('share=0 ne produit aucun drag (idempotent vs valeur défaut)', () => {
            const r1: ProjectionResult = calculateFutureProjection(makeParams({
                projection: makeProjection({ years: 10, usEquityShareCeli: 0 })
            }));
            const r2: ProjectionResult = calculateFutureProjection(makeParams({
                projection: makeProjection({ years: 10 })
            }));
            const b1 = r1.allResults!.find((s: ProjectionResult) => s.stratType === 'BASE');
            const b2 = r2.allResults!.find((s: ProjectionResult) => s.stratType === 'BASE');
            expect(b1!.estateNetWorth).toBe(b2!.estateNetWorth);
        });
    });

    // D2.6 — Sequence Risk Metric
    describe('Sequence Risk Metric', () => {
        it('expertMetrics expose sequenceRiskPct et worstDecadeDrawdown quand MC est activé', () => {
            const params = makeParams({
                projection: makeProjection({ years: 10 }),
            });
            const result: ProjectionResult = calculateFutureProjection(params, /* runMC */ true);
            expect(result.expertMetrics).toBeTruthy();
            const em = result.expertMetrics as { sequenceRiskPct: number; worstDecadeDrawdown: number; criticalDecadeStartYear: number; criticalDecadeEndYear: number };
            expect(typeof em.sequenceRiskPct).toBe('number');
            expect(typeof em.worstDecadeDrawdown).toBe('number');
            expect(em.sequenceRiskPct).toBeGreaterThanOrEqual(0);
            expect(em.sequenceRiskPct).toBeLessThanOrEqual(100);
            expect(em.worstDecadeDrawdown).toBeGreaterThanOrEqual(0);
            expect(em.worstDecadeDrawdown).toBeLessThanOrEqual(1);
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
            const r: ProjectionResult = calculateFutureProjection(params, true);
            const m = r.expertMetrics as { criticalDecadeStartYear: number; criticalDecadeEndYear: number } | undefined;
            // Décennie critique = [retraite-5, retraite+5] = [15, 25] années après start
            expect(m?.criticalDecadeStartYear).toBeGreaterThanOrEqual(14);
            expect(m?.criticalDecadeStartYear).toBeLessThanOrEqual(16);
            expect(m?.criticalDecadeEndYear).toBeGreaterThanOrEqual(24);
            expect(m?.criticalDecadeEndYear).toBeLessThanOrEqual(26);
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
            const off: ProjectionResult = calculateFutureProjection(buildLongRetirement(false));
            const on: ProjectionResult = calculateFutureProjection(buildLongRetirement(true));
            const offBase = off.allResults!.find((s: ProjectionResult) => s.stratType === 'BASE');
            const onBase = on.allResults!.find((s: ProjectionResult) => s.stratType === 'BASE');
            // Smile ON majore les go-go years → dépenses plus élevées tôt
            expect(offBase!.estateNetWorth).not.toBe(onBase!.estateNetWorth);
        });

        it('le flag useSmileCurve est respecté (par défaut OFF, multiplicateur = 1)', () => {
            const params = buildLongRetirement(false);
            const result: ProjectionResult = calculateFutureProjection(params);
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
            const r: ProjectionResult = calculateFutureProjection(buildAtRetirement({}));
            const base = r.allResults!.find((s: ProjectionResult) => s.stratType === 'BASE');
            const post65 = base!.chartData.filter((d: ProjectionChartPoint) => (d.age ?? 0) >= 65);
            expect(post65.length).toBeGreaterThan(0);
        });

        it('avec pension DB de 2000$/mois, le patrimoine successoral augmente (horizon 10 ans)', () => {
            // ⚠️ HORIZON PORTÉ DE 5 À 10 ANS le 2026-08-20 par `[ESTATE-NPV-07]`, et la raison est
            // MESURÉE, pas un ajustement pour faire passer le test. Le lot rend l'abattement fiscal
            // de la VAN des rentes publiques DÉPENDANT du revenu de retraite du ménage. Or une
            // pension DB fait exactement deux choses opposées :
            //   · elle ENRICHIT (5 ans d'épargne supplémentaire : +92 813 $ de patrimoine brut) ;
            //   · elle fait passer les rentes publiques d'un taux effectif de 0 % (revenu 16 826 $,
            //     sous le montant personnel de base → facteur 1,0000) à ~25,7 % (revenu 43 324 $ →
            //     facteur 0,7431), ce qui coûte 0,2569 × 399 874 = 102 728 $ sur la VAN.
            // À 5 ans EXACTEMENT, le second l'emporte de 11 298 $ — c'est un point de bascule, pas
            // une propriété du modèle. Delta mesuré par horizon, tout le reste constant :
            //     5 ans → −11 298 $ · 10 ans → +108 559 $ · 15 ans → +266 090 $
            //     20 ans → +488 619 $ · 25 ans → +789 492 $
            // L'invariant que ce test protège (« la pension DB alimente le patrimoine successoral »)
            // vaut donc partout sauf au tout premier horizon. Les DEUX cas sont asservis ci-dessous
            // pour que ni la bascule ni l'invariant ne puisse dériver en silence.
            const at = (years: number, db: number): number => {
                const p = buildAtRetirement({ dbPensionMonthly: db });
                const r: ProjectionResult = calculateFutureProjection({ ...p, projection: makeProjection({ years }) });
                return r.allResults!.find((s: ProjectionResult) => s.stratType === 'BASE')!.estateNetWorth!;
            };
            expect(at(10, 2000)).toBeGreaterThan(at(10, 0));
            expect(at(10, 2000) - at(10, 0)).toBeGreaterThan(50_000);
            // Le point de bascule, verrouillé lui aussi : à 5 ans l'effet fiscal domine. Si un jour
            // ce signe s'inverse, ce n'est pas forcément une régression — mais ça doit être VU.
            expect(at(5, 2000)).toBeLessThan(at(5, 0));
            expect(at(5, 0) - at(5, 2000)).toBeCloseTo(11_298, -2);
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
            const result: ProjectionResult = calculateFutureProjection(params);
            expect(Number.isFinite(result.estateNetWorth)).toBe(true);
        });

        it('indexation 0% rend la pension DB nominale (érodée par l\'inflation)', () => {
            const fullIndex: ProjectionResult = calculateFutureProjection(buildAtRetirement({
                dbPensionMonthly: 2000,
                dbPensionIndexationPct: 100,
            }));
            const noIndex: ProjectionResult = calculateFutureProjection(buildAtRetirement({
                dbPensionMonthly: 2000,
                dbPensionIndexationPct: 0,
            }));
            const fullBase = fullIndex.allResults!.find((s: ProjectionResult) => s.stratType === 'BASE');
            const noBase = noIndex.allResults!.find((s: ProjectionResult) => s.stratType === 'BASE');
            // Pleine indexation > pas d'indexation (avec inflation positive)
            expect(fullBase!.estateNetWorth).toBeGreaterThanOrEqual(noBase!.estateNetWorth!);
        });
    });

    // W3.x — Événements de vie stochastiques (couverture manquante signalée par silent-failure-hunter)
    describe('Événements de vie stochastiques (W3.x)', () => {
        const longHorizonMc = (overrides: Partial<ProjectionConfig>) => makeParams({
            projection: makeProjection({ years: 30, ...overrides }),
        });

        it('Divorce: avec divorceEnabled=ON, certaines itérations MC ont un patrimoine réduit', () => {
            const result: ProjectionResult = calculateFutureProjection(longHorizonMc({
                divorceEnabled: true,
                divorceAnnualProbability: 0.5, // forcé haut pour test
                divorceSplitPct: 50,
            }), /* runMC */ true);
            expect(Number.isFinite(result.estateNetWorth)).toBe(true);
            expect(result.expertMetrics).toBeTruthy();
        });

        it('LTD: avec ltdEnabled=ON, le moteur termine sans NaN', () => {
            const result: ProjectionResult = calculateFutureProjection(longHorizonMc({
                ltdEnabled: true,
                ltdAnnualProbability: 0.1,
                ltdIncomeReplacementPct: 60,
                ltdDurationMonths: 24,
            }), true);
            expect(Number.isFinite(result.estateNetWorth)).toBe(true);
        });

        it('Maladie grave: payout cumulé ne peut se déclencher qu\'une fois (one-shot)', () => {
            // Avec proba 90%/an sur 30 ans, en non-MC la branche ne se déclenche pas
            // (criticalIllnessEnabled requiert MC). En MC, ciTriggered devient true
            // après la 1re trigger.
            const result: ProjectionResult = calculateFutureProjection(longHorizonMc({
                criticalIllnessEnabled: true,
                ciAnnualProbability: 0.9,
                ciPayoutAmount: 100000,
                ciExtraMonthlyExpense: 500,
            }), true);
            expect(Number.isFinite(result.estateNetWorth)).toBe(true);
        });

        it('Héritage probabilisé: ne crashe pas avec uncertaintyYears=0 (événement ponctuel)', () => {
            const result: ProjectionResult = calculateFutureProjection(longHorizonMc({
                inheritanceEnabled: true,
                inheritanceExpectedAmount: 200000,
                inheritanceExpectedAtAge: 50,
                inheritanceUncertaintyYears: 0, // cas limite signalé par agent
                inheritanceProbability: 0.8,
            }), true);
            expect(Number.isFinite(result.estateNetWorth)).toBe(true);
        });

        it('Survivant: modelSurvivor=ON termine sans NaN même si conjoint décède', () => {
            const config = makeConfig();
            config.users[0] = { ...config.users[0], age: 60, birthYear: 1966 };
            config.users[1] = { ...config.users[1], age: 60, birthYear: 1966 };
            const result: ProjectionResult = calculateFutureProjection(makeParams({
                config,
                retirementGoal: makeRetirementGoal({ targetAge: 60 }),
                projection: makeProjection({ years: 30, modelSurvivor: true }),
            }), true);
            expect(Number.isFinite(result.estateNetWorth)).toBe(true);
        });

        it('Snowbird: surcoût mensuel impacte mesurablement le patrimoine final', () => {
            const config = makeConfig();
            config.users[0] = { ...config.users[0], age: 64, birthYear: 1962 };
            config.users[1] = { ...config.users[1], age: 64, birthYear: 1962 };
            const noSnowbird: ProjectionResult = calculateFutureProjection(makeParams({
                config,
                retirementGoal: makeRetirementGoal({ targetAge: 65 }),
                projection: makeProjection({ years: 20 }),
            }));
            const withSnowbird: ProjectionResult = calculateFutureProjection(makeParams({
                config,
                retirementGoal: makeRetirementGoal({ targetAge: 65 }),
                projection: makeProjection({
                    years: 20,
                    snowbirdEnabled: true,
                    snowbirdMonthsPerYear: 5,
                    snowbirdExtraMonthlyCost: 1500,
                }),
            }));
            const noBase = noSnowbird.allResults!.find((s: ProjectionResult) => s.stratType === 'BASE');
            const swBase = withSnowbird.allResults!.find((s: ProjectionResult) => s.stratType === 'BASE');
            // Snowbird modifie le profil de dépenses retraite (impact mesurable, sens dépendant du fiscal mix)
            expect(swBase!.estateNetWorth).not.toBe(noBase!.estateNetWorth);
        });

        it('Bootstrap historique: impacte les métriques MC (P10/P50/P90, successRate)', () => {
            // Bootstrap n'agit qu'en MC (runScenario.enableMonteCarlo=true).
            // Les scénarios déterministes (BASE etc.) ne changent pas; on vérifie
            // que les métriques MC (chartData P10/P50/P90) diffèrent.
            const gaussian: ProjectionResult = calculateFutureProjection(longHorizonMc({}), true);
            const bootstrap: ProjectionResult = calculateFutureProjection(longHorizonMc({
                useHistoricalBootstrap: true,
            }), true);
            expect(Number.isFinite(gaussian.estateNetWorth)).toBe(true);
            expect(Number.isFinite(bootstrap.estateNetWorth)).toBe(true);
            // Les bandes P10/P50/P90 doivent différer entre gaussien et bootstrap.
            const gP50 = gaussian.chartData.find((d: ProjectionChartPoint) => d.P50 != null)?.P50 ?? null;
            const bP50 = bootstrap.chartData.find((d: ProjectionChartPoint) => d.P50 != null)?.P50 ?? null;
            if (gP50 !== null && bP50 !== null) {
                expect(gP50).not.toBe(bP50);
            } else {
                expect(typeof gaussian.successRate === 'number').toBe(true);
            }
        });

        it('Replay krach 2008: produit un patrimoine final concret', () => {
            const result: ProjectionResult = calculateFutureProjection(longHorizonMc({
                replayHistoricalYear: 2008,
            }));
            expect(Number.isFinite(result.estateNetWorth)).toBe(true);
        });

        it('US Withholding CELI: avec part US et yield positif, drag mesurable sur 20 ans', () => {
            const noUs: ProjectionResult = calculateFutureProjection(makeParams({
                projection: makeProjection({ years: 20, usEquityShareCeli: 0 })
            }));
            const withUs: ProjectionResult = calculateFutureProjection(makeParams({
                projection: makeProjection({ years: 20, usEquityShareCeli: 100, usEquityDividendYield: 2 })
            }));
            const noBase = noUs.allResults!.find((s: ProjectionResult) => s.stratType === 'BASE');
            const usBase = withUs.allResults!.find((s: ProjectionResult) => s.stratType === 'BASE');
            expect(usBase!.estateNetWorth).toBeLessThan(noBase!.estateNetWorth!);
        });
    });

    describe('Drawdown optim 2026-05 (PBMA + bracket 1 + OAS guard)', () => {
        // Setup: utilisateur retraité tôt avec REER abondant et govPension faible.
        // Force des shortfalls qui invoquent la cascade REER en mode AUTO_MARGINAL.
        const makeRetireeParams = (overrides: Partial<SimulationParams> = {}): SimulationParams => makeParams({
            projection: makeProjection({
                years: 15,
                returnRates: { celi: 5, reer: 5, nonReg: 5, crypto: 0, cash: 2 },
                ...(overrides.projection ?? {}),
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
            const result: ProjectionResult = calculateFutureProjection(makeRetireeParams());
            const base = result.allResults!.find((s: ProjectionResult) => s.stratType === 'BASE');
            const totalReerWithdrawals = base!.chartData
                .filter((p: ProjectionChartPoint) => p.isRetired)
                .reduce((sum: number, p: ProjectionChartPoint) => sum + (p.RetraitREER ?? 0), 0);
            expect(totalReerWithdrawals).toBeGreaterThan(0);
        });

        it('AUTO_MARGINAL (BASE) vs PRIO_REER (LIBERTE_55): les deux préservent du REER différemment', () => {
            // Pas une assertion stricte sur l'ordre — la cascade détermine simplement
            // que les retraits sont des fonctions différentes selon la stratégie.
            // On vérifie surtout que les deux stratégies produisent des résultats
            // mesurablement différents (sinon le strategy switch est mort).
            const result: ProjectionResult = calculateFutureProjection(makeRetireeParams(), false, 0, ALL_TYPES);
            const base = result.allResults!.find((s: ProjectionResult) => s.stratType === 'BASE');
            const liberte = result.allResults!.find((s: ProjectionResult) => s.stratType === 'LIBERTE_55');
            expect(base).toBeDefined();
            expect(liberte).toBeDefined();
            // estateNetWorth doit différer (au moins de 1$) — sinon les stratégies
            // sont identiques en pratique.
            expect(Math.abs(base!.estateNetWorth! - liberte!.estateNetWorth!)).toBeGreaterThan(1);
        });

        it('Retraité sans REER initial: la cascade utilise principalement CELI', () => {
            // Note: RetraitREER peut être non-nul à cause des transferts NonReg→REER
            // ou meltdown stratégique en pré-retraite. On vérifie surtout que CELI
            // domine fortement les retraits.
            const result: ProjectionResult = calculateFutureProjection(makeRetireeParams({
                liveCSVBalances: { CELI: 400_000, CELIAPP: 0, REER: 0, NON_ENREG: 0, CRYPTO: 0, REEE: 0 },
            }));
            const base = result.allResults!.find((s: ProjectionResult) => s.stratType === 'BASE');
            const totalCeli = base!.chartData.reduce((s: number, p: ProjectionChartPoint) => s + (p.RetraitCELI ?? 0), 0);
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
            monthlyPayment: 0,
        });

        it('un goal inactif ne réduit pas le liquide au mois de purchaseDate', () => {
            const inactiveGoal = makeInactiveGoal();
            const baseline: ProjectionResult = calculateFutureProjection(makeParams({ realEstateGoals: [] }));
            const withInactive: ProjectionResult = calculateFutureProjection(makeParams({
                realEstateGoals: [inactiveGoal],
            }));
            const noBase = baseline.allResults!.find((s: ProjectionResult) => s.stratType === 'BASE');
            const inactiveBase = withInactive.allResults!.find((s: ProjectionResult) => s.stratType === 'BASE');
            // ±5% de tolérance pour les arrondis (le moteur a des micro-variations
            // selon les init paths). Inactif ≈ inexistant.
            const ratio = Math.abs(inactiveBase!.estateNetWorth! - noBase!.estateNetWorth!) / Math.max(1, noBase!.estateNetWorth!);
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
            const withActive: ProjectionResult = calculateFutureProjection(makeParams({
                calculatedStartingCash: 200000,
                liveCSVBalances: richBalances,
                realEstateGoals: [active],
            }));
            const withInactive: ProjectionResult = calculateFutureProjection(makeParams({
                calculatedStartingCash: 200000,
                liveCSVBalances: richBalances,
                realEstateGoals: [inactive],
            }));
            // L'achat actif consomme du liquide (down payment + welcome tax) → estate
            // immédiatement après doit refléter une équité différente d'un cas inactif.
            const activeBase = withActive.allResults!.find((s: ProjectionResult) => s.stratType === 'BASE');
            const inactiveBase = withInactive.allResults!.find((s: ProjectionResult) => s.stratType === 'BASE');
            // Différence significative attendue (>1% du patrimoine inactif) — l'équité
            // immobilière finale après 3 ans de détention + l'amortissement du prêt
            // créent un écart mesurable.
            const diff = Math.abs(activeBase!.estateNetWorth! - inactiveBase!.estateNetWorth!);
            expect(diff).toBeGreaterThan(Math.max(1, inactiveBase!.estateNetWorth! * 0.01));
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
                monthlyPayment: 0,
            }],
        });

        // rapBalance = rapRepaymentDueTotal (monthlyOutput). Pic sur la projection.
        const maxRapBalance = (res: ProjectionResult): number =>
            res.chartData.reduce((mx: number, p: ProjectionChartPoint) => Math.max(mx, p.rapBalance ?? 0), 0);

        const findByStrategy = (result: ProjectionResult, name: string) => {
            const r = result.allResults!.find((s: ProjectionResult) => s.strategyName === name);
            expect(r, `scénario "${name}" introuvable`).toBeDefined();
            return r!;
        };

        // [UI-SCEN] — chaque stratégie est un RUN paramétré (withdrawalStrategy), plus un
        // scénario parallèle : on lance le moteur une fois par stratégie comparée.
        const runWithStrategy = (ws: 'PRIO_CELI' | 'PRIO_CELI_NO_RAP'): ProjectionResult => {
            const params = makePurchaseParams();
            return calculateFutureProjection({
                ...params,
                projection: { ...params.projection, withdrawalStrategy: ws },
            });
        };

        it('PRIO_CELI emprunte au RAP à l\'achat (rapBalance > 0)', () => {
            const prioCeli = findByStrategy(runWithStrategy('PRIO_CELI'), "Gestion : CELI d'abord");
            expect(maxRapBalance(prioCeli)).toBeGreaterThan(0);
        });

        it('PRIO_CELI_NO_RAP ne touche jamais au RAP (rapBalance reste 0)', () => {
            const noRap = findByStrategy(runWithStrategy('PRIO_CELI_NO_RAP'), 'Achat : CELI sans RAP');
            expect(maxRapBalance(noRap)).toBe(0);
        });

        it('non-régression : les deux stratégies produisent un patrimoine fini et divergent', () => {
            const noRap = findByStrategy(runWithStrategy('PRIO_CELI_NO_RAP'), 'Achat : CELI sans RAP');
            const prioCeli = findByStrategy(runWithStrategy('PRIO_CELI'), "Gestion : CELI d'abord");
            expect(Number.isFinite(noRap.estateNetWorth)).toBe(true);
            expect(Number.isFinite(prioCeli.estateNetWorth)).toBe(true);
            // L'achat a bien lieu dans les deux cas (équité immobilière créée).
            expect(noRap.chartData.some((p: ProjectionChartPoint) => (p.Immobilier ?? 0) > 0)).toBe(true);
            expect(prioCeli.chartData.some((p: ProjectionChartPoint) => (p.Immobilier ?? 0) > 0)).toBe(true);
            // Flux d'achat différents (RAP vs CELI/REER imposable) → l'issue diverge.
            expect(noRap.estateNetWorth).not.toBe(prioCeli.estateNetWorth);
        });
    });

    describe('Scénarios compound (Phase 4 #4)', () => {
        it('COMPOUND_STRESS: patrimoine final inférieur à ECONOMIC_WINTER (cumul + LTC)', () => {
            const result: ProjectionResult = calculateFutureProjection(makeParams({
                projection: makeProjection({ years: 15 }),
            }), false, 0, ALL_TYPES);
            const winter = result.allResults!.find((s: ProjectionResult) => s.stratType === 'ECONOMIC_WINTER');
            const stress = result.allResults!.find((s: ProjectionResult) => s.stratType === 'COMPOUND_STRESS');
            expect(stress).toBeDefined();
            expect(winter).toBeDefined();
            // Cumul inflation 5% + rendements anémiques + LTC forcé → pire que winter seul.
            expect(stress!.estateNetWorth).toBeLessThanOrEqual(winter!.estateNetWorth!);
        });

        it('LATE_INHERITANCE: patrimoine final ≥ BASE (héritage tardif aide quand même)', () => {
            const result: ProjectionResult = calculateFutureProjection(makeParams({
                projection: makeProjection({ years: 25 }), // assez long pour atteindre m=240
            }), false, 0, ALL_TYPES);
            const base = result.allResults!.find((s: ProjectionResult) => s.stratType === 'BASE');
            const late = result.allResults!.find((s: ProjectionResult) => s.stratType === 'LATE_INHERITANCE');
            expect(late).toBeDefined();
            expect(base).toBeDefined();
            // Pas strict > car le seed est différent, mais ≥ raisonnable
            expect(late!.estateNetWorth).toBeGreaterThanOrEqual(base!.estateNetWorth! * 0.95);
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
            const result: ProjectionResult = calculateFutureProjection(makeParams({
                projection: makeProjection({ years: 18 }),
                childGoals: [child],
                calculatedStartingCash: 250000, // assez pour cotiser sans contrainte liquide
            }));
            // On itère sur le scénario BASE pour examiner les cotisations REEE cumulées
            const base = result.allResults!.find((s: ProjectionResult) => s.stratType === 'BASE');
            expect(base).toBeDefined();
            const totalReeeContrib = (base!.chartData ?? []).reduce(
                (acc: number, pt: ProjectionChartPoint) => acc + (pt.ReeeContrib ?? 0), 0
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
            const result: ProjectionResult = calculateFutureProjection(makeParams({
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
                    ] as BudgetConfig['users'],
                    splitMode: '50/50',
                },
            }));
            // Pas de NaN propagé + le moteur termine sans crash
            const base = result.allResults!.find((s: ProjectionResult) => s.stratType === 'BASE');
            expect(base).toBeDefined();
            expect(base!.estateNetWorth).toBeGreaterThan(0);
            expect(Number.isFinite(base!.estateNetWorth)).toBe(true);
        });
    });

    describe('Wiring goals (2026-05)', () => {
        it('SavingsGoal: une deadline drainante réduit le patrimoine final', () => {
            const targetDate = '2027-06';
            const baseline: ProjectionResult = calculateFutureProjection(makeParams({
                savingsGoals: [],
            }));
            const withGoal: ProjectionResult = calculateFutureProjection(makeParams({
                savingsGoals: [
                    { id: 'sg1', name: 'Voyage Europe', targetAmount: 15000, currentAmount: 0, deadline: targetDate, icon: '✈️' },
                ],
            }));
            const noBase = baseline.allResults!.find((s: ProjectionResult) => s.stratType === 'BASE');
            const goalBase = withGoal.allResults!.find((s: ProjectionResult) => s.stratType === 'BASE');
            expect(goalBase!.estateNetWorth).toBeLessThan(noBase!.estateNetWorth!);
        });

        it('FinancialGoal avec targetAccount=CELI: réduit le solde CELI projeté', () => {
            const baseline: ProjectionResult = calculateFutureProjection(makeParams({
                financialGoals: [],
            }));
            const withGoal: ProjectionResult = calculateFutureProjection(makeParams({
                financialGoals: [
                    { id: 'fg1', name: 'Mise de fonds maison', type: 'CUSTOM' as const, targetAmount: 20000, deadline: '2028-03', targetAccount: 'CELI' },
                ],
            }));
            const noBase = baseline.allResults!.find((s: ProjectionResult) => s.stratType === 'BASE');
            const goalBase = withGoal.allResults!.find((s: ProjectionResult) => s.stratType === 'BASE');
            // CELI moins élevé au mois 27 (mars 2028) après retrait du goal
            const noBaseCeli = noBase!.chartData[30]?.CELI ?? 0;
            const goalBaseCeli = goalBase!.chartData[30]?.CELI ?? 0;
            expect(goalBaseCeli).toBeLessThan(noBaseCeli);
        });
    });
});
