// tests/services/estateDbProxyWiring.test.ts
//
// [ESTATE-NPV-07] Le proxy de pension DB passé à `computeEstateNetWorth` doit valoir EXACTEMENT
// ce que le moteur versera. C'est un test de CÂBLAGE, pas de contrat : `estateCalculation.test.ts`
// pose les champs à la main et ne peut donc rien prouver sur les ARGUMENTS du site d'appel.
//
// ⚠️ POURQUOI CE FICHIER EXISTE — mesuré, pas supposé. Trois perturbations du site d'appel, chacune
// seule, laissaient **528 tests VERTS** sur les 20 fichiers qui touchent `estateNetWorth` :
//   · `householdPensionShare` réduit deux fois en mode survivant (le défaut RÉEL, trouvé en revue) ;
//   · `inflFactor` décalé d'un AN ;
//   · `age` sans le `Math.max(…, dbStartAge)` — ce qui ANNULE tout l'effet anti-falaise du proxy.
// Le scan de source voisin ne vérifie que la PRÉSENCE de `computeDbPensionMonthly(`, jamais ses
// arguments. Ce test compare le proxy à la grandeur que le moteur publie réellement.

import { describe, it, expect, vi } from 'vitest';

// ⚠️⚠️ MON PREMIER JET DE CE FICHIER ÉTAIT VACUEUX, et c'était le piège même qu'il devait fermer :
// il RECONSTRUISAIT le proxy en appelant `computeDbPensionMonthly` avec les arguments recopiés du
// site d'appel. Perturber le site d'appel ne le faisait donc pas rougir — les cinq perturbations
// passaient. `TEST-AU-CONTRAT-NE-VOIT-PAS-L-APPELANT`, re-commis dans le test écrit pour le fermer.
// Il faut OBSERVER l'argument que le moteur passe réellement : d'où l'espion ci-dessous, qui
// intercepte `computeEstateNetWorth` et capture ses entrées avant de déléguer à l'original.
const entreesEstate: Array<Record<string, unknown>> = [];
vi.mock('../../services/projection/estateCalculation', async (importOriginal) => {
    const orig = await importOriginal<typeof import('../../services/projection/estateCalculation')>();
    return {
        ...orig,
        computeEstateNetWorth: (inputs: Parameters<typeof orig.computeEstateNetWorth>[0],
                                fn: Parameters<typeof orig.computeEstateNetWorth>[1]) => {
            entreesEstate.push(inputs as unknown as Record<string, unknown>);
            return orig.computeEstateNetWorth(inputs, fn);
        },
    };
});

import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, User } from '../../types';
import type { AllocationStrategy, ProjectionChartPoint } from '../../services/projection/types';

