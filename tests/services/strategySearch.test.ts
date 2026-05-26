import { describe, it, expect } from 'vitest';
import { runStrategySearch } from '../../services/projection/strategySearch';
import { shardContiguous } from '../../services/projection/runAsync';
import { generateStrategySpace } from '../../services/projection/strategySpace';
import type { StrategyConfig } from '../../services/projection/strategyConfig';
import type { SimulationParams } from '../../services/projection';

// G21 C5 commit 4 — tests du moteur de recherche exhaustive. On INJECTE un faux
// runScenario déterministe (runScenario réel est privé + trop lourd) : il produit
// des métriques calculées à partir des leviers de la config, ce qui permet de
// vérifier que (a) chaque config est bien évaluée, (b) les overrides se propagent
// jusqu'au MC, (c) impôt à vie + âge FIRE viennent du run déterministe.

const baseParams = (): SimulationParams => ({
    projection: {
        years: 5, returnRate: 6, inflationRate: 2, savingsMode: 'manual',
        manualContribution: 1500, usePortfolioRate: false,
        returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
        emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3,
        useSmithManoeuvre: false,
    } as any,
    calculatedStartingCash: 25000,
    liveCSVBalances: { CELI: 30000, CELIAPP: 0, REER: 50000, NON_ENREG: 10000, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: { targetAge: 65, targetMonthlyIncome: 5000, governmentPension: 1500 },
    config: { users: [{ name: 'T', grossSalary: 5000, netSalary: 3500, color: '#0f0', age: 35, birthYear: 1991, canadaArrivalYear: 1991, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 }], splitMode: '50/50' } as any,
    baseGrossAnnual: 114000, baseNetAnnual: 80400, currentRentExpense: 1500,
    baseMonthlyExpenses: 5000, startYear: 2026, startMonth: 0,
});

// Faux moteur : finalNW dépend de l'âge de retraite (plus tôt = moins de patrimoine)
// + bonus si REER d'abord. enableMonteCarlo=true → chartData allégé (comme le vrai
// moteur). enableMonteCarlo=false → chartData complet avec age + FireTarget +
// totalTaxesPaid (pour tester impôt à vie + âge FIRE).
const months = 5 * 12;
const fakeRunScenario = (
    params: SimulationParams,
    _strategy: any,
    enableMC: boolean,
    _delay: boolean,
    iterationIndex: number,
    _scenarioType?: any,
    overrides?: any,
) => {
    const retAge = params.retirementGoal.targetAge ?? 65;
    const reerBonus = overrides?.contributionOrder === 'REER_FIRST' ? 50000 : 0;
    // Patrimoine final : croît avec l'âge de retraite + bonus REER, petite variance MC.
    const finalNW = (retAge - 35) * 20000 + reerBonus + (enableMC ? iterationIndex * 10 : 0);
    if (enableMC) {
        const chartData = Array.from({ length: months + 1 }, (_, m) => ({
            NetWorth: finalNW * (m / months),
            monthIndex: m,
        }));
        return {
            finalNetWorth: finalNW, minNetWorth: 0, totalTaxesPaid: 0, totalGrowth: finalNW,
            totalExpenses: 0, shortfallRate: 0, estateNetWorth: finalNW, chartData,
        };
    }
    // Run déterministe : chartData complet (age + FireTarget). FIRE atteint quand
    // NetWorth >= 200000 ; impôt à vie = 30% du patrimoine final.
    const chartData = Array.from({ length: months + 1 }, (_, m) => {
        const nw = finalNW * (m / months);
        return { NetWorth: nw, FireTarget: 200000, age: 35 + m / 12, monthIndex: m };
    });
    return {
        finalNetWorth: finalNW, minNetWorth: 0, totalTaxesPaid: finalNW * 0.3, totalGrowth: finalNW,
        totalExpenses: 0, shortfallRate: 0, estateNetWorth: finalNW, chartData,
    };
};

const ctx = { hasPrimaryPurchase: false, currentAge: 35 };

describe('strategySearch — runStrategySearch', () => {
    it('évalue toutes les configs et renvoie un résultat par config', () => {
        const configs = generateStrategySpace({ retirementAge: [55, 60, 65] }, ctx);
        const { results, iterations } = runStrategySearch(fakeRunScenario, baseParams(), configs, { iterations: 50 });
        expect(results).toHaveLength(3);
        expect(iterations).toBe(50);
        for (const r of results) {
            expect(r.config.retirementAge).toBeDefined();
            expect(r.successRate).toBeGreaterThanOrEqual(0);
            expect(r.finalNWp50).toBeGreaterThan(0);
        }
    });

    it('les overrides (contributionOrder) se propagent jusqu\'au MC', () => {
        // 2 configs identiques sauf contributionOrder → le bonus REER doit se voir.
        const configs = generateStrategySpace({ contributionOrder: ['CELI_FIRST', 'REER_FIRST'] }, ctx);
        const { results } = runStrategySearch(fakeRunScenario, baseParams(), configs, { iterations: 50 });
        const celi = results.find(r => r.config.contributionOrder === 'CELI_FIRST')!;
        const reer = results.find(r => r.config.contributionOrder === 'REER_FIRST')!;
        // REER_FIRST a +50000 de bonus → patrimoine médian strictement supérieur.
        expect(reer.finalNWp50).toBeGreaterThan(celi.finalNWp50);
    });

    it('impôt à vie + âge FIRE viennent du run déterministe', () => {
        const configs = generateStrategySpace({ retirementAge: [65] }, ctx);
        const { results } = runStrategySearch(fakeRunScenario, baseParams(), configs, { iterations: 50 });
        const r = results[0];
        // finalNW = (65-35)*20000 = 600000 → impôt = 180000.
        expect(r.lifetimeTax).toBeCloseTo(600000 * 0.3, 0);
        // FIRE (NetWorth>=200000) atteint en cours de projection → âge non-null entre 35 et 40.
        expect(r.fireAge).not.toBeNull();
        expect(r.fireAge!).toBeGreaterThan(35);
        expect(r.fireAge!).toBeLessThanOrEqual(40);
    });

    it('fireAge=null si la cible FIRE n\'est jamais atteinte', () => {
        // retirementAge=55 → finalNW=(55-35)*20000=400000, atteint 200000 ; pour
        // forcer un échec FIRE, on utilise un faux moteur sans franchissement.
        const lowEngine = (...args: Parameters<typeof fakeRunScenario>) => {
            const r = fakeRunScenario(...args);
            // Écrase les NetWorth sous la cible pour le run déterministe.
            if (!args[2]) r.chartData = r.chartData.map((d: any) => ({ ...d, NetWorth: 100000 }));
            return r;
        };
        const configs = generateStrategySpace({ retirementAge: [55] }, ctx);
        const { results } = runStrategySearch(lowEngine, baseParams(), configs, { iterations: 50 });
        expect(results[0].fireAge).toBeNull();
    });

    it('onProgress progresse de façon monotone et termine à 100% (heartbeat inclus)', () => {
        const configs = generateStrategySpace({ retirementAge: [55, 60, 65, 63] }, ctx);
        const progress: Array<{ done: number; total: number }> = [];
        runStrategySearch(fakeRunScenario, baseParams(), configs, {
            iterations: 50,
            onProgress: (done, total) => progress.push({ done, total }),
        });
        // Heartbeat fractionnaire pendant le MC → plus d'un appel par config.
        expect(progress.length).toBeGreaterThanOrEqual(configs.length);
        // Monotone non décroissant (pas de retour en arrière du % affiché).
        for (let i = 1; i < progress.length; i++) {
            expect(progress[i].done).toBeGreaterThanOrEqual(progress[i - 1].done);
        }
        // Dernier appel = recherche terminée.
        expect(progress[progress.length - 1]).toEqual({ done: configs.length, total: configs.length });
    });

    it('borne les itérations dans [50, 1000]', () => {
        const configs: StrategyConfig[] = generateStrategySpace({ retirementAge: [65] }, ctx);
        expect(runStrategySearch(fakeRunScenario, baseParams(), configs, { iterations: 5 }).iterations).toBe(50);
        expect(runStrategySearch(fakeRunScenario, baseParams(), configs, { iterations: 99999 }).iterations).toBe(1000);
    });
});

describe('strategySearch — shardContiguous (sharding multi-worker)', () => {
    const items = Array.from({ length: 10 }, (_, i) => i); // [0..9]

    it('couvre toutes les configs exactement une fois, dans l\'ordre', () => {
        const shards = shardContiguous(items, 3);
        expect(shards.flat()).toEqual(items); // ordre global préservé → agrégation déterministe
    });

    it('équilibre les tranches : les premières prennent le reste', () => {
        // 10 / 3 = 3 reste 1 → tailles [4, 3, 3].
        const shards = shardContiguous(items, 3);
        expect(shards.map(s => s.length)).toEqual([4, 3, 3]);
    });

    it('plus de workers que de configs → tranches vides tolérées', () => {
        const shards = shardContiguous([0, 1], 4);
        expect(shards.map(s => s.length)).toEqual([1, 1, 0, 0]);
        expect(shards.flat()).toEqual([0, 1]);
    });

    it('un seul worker → une seule tranche complète', () => {
        expect(shardContiguous(items, 1)).toEqual([items]);
    });
});
