// tests/services/estateLifeExpectancyWiring.test.ts
//
// [ESTATE-LIFEEXPECTANCY-95-DUR] Le moteur doit passer `retirementGoal.lifeExpectancy` à
// `computeEstateNetWorth`, et cette saisie doit CHANGER le patrimoine successoral publié.
//
// Test de CÂBLAGE + de CHAÎNE, pas de contrat : `estateCalculation.test.ts` pose le champ à la main et
// ne peut rien prouver sur ce que `services/projection.ts` transmet. Avant ce lot, le module posait
// `lifeExpectancy = 95` en dur — même NOM que la saisie, jamais lue (piège d'HOMONYME) — et un
// utilisateur réglé à 90 voyait 95 ans de rentes valorisés. Perturbations mesurées séparément :
//   · argument retiré au site d'appel → « câblage » rougit (undefined ≠ 88) ;
//   · module rendu sourd (défaut forcé)  → « chaîne » rougit (85 == 100), « câblage » reste vert.
// L'espion capture les ENTRÉES réelles ; il ne reconstruit rien (`TEST-AU-CONTRAT-NE-VOIT-PAS-L-APPELANT`).

import { describe, it, expect, vi } from 'vitest';

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
import type { ProjectionConfig, BudgetConfig, RetirementGoal, User } from '../../types';
import type { AllocationStrategy } from '../../services/projection/types';

const users = (age: number): User[] => ([
    { name: 'Marc', grossSalary: 8_200, netSalary: 5_620, color: '#10b981', age, birthYear: 2026 - age, canadaArrivalYear: 2026 - age, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
    { name: 'Anna', grossSalary: 7_100, netSalary: 4_995, color: '#3b82f6', age, birthYear: 2026 - age, canadaArrivalYear: 2026 - age, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
] as unknown as User[]);

const YEARS = 25;
const AGE = 45; // âge final 70 : les rentes coulent, et 85/100 laissent 15/30 années restantes.
const goal = (o: Partial<RetirementGoal>): RetirementGoal => ({
    targetAge: 60, targetMonthlyIncome: 5_000, governmentPension: 1_500, ...o,
} as unknown as RetirementGoal);

const params = (rg: RetirementGoal): SimulationParams => ({
    projection: {
        years: YEARS, returnRate: 6, inflationRate: 2, savingsMode: 'manual', manualContribution: 2_000,
        usePortfolioRate: false, returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
        emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3,
    } as ProjectionConfig,
    calculatedStartingCash: 60_000,
    liveCSVBalances: { CELI: 40_000, CELIAPP: 0, REER: 200_000, NON_ENREG: 50_000, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: rg,
    config: { users: users(AGE), splitMode: '50/50' } as unknown as BudgetConfig,
    baseGrossAnnual: 183_600, baseNetAnnual: 127_380, currentRentExpense: 1_800,
    baseMonthlyExpenses: 4_500, startYear: 2026, startMonth: 0,
} as unknown as SimulationParams);

type Publie = { estateNetWorth?: number; finalNetWorth?: number };

const mesure = (rg: RetirementGoal): { passe: unknown; publie: Publie } => {
    entreesEstate.length = 0;
    const r = __runScenarioForTests(params(rg), 'AUTO_MARGINAL' as AllocationStrategy, false, false) as unknown as Publie;
    expect(entreesEstate.length, 'computeEstateNetWorth non appelé → rien mesuré').toBeGreaterThan(0);
    return { passe: entreesEstate[entreesEstate.length - 1].lifeExpectancy, publie: r };
};

describe('[ESTATE-LIFEEXPECTANCY-95-DUR] le moteur passe la saisie et elle pilote le patrimoine successoral', () => {
    it('CÂBLAGE : la valeur PASSÉE à computeEstateNetWorth est exactement retirementGoal.lifeExpectancy', () => {
        expect(mesure(goal({ lifeExpectancy: 88 })).passe).toBe(88);
    });

    it('CÂBLAGE : champ absent → `undefined` transmis (le défaut vit dans le module, pas au site d’appel)', () => {
        expect(mesure(goal({})).passe).toBeUndefined();
    });

    it('CHAÎNE : 100 ans valorise plus de rentes que 85 ans → estateNetWorth plus grand ; finalNetWorth IDENTIQUE (contrôle)', () => {
        const a85 = mesure(goal({ lifeExpectancy: 85 })).publie;
        const a100 = mesure(goal({ lifeExpectancy: 100 })).publie;
        expect(Number.isFinite(a85.estateNetWorth) && Number.isFinite(a100.estateNetWorth)).toBe(true);
        expect(a100.estateNetWorth!).toBeGreaterThan(a85.estateNetWorth!);
        // L'espérance de vie ne touche QUE la VAN successorale : le patrimoine de fin d'horizon ne bouge pas.
        expect(a100.finalNetWorth).toBe(a85.finalNetWorth);
    });

    it('CHAÎNE : absent == 90 explicite (le défaut du module est celui que l’écran affiche)', () => {
        const absent = mesure(goal({})).publie;
        const a90 = mesure(goal({ lifeExpectancy: 90 })).publie;
        expect(absent.estateNetWorth).toBe(a90.estateNetWorth);
        // Contrôle négatif : 95 (l'ancien défaut en dur) n'est PLUS équivalent à « absent ».
        const a95 = mesure(goal({ lifeExpectancy: 95 })).publie;
        expect(absent.estateNetWorth).not.toBe(a95.estateNetWorth);
    });
});
