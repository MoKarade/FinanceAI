/**
 * Lot 2 — monteCarlo.runMonteCarlo : agrège N itérations de runScenario en
 * successRate / percentiles P10-P50-P90 / FVI / métriques expert. `runScenario`
 * est INJECTÉ → on le stub avec des résultats déterministes (finalNW = index)
 * pour rendre l'agrégation entièrement vérifiable, sans aléa ni vrai moteur.
 */
import { describe, it, expect, vi } from 'vitest';
import { runMonteCarlo } from '../../services/projection/monteCarlo';
import type { SimulationParams, AllocationStrategy } from '../../services/projection';

const STRAT = 'BASE' as AllocationStrategy;

const makeParams = (years = 1): SimulationParams =>
    ({
        projection: { years },
        calculatedStartingCash: 100000,
        liveCSVBalances: { CELI: 0, CELIAPP: 0, REER: 0, NON_ENREG: 0, CRYPTO: 0, REEE: 0 },
        retirementGoal: { targetAge: 65 },
        config: { users: [{ age: 40 }] },
    } as unknown as SimulationParams);

// Stub runScenario : finalNW (et NetWorth mensuel) déterministe selon l'index.
const makeRun = (finalNWByIdx: (idx: number) => number, monthsLen = 13) =>
    vi.fn((_p: SimulationParams, _s: AllocationStrategy, _mc: boolean, _d: boolean, idx: number) => {
        const nw = finalNWByIdx(idx);
        const chartData = Array.from({ length: monthsLen }, () => ({ NetWorth: nw }));
        return {
            chartData,
            finalNetWorth: nw,
            estateNetWorth: Math.max(0, nw),
            totalTaxesPaid: 100,
            totalGrowth: 1000,
            totalExpenses: 1000,
            minNetWorth: nw,
            shortfallRate: 0,
        };
    });

describe('runMonteCarlo — agrégation', () => {
    it('successRate = % d\'itérations terminant avec finalNW > 0', () => {
        const r = runMonteCarlo(makeRun(idx => (idx < 70 ? 1000 : -100)), makeParams(), STRAT, false, 100);
        expect(r.successRate).toBe(70);
    });

    it('appelle runScenario exactement `iterations` fois', () => {
        const run = makeRun(() => 1000);
        runMonteCarlo(run, makeParams(), STRAT, false, 100);
        expect(run).toHaveBeenCalledTimes(100);
    });

    it('percentiles P10/P50/P90 : sélection par rang trié croissant', () => {
        const r = runMonteCarlo(makeRun(idx => idx), makeParams(), STRAT, false, 100);
        // trié croissant par finalNW=idx → sorted[10]=10, [50]=50, [90]=90
        expect(r.p10Data[0]).toBe(10);
        expect(r.p50Data[0]).toBe(50);
        expect(r.p90Data[0]).toBe(90);
    });

    it('FVI borné dans [0, 100]', () => {
        const r = runMonteCarlo(makeRun(idx => idx * 1000), makeParams(), STRAT, false, 100);
        expect(r.fvi).toBeGreaterThanOrEqual(0);
        expect(r.fvi).toBeLessThanOrEqual(100);
    });

    it('chartData court → netWorthByMonth complété de 0 jusqu\'à nMonths+1', () => {
        // monthsLen=2 mais years=1 → nMonths=12 → séries padées à 13
        const r = runMonteCarlo(makeRun(() => 5000, 2), makeParams(1), STRAT, false, 100);
        expect(r.p50Data.length).toBe(13);
    });

    it('heartbeat onIteration est appelé pendant la boucle', () => {
        const cb = vi.fn();
        runMonteCarlo(makeRun(() => 1000), makeParams(), STRAT, false, 100, {}, cb);
        expect(cb).toHaveBeenCalled();
    });

    it('[PROJ-TAXPAID-LABEL] totalTaxesPaid NÉGATIF (remboursement net) : leakage plancher 0 + FVI ≤ 100', () => {
        // Fixture calibrée pour que l'ANCIEN code dépasse 100 (le vrai symptôme user-visible
        // « FVI 103/100 », finding financial-integrity #549) : survie 0,3 + sécurité 0,3
        // (minNW > 10 % du startNW 100 000) + legacy 0,2 (ratio 3 → score 1) + efficacité
        // 1,1 × 0,2 = 0,22 → ancien fvi = 102 ; nouveau (efficacité clampée) = 100.
        const negTaxRun = vi.fn(() => ({
            chartData: Array.from({ length: 13 }, () => ({ NetWorth: 300000 })),
            finalNetWorth: 300000,
            estateNetWorth: 300000,
            totalTaxesPaid: -20000,
            totalGrowth: 200000,
            totalExpenses: 1000,
            minNetWorth: 300000,
            shortfallRate: 0,
        }));
        const r = runMonteCarlo(negTaxRun as never, makeParams(), STRAT, false, 10);
        expect(r.expertMetrics.taxLeakage).toBe(0); // plancher 0, jamais négatif
        expect(r.fvi).toBe(100); // ancien code : 102 (échoue)
    });

    it('[PROJ-TAXPAID-LABEL] taxLeakage > 1 en décaissement = INFORMATION conservée (pas de cap haut)', () => {
        // En décaissement, payer plus d'impôt que la croissance de la période est un état RÉEL
        // (mesuré 3-5× sur un retraité REER) — un cap à 1,0 fabriquerait un « 100 % » plausible.
        const drawdownRun = vi.fn(() => ({
            chartData: Array.from({ length: 13 }, () => ({ NetWorth: 1000 })),
            finalNetWorth: 1000,
            estateNetWorth: 1000,
            totalTaxesPaid: 3000,
            totalGrowth: 1000,
            totalExpenses: 1000,
            minNetWorth: 1000,
            shortfallRate: 0,
        }));
        const r = runMonteCarlo(drawdownRun as never, makeParams(), STRAT, false, 10);
        expect(r.expertMetrics.taxLeakage).toBe(3);
        // L'efficacité du FVI, elle, RESTE bornée [0,1] (score, pas mesure).
        expect(r.fvi).toBeLessThanOrEqual(100);
    });

    it('expertMetrics : toutes les métriques sont des nombres finis', () => {
        const r = runMonteCarlo(makeRun(idx => idx * 1000), makeParams(), STRAT, false, 100);
        const m = r.expertMetrics;
        for (const v of [m.swr, m.taxLeakage, m.shortfallRisk, m.sequenceRiskPct, m.worstDecadeDrawdown]) {
            expect(Number.isFinite(v)).toBe(true);
        }
    });
});