const users = (age: number): User[] => ([
    { name: 'Marc', grossSalary: 8_200, netSalary: 5_620, color: '#10b981', age, birthYear: 2026 - age, canadaArrivalYear: 2026 - age, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
    { name: 'Anna', grossSalary: 7_100, netSalary: 4_995, color: '#3b82f6', age, birthYear: 2026 - age, canadaArrivalYear: 2026 - age, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
] as unknown as User[]);

const YEARS = 25;
// Seed épinglé par `projection.survivor.test.ts` : k=0 → décès du conjoint au PREMIER janvier.
const K_DECES_AN1 = 0;
const AGE = 45;
const goal = (o: Partial<RetirementGoal>): RetirementGoal => ({
    targetAge: 60, targetMonthlyIncome: 5_000, governmentPension: 1_500, lifeExpectancy: 92,
    dbPensionMonthly: 4_000, ...o,
} as unknown as RetirementGoal);

const params = (rg: RetirementGoal, proj: Partial<ProjectionConfig> = {}): SimulationParams => ({
    projection: {
        years: YEARS, returnRate: 6, inflationRate: 2, savingsMode: 'manual', manualContribution: 2_000,
        usePortfolioRate: false, returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
        emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3, ...proj,
    } as ProjectionConfig,
    calculatedStartingCash: 60_000,
    liveCSVBalances: { CELI: 40_000, CELIAPP: 0, REER: 200_000, NON_ENREG: 50_000, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: rg,
    config: { users: users(AGE), splitMode: '50/50' } as unknown as BudgetConfig,
    baseGrossAnnual: 183_600, baseNetAnnual: 127_380, currentRentExpense: 1_800,
    baseMonthlyExpenses: 4_500, startYear: 2026, startMonth: 0,
} as unknown as SimulationParams);

/**
 * Lance le moteur et rend le COUPLE (proxy réellement passé, DB réellement versée au dernier point).
 * Le proxy vient de l'espion — c'est la valeur que `services/projection.ts` construit, pas une
 * reconstruction du test.
 */
const mesure = (rg: RetirementGoal, proj: Partial<ProjectionConfig> = {}): { proxy: number; reel: number } => {
    entreesEstate.length = 0;
    const r = __runScenarioForTests(params(rg, proj), 'AUTO_MARGINAL' as AllocationStrategy, false, false) as unknown as { chartData: ProjectionChartPoint[] };
    expect(entreesEstate.length, 'computeEstateNetWorth non appelé → rien mesuré').toBeGreaterThan(0);
    const dernier = entreesEstate[entreesEstate.length - 1];
    const last = r.chartData[r.chartData.length - 1];
    expect(last, 'chartData vide → le test ne mesurerait rien').toBeDefined();
    return {
        proxy: Number(dernier.dbPensionMonthlyPlanned ?? NaN),
        reel: (last as unknown as { pensionPrivee?: number }).pensionPrivee ?? 0,
    };
};

describe('[ESTATE-NPV-07] le proxy de pension DB vaut ce que le moteur VERSE', () => {
    it('couple intact : le proxy PASSÉ == la DB versée au dernier point, au cent près', () => {
        const { proxy, reel } = mesure(goal({}));
        expect(reel, "la DB doit couler à l'horizon, sinon le test est vacueux").toBeGreaterThan(0);
        expect(proxy).toBeCloseTo(reel, 2);
    });

    it('pension NON indexée : le proxy suit `dbPensionIndexationPct`, il ne ré-indexe pas à 100 %', () => {
        // Ancrage ABSOLU (pas seulement l'égalité proxy==réel) : casser l'indexation DANS la source
        // unique bougerait les DEUX côtés ensemble et l'égalité seule ne verrait rien.
        const { proxy, reel } = mesure(goal({ dbPensionIndexationPct: 0 }));
        expect(reel).toBeGreaterThan(0);
        expect(proxy).toBeCloseTo(reel, 2);
        expect(proxy).toBeCloseTo(4_000, 2);
    });

    it('pension indexée à 50 % : valeur intermédiaire, ancrée en absolu', () => {
        const { proxy, reel } = mesure(goal({ dbPensionIndexationPct: 50 }));
        expect(reel).toBeGreaterThan(0);
        expect(proxy).toBeCloseTo(reel, 2);
        expect(proxy).toBeCloseTo(4_000 * (1 + (Math.pow(1.02, YEARS) - 1) * 0.5), 2);
    });

    it("DB démarrant APRÈS l'horizon : le proxy vaut ce qu'elle VAUDRA, pas zéro", () => {
        // ⚠️ C'est tout l'objet du `Math.max(âge, dbPensionStartAge)` au site d'appel. Sans lui, le
        // proxy vaut 0 avant le démarrage — le contexte fiscal redevient nul et la falaise que ce
        // terme existe pour supprimer revient. MESURÉ : cette perturbation laissait 528 tests verts.
        const { proxy, reel } = mesure(goal({ dbPensionStartAge: AGE + YEARS + 10 }));
        expect(reel, 'la DB ne doit PAS encore couler').toBe(0);
        expect(proxy).toBeCloseTo(4_000 * Math.pow(1.02, YEARS), 2);
    });

    it("l'horizon est celui de la simulation — le proxy est indexé sur `years`, pas sur `years − 1`", () => {
        // DISCRIMINANT de l'argument `inflFactor`. Deux horizons, deux valeurs analytiques.
        const court = mesure(goal({ dbPensionStartAge: 99 }), { years: 10 });
        expect(court.proxy).toBeCloseTo(4_000 * Math.pow(1.02, 10), 2);
        expect(court.proxy).not.toBeCloseTo(4_000 * Math.pow(1.02, 9), 2);
    });

    it('mode SURVIVANT : le proxy porte `dbSurvivorPct`, et UNE SEULE FOIS', () => {
        // ⚠️ LE défaut trouvé en 5e revue : j'avais recopié `(survivorMode || divorced) ? 1/N : 1` de
        // la ligne voisine — où le halving EST légitime, parce que l'agrégat `governmentPension`
        // couvre les deux conjoints. Dans le slot DB, le décès est déjà porté par `dbSurvivorFactor`
        // À L'INTÉRIEUR de la source unique : le `1/N` réduisait une SECONDE fois (proxy/réel = 0,5).
        //
        // ⚠️⚠️ ET CE TEST ÉTAIT UN SCAN DE SOURCE, sur la foi d'un constat d'impossibilité que
        // J'AVAIS ÉCRIT : « `survivorMode` ne s'active que par une mortalité stochastique, aucun
        // chemin déterministe ». **FAUX** — `projection.survivor.test.ts` épingle déjà `k = 0` avec
        // un conjoint centenaire (p = 0,33/an, plafond `mortalityAnnualProbability`) et le décès
        // tombe au PREMIER janvier. J'avais conclu depuis MA fixture (couple de 45 ans, sans
        // `modelSurvivor`) au lieu du dépôt. `DOC-STALE-IMPOSSIBILITY` — une leçon déjà nommée dans
        // `CLAUDE.md`, re-commise. Coût du scan : perturber `survivorMode: false` au site d'appel
        // laissait 226 tests VERTS pour 19 657 $ d'écart.
        entreesEstate.length = 0;
        const rgSurv = {
            targetAge: 60, targetMonthlyIncome: 6_000, governmentPension: 1_850,
            rrqEstimateMonthly: 800, psvEstimateMonthly: 700, lifeExpectancy: 96,
            dbPensionMonthly: 1_500, dbPensionStartAge: 60, dbPensionIndexationPct: 100, dbSurvivorPct: 60,
        } as unknown as RetirementGoal;
        const p = params(rgSurv, { years: 12, modelSurvivor: true, replayHistoricalYear: 1990 } as Partial<ProjectionConfig>);
        // Conjoint CENTENAIRE : c'est lui qui rend le décès déterministe au seed épinglé.
        (p as unknown as { config: { users: User[] } }).config.users = [
            { name: 'Solo', grossSalary: 0, netSalary: 0, color: '#10b981', age: 64, birthYear: 1962, canadaArrivalYear: 1980, hasOwnedPropertyLast4Years: true, celiContributed: 0, rrspContributed: 0 },
            { name: 'Conjoint', grossSalary: 0, netSalary: 0, color: '#3b82f6', age: 100, birthYear: 1926, canadaArrivalYear: 1950, hasOwnedPropertyLast4Years: true, celiContributed: 0, rrspContributed: 0 },
        ] as unknown as User[];
        // `verboseMonthlyPoints` : sous Monte-Carlo, `chartData` est allégé et ne publierait pas
        // `pensionPrivee` — sans ce drapeau la comparaison serait vacueuse (elle lirait 0).
        const r = __runScenarioForTests(p, 'AUTO_MARGINAL' as AllocationStrategy, true, false,
            K_DECES_AN1, 'BASE', {}, { verboseMonthlyPoints: true }) as unknown as { chartData: ProjectionChartPoint[] };
        const last = r.chartData[r.chartData.length - 1];
        const reel = (last as unknown as { pensionPrivee?: number }).pensionPrivee ?? 0;
        const proxy = Number(entreesEstate[entreesEstate.length - 1].dbPensionMonthlyPlanned ?? NaN);

        // Anti-vacuité : le décès DOIT avoir eu lieu, sinon ce test ne mesure pas le survivant.
        const attenduSurvivant = 1_500 * Math.pow(1.02, 12) * 0.6;
        expect(reel, 'la DB doit couler, sinon rien à comparer').toBeGreaterThan(0);
        expect(reel, "le conjoint n'est pas décédé → la fixture n'exerce pas le survivant")
            .toBeCloseTo(attenduSurvivant, 1);
        // Le proxy doit valoir la DB versée : ni doublement réduit, ni ignorant `dbSurvivorPct`.
        expect(proxy).toBeCloseTo(reel, 1);
        expect(proxy, 'double réduction (le défaut de la 5e revue)').not.toBeCloseTo(reel / 2, 1);
        expect(proxy, '`dbSurvivorPct` ignoré par le proxy').not.toBeCloseTo(reel / 0.6, 1);
    });

    it('mode DIVORCE : le `1/N` s\u2019applique, lui — la DB est un montant MÉNAGE', () => {
        // ⚠️ Bras totalement NON couvert jusqu'ici, alors qu'il est 100 % déterministe
        // (`divorceAnnualProbability: 1` → `rng() >= 1` toujours faux → divorce garanti au premier
        // janvier, aucun seed à épingler). Perturber le diviseur laissait 226 tests verts pour
        // 12 000 $ d'écart (+53 %).
        entreesEstate.length = 0;
        const rg = goal({ dbPensionStartAge: 60 });
        const r = __runScenarioForTests(
            params(rg, { divorceEnabled: true, divorceAnnualProbability: 1, divorceSplitPct: 50 } as Partial<ProjectionConfig>),
            'AUTO_MARGINAL' as AllocationStrategy, true, false, 0, 'BASE', {}, { verboseMonthlyPoints: true },
        ) as unknown as { chartData: ProjectionChartPoint[] };
        const last = r.chartData[r.chartData.length - 1];
        const reel = (last as unknown as { pensionPrivee?: number }).pensionPrivee ?? 0;
        const proxy = Number(entreesEstate[entreesEstate.length - 1].dbPensionMonthlyPlanned ?? NaN);
        const attenduDivorce = 4_000 * Math.pow(1.02, YEARS) / 2;
        expect(reel, 'le divorce doit avoir eu lieu et la DB couler').toBeCloseTo(attenduDivorce, 1);
        expect(proxy).toBeCloseTo(reel, 1);
        // DISCRIMINANT du diviseur : ni 1/1 (divorce ignoré) ni 1/3.
        expect(proxy, 'le divorce ne divise pas la DB du ménage').not.toBeCloseTo(attenduDivorce * 2, 1);
        expect(proxy, 'mauvais diviseur').not.toBeCloseTo(attenduDivorce * 2 / 3, 1);
    });
});
