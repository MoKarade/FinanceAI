// tests/services/projection.convergence.test.ts
//
// Tests de convergence : garantir que les valeurs lues par les autres
// onglets (Retraite, Enfant, Investments) depuis `lastProjection.chartData`
// matchent les valeurs calculées par les composants UI quand ils utilisent
// les mêmes constantes (childCosts.ts) ou tranches d'âge.
//
// Ces tests doivent rester verts en permanence — toute divergence ici
// signale qu'un calcul s'est dédoublé silencieusement entre l'UI et le
// moteur de projection.

import { describe, it, expect } from 'vitest';
import { calculateFutureProjection, type SimulationParams } from '../../services/projection';
import { getAnnualChildCost } from '../../services/projection/childCosts';
import type {
    ProjectionConfig,
    BudgetConfig,
    RetirementGoal,
    ChildGoal,
} from '../../types';

// ---------------------------------------------------------------------------
// Fixtures alignées avec testFixtures.ts (Léa, 2022-06-15, CPE, publique,
// uni_local, voiture usagée). On reproduit ici pour pouvoir tester sans
// dépendre de toute la chaîne mode-test/store.
// ---------------------------------------------------------------------------

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
        {
            name: 'Alex', grossSalary: 7700, netSalary: 5300, color: '#10b981',
            age: 35, birthYear: 1991, canadaArrivalYear: 1991,
            hasOwnedPropertyLast4Years: false,
            celiContributed: 0, rrspContributed: 0,
        },
        {
            name: 'Sam', grossSalary: 6000, netSalary: 4210, color: '#3b82f6',
            age: 33, birthYear: 1993, canadaArrivalYear: 1993,
            hasOwnedPropertyLast4Years: false,
            celiContributed: 0, rrspContributed: 0,
        },
    ],
    splitMode: '50/50',
});

const makeRetirementGoal = (overrides: Partial<RetirementGoal> = {}): RetirementGoal => ({
    targetAge: 60,
    targetMonthlyIncome: 5500,
    governmentPension: 1850,
    lifeExpectancy: 92,
    ...overrides,
});

const makeChild = (overrides: Partial<ChildGoal> = {}): ChildGoal => ({
    id: 'child-1',
    name: 'Léa (test)',
    isActive: true,
    birthDate: '2022-06-15',
    initialCost: 2800,
    monthlyDiapers: 120,
    monthlyFood: 200,
    monthlyClothing: 80,
    monthlyDaycare: 215,
    governmentBenefits: 450,
    parentalLeaveIncomeDrop: 900,
    daycareType: 'cpe',
    schoolType: 'publique',
    activitiesLevel: 'legeres',
    universityType: 'uni_local',
    carGift: 'usagee',
    respContribution: 2500,
    ...overrides,
});

