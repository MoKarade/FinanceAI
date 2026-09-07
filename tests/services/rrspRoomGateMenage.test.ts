// tests/services/rrspRoomGateMenage.test.ts
//
// [FISC-RRSP-ROOM-GATE-MENAGE] (audit 2026-09-07, lot 215) — la garde de CHAÎNE, sur la grandeur PUBLIÉE.
// `taxJanuary.test.ts` prouve le producteur ; ici on prouve que le moteur entier laisse le conjoint de
// 53 ans accumuler ses droits quand le premier conjoint passe 72 ans (année 5 de la fixture).
// ⚠️ « Aucun golden n'a bougé » sur ce correctif est un résultat EXPLIQUÉ : aucune fixture du dépôt ne
// portait un couple à écart d'âge dont le premier conjoint dépasse 71 ans pendant que l'autre travaille —
// la contrainte ne saturait nulle part. Cette fixture la fait saturer. Mesuré AVANT / APRÈS (AUTO_MARGINAL) :
// DÉTERMINISTE — droits disponibles à l'année 5 : 0 $ / 531 092 $ ; à l'année 10 : 0 $ / 441 827 $ ;
// Σ cotisations REER 210 420 $ / 479 096 $ ; patrimoine final 714 087 → 713 043 $. En Monte Carlo (graine 0,
// le 3e argument de `__runScenarioForTests`) : 533 978 / 451 141 / 469 782 $, patrimoine 673 441 → 663 395 $.
// ⚠️ Le régime se NOMME avec la mesure : mes premiers chiffres publiés étaient ceux de la graine 0 sans le dire.
// On ancre la RELATION (droits > 0 après le passage à 72 ans), jamais les montants.
import { describe, it, expect } from 'vitest';
import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import type { BudgetConfig, User } from '../../types';

const mk = (name: string, age: number, gross: number, net: number): User => ({
    name, grossSalary: gross, netSalary: net, color: '#10b981', age, birthYear: 2026 - age,
    canadaArrivalYear: 1980, hasOwnedPropertyLast4Years: false,
} as unknown as User);

const params = (ages: [number, number]): SimulationParams => ({
    projection: {
        years: 12, returnRate: 6, inflationRate: 2, savingsMode: 'auto', manualContribution: 0,
        usePortfolioRate: false, returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
        emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3,
    },
    calculatedStartingCash: 100_000,
    liveCSVBalances: { CELI: 50_000, CELIAPP: 0, REER: 80_000, NON_ENREG: 30_000, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [], rentalProperties: [], privateBusinesses: [],
    retirementGoal: { targetAge: 75, targetMonthlyIncome: 4_000, governmentPension: 1_500, lifeExpectancy: 95 } as unknown as SimulationParams['retirementGoal'],
    config: { users: [mk('Marc', ages[0], 3_000, 2_400), mk('Anna', ages[1], 10_000, 6_600)] as unknown as BudgetConfig['users'], splitMode: '50/50' },
    baseGrossAnnual: 156_000, baseNetAnnual: 108_000, currentRentExpense: 1_500, baseMonthlyExpenses: 3_500,
    startYear: 2026, startMonth: 0,
} as unknown as SimulationParams);

const droitsDisponibles = (ages: [number, number], moisIndex: number): number => {
    // Déterministe (3e argument `enableMonteCarlo = false`) : une garde de chaîne se lit sans graine.
    const r = __runScenarioForTests(params(ages), 'AUTO_MARGINAL' as never, false, false, 0, 'BASE', {}, { verboseMonthlyPoints: true });
    const p = (r.chartData as unknown as Array<Record<string, number>>)[moisIndex];
    return p.REERMax - p.REER;
};

describe('[FISC-RRSP-ROOM-GATE-MENAGE] la chaîne : un conjoint de 53 ans garde ses droits REER quand l’autre passe 72 ans', () => {
    it('68 / 53 : à l’année 5 (premier conjoint 73 ans), les droits REER disponibles sont POSITIFS (AVANT : 0 $)', () => {
        const y5 = droitsDisponibles([68, 53], 59);
        const y10 = droitsDisponibles([68, 53], 119);
        expect(y5).toBeGreaterThan(100_000);
        expect(y10).toBeGreaterThan(100_000);
    });

    it('contrôle — 55 / 55 : des droits existent aussi (l’espion voit bien la grandeur), et la fixture est non vacueuse', () => {
        expect(droitsDisponibles([55, 55], 59)).toBeGreaterThan(100_000);
    });
});
