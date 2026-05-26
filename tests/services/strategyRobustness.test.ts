import { describe, it, expect } from 'vitest';
import {
    rankStrategiesByRobustness,
    type RankRobustnessOptions,
} from '../../services/projection/strategyRobustness';
import type { SimulationParams, AllocationStrategy } from '../../services/projection';

// ---------------------------------------------------------------------------
// Faux runScenario : consommé par le VRAI runMonteCarlo (intégration réelle des
// deux modules) mais avec la simulation feuille truquée → rapide et déterministe.
// Chaque stratégie échoue à une fréquence distincte (finalNW <= 0) pour produire
// des taux de succès distincts et un ordre de classement vérifiable exactement.
// ---------------------------------------------------------------------------

// failEvery[strategy] = N → échoue quand iterationIndex % N === 0 (0 = jamais).
const makeFakeRunScenario = (failEvery: Partial<Record<AllocationStrategy, number>>) =>
    (params: SimulationParams, strategy: AllocationStrategy, _mc: boolean, _delay: boolean, i: number) => {
        const mod = failEvery[strategy] ?? 0;
        const fails = mod > 0 && i % mod === 0;
        const nMonths = params.projection.years * 12;
        const finalNW = fails ? -1000 : 400000 + i * 10;
        const chartData = Array.from({ length: nMonths + 1 }, (_, m) => ({
            NetWorth: fails ? Math.max(0, 80000 - m * 1000) : 400000,
        }));
        return {
            chartData,
            finalNetWorth: finalNW,
            minNetWorth: fails ? -1000 : 120000,
            totalTaxesPaid: 20000,
            totalGrowth: 100000,
            totalExpenses: 200000,
            shortfallRate: fails ? 0.3 : 0,
            estateNetWorth: Math.max(0, finalNW),
        };
    };

const makeParams = (): SimulationParams => ({
    projection: {
        years: 3,
        returnRate: 6,
        inflationRate: 2,
        savingsMode: 'manual',
        manualContribution: 1500,
        usePortfolioRate: false,
        returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
        emergencyFundMonths: 6,
        salaryGrowth: 2,
        propertyGrowthRate: 3,
    },
    calculatedStartingCash: 25000,
    liveCSVBalances: { CELI: 30000, CELIAPP: 0, REER: 50000, NON_ENREG: 10000, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [],
    debts: [],
    childGoals: [],
    travelGoals: [],
    lifeEvents: [],
    retirementGoal: { targetAge: 65, targetMonthlyIncome: 4500, governmentPension: 1500 },
    config: {
        users: [{
            name: 'T1', grossSalary: 5000, netSalary: 3500, color: '#10b981',
            age: 35, birthYear: 1991, canadaArrivalYear: 1991,
            hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0,
        }],
        splitMode: '50/50',
    } as any,
    baseGrossAnnual: 114000,
    baseNetAnnual: 80400,
    currentRentExpense: 1500,
    baseMonthlyExpenses: 5000,
    startYear: 2026,
    startMonth: 0,
});

describe('rankStrategiesByRobustness', () => {
    // failEvery calibré pour des taux de succès tous distincts sur 100 itérations :
    // AUTO_MARGINAL 0 fail → 100 % · PRIO_CELI /50 → 98 % · PRIO_REER /25 → 96 %
    // MELTDOWN_REER /10 → 90 % · PRIO_CELI_NO_RAP /5 → 80 %.
    const failEvery: Partial<Record<AllocationStrategy, number>> = {
        AUTO_MARGINAL: 0,
        PRIO_CELI: 50,
        PRIO_REER: 25,
        MELTDOWN_REER: 10,
        PRIO_CELI_NO_RAP: 5,
    };
    const N = 100;

    it('classe les 5 stratégies de gestion, taux de succès dans [0,100]', () => {
        const fake = makeFakeRunScenario(failEvery);
        const { ranked, iterationsPerStrategy } = rankStrategiesByRobustness(fake, makeParams(), {
            iterationsPerStrategy: N,
        });
        expect(ranked).toHaveLength(5);
        expect(iterationsPerStrategy).toBe(N);
        for (const r of ranked) {
            expect(r.successRate).toBeGreaterThanOrEqual(0);
            expect(r.successRate).toBeLessThanOrEqual(100);
            expect(Number.isFinite(r.fvi)).toBe(true);
            expect(r.iterations).toBe(N);
        }
    });

    it('trie par taux de succès décroissant (la plus robuste en tête)', () => {
        const fake = makeFakeRunScenario(failEvery);
        const { ranked } = rankStrategiesByRobustness(fake, makeParams(), { iterationsPerStrategy: N });
        for (let i = 0; i < ranked.length - 1; i++) {
            expect(ranked[i].successRate).toBeGreaterThanOrEqual(ranked[i + 1].successRate);
        }
        expect(ranked[0].strategy).toBe('AUTO_MARGINAL'); // 100 %
        expect(ranked[0].successRate).toBe(100);
        expect(ranked[ranked.length - 1].strategy).toBe('PRIO_CELI_NO_RAP'); // 80 %
        expect(ranked[ranked.length - 1].successRate).toBe(80);
    });

    it('est déterministe : deux appels identiques → mêmes taux', () => {
        const params = makeParams();
        const a = rankStrategiesByRobustness(makeFakeRunScenario(failEvery), params, { iterationsPerStrategy: N });
        const b = rankStrategiesByRobustness(makeFakeRunScenario(failEvery), params, { iterationsPerStrategy: N });
        expect(a.ranked.map(r => [r.strategy, r.successRate]))
            .toEqual(b.ranked.map(r => [r.strategy, r.successRate]));
    });

    it('borne iterationsPerStrategy à [50,1000]', () => {
        const fake = makeFakeRunScenario(failEvery);
        const tooMany = rankStrategiesByRobustness(fake, makeParams(), { iterationsPerStrategy: 5000 });
        expect(tooMany.iterationsPerStrategy).toBe(1000);
        const tooFew = rankStrategiesByRobustness(fake, makeParams(), { iterationsPerStrategy: 10 });
        expect(tooFew.iterationsPerStrategy).toBe(50);
    });

    it('rapporte la progression : une fois par stratégie + une fois à la fin', () => {
        const fake = makeFakeRunScenario(failEvery);
        const calls: Array<{ done: number; total: number; current: string }> = [];
        const onProgress: RankRobustnessOptions['onProgress'] = (done, total, current) =>
            calls.push({ done, total, current });
        rankStrategiesByRobustness(fake, makeParams(), { iterationsPerStrategy: 50, onProgress });
        // 5 stratégies → 5 appels de démarrage (done 0..4) + 1 appel final (done 5).
        expect(calls).toHaveLength(6);
        expect(calls[0]).toEqual({ done: 0, total: 5, current: expect.any(String) });
        expect(calls[5]).toEqual({ done: 5, total: 5, current: '' });
    });
});