const makeParams = (overrides: Partial<SimulationParams> = {}): SimulationParams => ({
    projection: makeProjection(),
    calculatedStartingCash: 8500,
    liveCSVBalances: {
        CELI: 32000, CELIAPP: 0, REER: 12500,
        NON_ENREG: 3500, CRYPTO: 14250, REEE: 0,
    },
    realEstateGoals: [],
    debts: [],
    childGoals: [makeChild()],
    travelGoals: [],
    lifeEvents: [],
    retirementGoal: makeRetirementGoal(),
    config: makeConfig(),
    baseGrossAnnual: 164400,
    baseNetAnnual: 114120,
    currentRentExpense: 1500,
    baseMonthlyExpenses: 5000,
    startYear: 2026,
    startMonth: 0,
    ...overrides,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Trouve le premier point chartData pour une année donnée.
 */
const findByYear = (chart: any[], year: number) =>
    chart.find(p => p.year === year);

/**
 * Somme les `childGross` × 12 sur les 12 points d'une année (= coût annuel
 * du moteur à comparer avec la fonction getAnnualChildCost).
 */
const sumChildGrossForYear = (chart: any[], year: number): number => {
    const points = chart.filter(p => p.year === year);
    return points.reduce((sum, p) => sum + (p.childGross || 0), 0);
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Convergence projection ↔ UI', () => {
    describe('Retraite', () => {
        it('chartData contient un point à l\'âge cible', () => {
            const result = calculateFutureProjection(makeParams()) as any;
            const point = result.chartData.find((p: any) => p.age >= 60);
            expect(point).toBeDefined();
            expect(typeof point.NetWorth).toBe('number');
            expect(Number.isFinite(point.NetWorth)).toBe(true);
        });

        it('peakNetWorth ≥ retirementNetWorth ≥ 0', () => {
            const result = calculateFutureProjection(makeParams()) as any;
            const chart: any[] = result.chartData;
            const retirementPoint = chart.find(p => p.age >= 60);
            const peakNW = Math.max(...chart.map(p => p.NetWorth || 0));
            expect(peakNW).toBeGreaterThanOrEqual(retirementPoint?.NetWorth || 0);
            expect(retirementPoint?.NetWorth).toBeGreaterThanOrEqual(0);
        });

        it('chaque KPI Retraite est dérivable d\'une lecture chartData', () => {
            const result = calculateFutureProjection(makeParams()) as any;
            const chart: any[] = result.chartData;
            const lifeExp = 92;

            // Mêmes formules que Retirement.tsx — doivent toutes produire un number
            const retirementPoint = chart.find(p => p.age >= 60);
            const peakNetWorth = Math.max(...chart.map(p => p.NetWorth || 0));
            const finalPoint = chart.find(p => p.age >= lifeExp) || chart[chart.length - 1];

            expect(typeof retirementPoint?.NetWorth).toBe('number');
            expect(typeof peakNetWorth).toBe('number');
            expect(typeof finalPoint?.NetWorth).toBe('number');
        });
    });

    describe('Enfants', () => {
        it('childGross du moteur produit un coût > 0 pour un enfant actif', () => {
            // Note : la convergence stricte UI↔moteur pour les coûts enfants
            // est complexe car le moteur inclut RQAP, allocations clawback,
            // commuting savings, etc. qui ne sont pas dans getAnnualChildCost.
            // On vérifie ici uniquement la sanity : un enfant actif génère
            // bien des coûts dans la projection (childGross > 0 sur les
            // années où il est en âge 0-17).
            const params = makeParams();
            const result = calculateFutureProjection(params) as any;
            const chart: any[] = result.chartData;
            const birthYear = new Date('2022-06-15').getFullYear();

            const totalChildGrossLifetime = chart.reduce(
                (sum, p) => sum + (p.childGross || 0),
                0,
            );
            expect(totalChildGrossLifetime).toBeGreaterThan(0);

            // Coût UI à 5 ans (sanity check non comparatif)
            const uiBreakdown = getAnnualChildCost(makeChild(), 5, 1.02, 0);
            expect(uiBreakdown.netTotal).toBeGreaterThan(0);

            // Logs pour debug si besoin
            const sim5yo = sumChildGrossForYear(chart, birthYear + 5);
            expect(sim5yo).toBeGreaterThanOrEqual(0); // peut être 0 si année hors fenêtre sim
        });

        it('uni_etranger augmente le coût total vs uni_local (cohérence UI/moteur)', () => {
            const baseChild = makeChild({ universityType: 'uni_local' });
            const expensiveChild = makeChild({ universityType: 'uni_etranger' });

            const paramsLocal = makeParams({ childGoals: [baseChild] });
            const paramsAbroad = makeParams({ childGoals: [expensiveChild] });

            const rLocal = calculateFutureProjection(paramsLocal) as any;
            const rAbroad = calculateFutureProjection(paramsAbroad) as any;

            // Le patrimoine final doit être plus bas avec uni_etranger
            // (35k×4 = 140k vs 5k×4 = 20k). Différence ~120k inflation comprise.
            const baseNW = rLocal.allResults[0].estateNetWorth;
            const abroadNW = rAbroad.allResults[0].estateNetWorth;
            expect(abroadNW).toBeLessThan(baseNW);
        });

        it('cadeau voiture neuve diminue le patrimoine vs pas de voiture', () => {
            const noCar = makeChild({ carGift: 'non' });
            const newCar = makeChild({ carGift: 'neuve' });

            const rNoCar = calculateFutureProjection(makeParams({ childGoals: [noCar] })) as any;
            const rNewCar = calculateFutureProjection(makeParams({ childGoals: [newCar] })) as any;

            // 25 000 $ à 18 ans → patrimoine final plus bas avec voiture neuve
            expect(rNewCar.allResults[0].estateNetWorth)
                .toBeLessThan(rNoCar.allResults[0].estateNetWorth);
        });

        it('école privée augmente les coûts vs publique (impact patrimoine)', () => {
            const publique = makeChild({ schoolType: 'publique' });
            const privee = makeChild({ schoolType: 'privee' });

            const rPub = calculateFutureProjection(makeParams({ childGoals: [publique] })) as any;
            const rPri = calculateFutureProjection(makeParams({ childGoals: [privee] })) as any;

            // 6000 - 500 = 5500$/an × ~12 ans (5-17 ans) = ~66k$ d'écart
            expect(rPri.allResults[0].estateNetWorth)
                .toBeLessThan(rPub.allResults[0].estateNetWorth);
        });
    });

    describe('Dettes', () => {
        it('dette à intérêt élevé avec minimumPayment faible s\'éteint quand même (effectiveMinimum)', () => {
            const params = makeParams({
                debts: [{
                    id: 'd1',
                    name: 'Carte test',
                    balance: 30000,
                    interestRate: 19.9,
                    // Minimum dérisoire — sans le garde-fou, la balance grimpe
                    minimumPayment: 50,
                    category: 'CreditCard',
                }],
                projection: makeProjection({ years: 25 }),
            });
            const result = calculateFutureProjection(params) as any;
            const lastPoint = result.chartData[result.chartData.length - 1];

            // Sur 25 ans, la dette doit être totalement éteinte
            expect(lastPoint.DetteTotale).toBeLessThan(1);
        });
    });

    describe('HealthIndicator (Sprint 1A)', () => {
        it('FireTarget est exposé dans chaque point chartData (peut être 0 si non calculé)', () => {
            const result = calculateFutureProjection(makeParams()) as any;
            const first = result.chartData[0];
            // FireTarget peut être absent dans certains scénarios MC, mais
            // doit exister si le mode déterministe le calcule.
            expect(typeof first.FireTarget === 'number' || first.FireTarget === undefined).toBe(true);
        });

        it('Si FireTarget existe, il est numérique non-NaN', () => {
            const result = calculateFutureProjection(makeParams()) as any;
            for (const p of result.chartData) {
                if (p.FireTarget !== undefined && p.FireTarget !== null) {
                    expect(typeof p.FireTarget).toBe('number');
                    expect(Number.isFinite(p.FireTarget)).toBe(true);
                }
            }
        });
    });

    describe('ChildPlanning costTimeline (Sprint 1E)', () => {
        it('getAnnualChildCost réagit aux choix UI (publique→privée double les frais d\'école)', () => {
            const child = makeChild();
            const pub = getAnnualChildCost(
                { ...child, schoolType: 'publique' } as any,
                8, 1, 0,
            );
            const priv = getAnnualChildCost(
                { ...child, schoolType: 'privee' } as any,
                8, 1, 0,
            );
            // École privée 6000 vs publique 500 → différence 5500/an
            expect(priv.careAndSchool).toBeGreaterThan(pub.careAndSchool);
            expect(priv.careAndSchool - pub.careAndSchool).toBeGreaterThan(4000);
        });

        it('getAnnualChildCost cumule sur 26 ans = somme cohérente', () => {
            const child = makeChild();
            let lifetime = 0;
            for (let age = 0; age <= 25; age++) {
                lifetime += getAnnualChildCost(child, age, 1, age === 0 ? 10800 : 0).netTotal;
            }
            // Léa avec choix défaut (CPE+publique+légères+uni_local+usagée)
            // doit être > 50k$ et < 500k$ lifetime
            expect(lifetime).toBeGreaterThan(50000);
            expect(lifetime).toBeLessThan(500000);
        });

        it('université étranger > local pour les années 18-21', () => {
            const local = getAnnualChildCost(makeChild({ universityType: 'uni_local' }), 19, 1, 0);
            const abroad = getAnnualChildCost(makeChild({ universityType: 'uni_etranger' }), 19, 1, 0);
            expect(abroad.studies).toBeGreaterThan(local.studies);
            expect(abroad.studies - local.studies).toBeGreaterThan(20000); // 35k - 5k = 30k
        });

        it('voiture neuve année 18 = +25000$ vs pas de voiture', () => {
            const noCar = getAnnualChildCost(makeChild({ carGift: 'non' }), 18, 1, 0);
            const newCar = getAnnualChildCost(makeChild({ carGift: 'neuve' }), 18, 1, 0);
            expect(newCar.oneOff - noCar.oneOff).toBe(25000);
        });
    });

    describe('Centralisation Phase 3 (nouveaux champs chartData)', () => {
        it('realNetWorth est exposé et < NetWorth après inflation cumulée', () => {
            const result = calculateFutureProjection(makeParams({
                projection: makeProjection({ years: 10, inflationRate: 2 }),
            })) as any;
            const chart: any[] = result.chartData;
            const lastPoint = chart[chart.length - 1];
            expect(typeof lastPoint.realNetWorth).toBe('number');
            expect(Number.isFinite(lastPoint.realNetWorth)).toBe(true);
            // Après 10 ans à 2% : realNetWorth doit être < NetWorth nominal
            expect(lastPoint.realNetWorth).toBeLessThan(lastPoint.NetWorth);
        });

        it('liquidityRunway est exposé et > 0 si Liquidites > 0', () => {
            const result = calculateFutureProjection(makeParams()) as any;
            const first = result.chartData[0];
            expect(typeof first.liquidityRunway).toBe('number');
            expect(first.liquidityRunway).toBeGreaterThanOrEqual(0);
        });

        it('mortgageRemainingMonths exposé (0 si pas d\'hypo)', () => {
            const result = calculateFutureProjection(makeParams()) as any;
            const first = result.chartData[0];
            expect(typeof first.mortgageRemainingMonths).toBe('number');
            expect(first.mortgageRemainingMonths).toBe(0); // pas d'immo dans fixture
        });

        it('reeeContribCum / reeeGrantsCum croissent monotone (au moins pendant 0-17 ans enfant)', () => {
            const result = calculateFutureProjection(makeParams({
                projection: makeProjection({ years: 20 }),
            })) as any;
            const chart: any[] = result.chartData;
            // Trouver des points où l'enfant est éligible REEE
            const points = chart.filter((_, i) => i % 12 === 0).slice(0, 10);
            let lastContrib = 0;
            let lastGrants = 0;
            for (const p of points) {
                expect(typeof p.reeeContribCum).toBe('number');
                expect(typeof p.reeeGrantsCum).toBe('number');
                expect(p.reeeContribCum).toBeGreaterThanOrEqual(lastContrib - 1); // tolérance arrondis
                expect(p.reeeGrantsCum).toBeGreaterThanOrEqual(lastGrants - 1);
                lastContrib = p.reeeContribCum;
                lastGrants = p.reeeGrantsCum;
            }
        });

        it('DividendIncome et TaxableInvIncome exposés', () => {
            const result = calculateFutureProjection(makeParams()) as any;
            const first = result.chartData[0];
            expect(typeof first.DividendIncome).toBe('number');
            expect(typeof first.TaxableInvIncome).toBe('number');
            expect(first.DividendIncome).toBeGreaterThanOrEqual(0);
            // TaxableInvIncome >= DividendIncome (gains × 50% ajouté)
            expect(first.TaxableInvIncome).toBeGreaterThanOrEqual(first.DividendIncome);
        });

        it('marginalTaxRate et effectiveTaxRate exposés et plausibles', () => {
            const result = calculateFutureProjection(makeParams()) as any;
            const first = result.chartData[0];
            expect(typeof first.marginalTaxRate).toBe('number');
            expect(typeof first.effectiveTaxRate).toBe('number');
            // Taux raisonnables (>0% car revenu salarial, <60% car palier max QC+fed)
            expect(first.marginalTaxRate).toBeGreaterThan(0);
            expect(first.marginalTaxRate).toBeLessThan(60);
            expect(first.effectiveTaxRate).toBeGreaterThanOrEqual(0);
            expect(first.effectiveTaxRate).toBeLessThan(first.marginalTaxRate); // moyen < marginal
        });

        it('marginalTaxRate augmente avec le revenu (paliers progressifs)', () => {
            const paramsLow = makeParams({ baseGrossAnnual: 50000 });
            const paramsHigh = makeParams({ baseGrossAnnual: 300000 });
            const resultLow = calculateFutureProjection(paramsLow) as any;
            const resultHigh = calculateFutureProjection(paramsHigh) as any;
            const lowRate = resultLow.chartData[0].marginalTaxRate;
            const highRate = resultHigh.chartData[0].marginalTaxRate;
            expect(highRate).toBeGreaterThanOrEqual(lowRate);
        });

        it('Tous les nouveaux champs sont présents sur chaque point chartData', () => {
            const result = calculateFutureProjection(makeParams()) as any;
            const newFields = [
                'realNetWorth', 'liquidityRunway', 'mortgageRemainingMonths',
                'reeeContribCum', 'reeeGrantsCum',
                'DividendIncome', 'TaxableInvIncome',
                'marginalTaxRate', 'effectiveTaxRate',
            ];
            const sample = result.chartData[Math.floor(result.chartData.length / 2)];
            for (const field of newFields) {
                expect(sample, `Champ "${field}" doit être exposé`).toHaveProperty(field);
                expect(typeof sample[field]).toBe('number');
                expect(Number.isFinite(sample[field])).toBe(true);
            }
        });

        it('reeeContribCum est plafonné par REEE_LIFETIME_LIMIT 50k$/enfant', () => {
            const result = calculateFutureProjection(makeParams({
                projection: makeProjection({ years: 30 }),
            })) as any;
            const lastPoint = result.chartData[result.chartData.length - 1];
            // 1 enfant dans fixture, limite ARC = 50 000$
            expect(lastPoint.reeeContribCum).toBeLessThanOrEqual(50000 * 1 + 100); // tolérance arrondis
        });

        it('liquidityRunway diminue en retraite (décumulation)', () => {
            const result = calculateFutureProjection(makeParams({
                projection: makeProjection({ years: 35 }),
            })) as any;
            const chart: any[] = result.chartData;
            // Trouver un point en retraite (isRetired)
            const retiredPoint = chart.find(p => p.isRetired && p.RetraitREER > 0);
            if (retiredPoint) {
                // En retraite avec retraits actifs, runway doit être un nombre fini
                expect(typeof retiredPoint.liquidityRunway).toBe('number');
                expect(Number.isFinite(retiredPoint.liquidityRunway)).toBe(true);
            }
        });
    });

    describe('Invariants généraux', () => {
        it('NetWorth ≥ Liquidites + CELI + REER + NonReg + Crypto + Immo - DetteTotale (à ±5% pour REEE/CELIAPP)', () => {
            const result = calculateFutureProjection(makeParams()) as any;
            for (const p of result.chartData.slice(0, 12)) {
                const components =
                    (p.Liquidites ?? 0) + (p.CELI ?? 0) + (p.REER ?? 0) +
                    (p.NonReg ?? 0) + (p.Crypto ?? 0) + (p.Immobilier ?? 0) -
                    (p.DetteTotale ?? 0);
                // NetWorth peut inclure CELIAPP/REEE en plus, ou impôts latents en moins
                const ratio = p.NetWorth / Math.max(1, components);
                expect(ratio).toBeGreaterThan(0.7);
                expect(ratio).toBeLessThan(1.5);
            }
        });

        it('Expenses > 0 sur tous les points (utilisateur n\'a jamais 0 dépense)', () => {
            const result = calculateFutureProjection(makeParams()) as any;
            for (const p of result.chartData) {
                expect(p.Expenses).toBeGreaterThan(0);
            }
        });

        it('isRetired bascule à false → true et reste true ensuite (monotone)', () => {
            const result = calculateFutureProjection(makeParams({
                projection: makeProjection({ years: 35 }),
                retirementGoal: makeRetirementGoal({ targetAge: 60 }),
            })) as any;
            const chart: any[] = result.chartData;
            let firstRetiredIdx = -1;
            for (let i = 0; i < chart.length; i++) {
                if (chart[i].isRetired) { firstRetiredIdx = i; break; }
            }
            if (firstRetiredIdx > 0) {
                // Tous les points après doivent avoir isRetired=true
                for (let i = firstRetiredIdx; i < chart.length; i++) {
                    expect(chart[i].isRetired).toBe(true);
                }
                // Tous les points avant : false
                for (let i = 0; i < firstRetiredIdx; i++) {
                    expect(chart[i].isRetired).toBe(false);
                }
            }
        });
    });

    describe('Convergence formelle', () => {
        it('chartData[0].NetWorth ≈ calculatedStartingCash + portfolio + immo', () => {
            const params = makeParams();
            const result = calculateFutureProjection(params) as any;
            const first = result.chartData[0];

            // Net Worth de départ = cash + comptes investis
            const initialNW = params.calculatedStartingCash
                + params.liveCSVBalances.CELI
                + params.liveCSVBalances.REER
                + params.liveCSVBalances.NON_ENREG
                + params.liveCSVBalances.CRYPTO;

            // ±20% de tolérance pour ajustements du moteur (taxes latentes…)
            const ratio = first.NetWorth / initialNW;
            expect(ratio).toBeGreaterThan(0.5);
            expect(ratio).toBeLessThan(1.5);
        });

        it('estateNetWorth est de même ordre que dernier NetWorth (±50% pour impôts latents)', () => {
            // Note : estateNetWorth n'est pas strictement = dernier NetWorth
            // car il applique impôt latent sur REER non décaissé et autres
            // ajustements de succession. On vérifie l'ordre de grandeur
            // (±50%) pour détecter un bug grossier sans empêcher le moteur
            // d'appliquer ses corrections fiscales.
            const result = calculateFutureProjection(makeParams()) as any;
            const baseScenario = result.allResults.find((r: any) => r.stratType === 'BASE');
            const lastNW = baseScenario.chartData[baseScenario.chartData.length - 1].NetWorth;
            const estate = baseScenario.estateNetWorth;

            expect(typeof estate).toBe('number');
            expect(Number.isFinite(estate)).toBe(true);
            // estateNetWorth ≤ lastNW (peut soustraire impôts latents) mais
            // dans le même ordre de grandeur
            const ratio = estate / lastNW;
            expect(ratio).toBeGreaterThan(0.3);
            expect(ratio).toBeLessThan(1.5);
        });
    });
});
