import { describe, it, expect } from 'vitest';
import { calculateFutureProjection, type SimulationParams } from '../../services/projection';
import type { ProjectionResult, ProjectionChartPoint } from '../../services/projection/types';
import type { BudgetConfig, User } from '../../types';

/**
 * [MC-BANDES-CROISEES] — audit de santé 2026-08-19, vague 1c.
 *
 * `runMonteCarlo` triait les trajectoires ENTIÈRES par patrimoine FINAL, puis publiait
 * `sorted[10 %].netWorthByMonth` comme « la bande P10 ». Ce n'était donc pas un percentile mensuel
 * mais la trajectoire d'UN run — celui qui finit au 10ᵉ centile. Rien ne garantissait l'ordre à un
 * mois donné : un run qui finit bas peut passer au-dessus de la médiane en cours de route.
 *
 * MESURÉ sur ce scénario exact (30 ans, 200 itérations) :
 *   AVANT → P10 > P50 sur **99 mois / 361** (27 %), P50 > P90 sur 6 mois, pire écart **737 974 $**
 *   APRÈS → **0 croisement**
 *
 * ⚠️ Le Monte Carlo s'active par le 2ᵉ ARGUMENT de `calculateFutureProjection(params, runMC)`, pas
 * par un flag de config. Ma première mesure passait `enableMonteCarlo` dans `params.projection` :
 * les bandes valaient 0 partout et le test « 0 croisement » était VERT sans rien prouver. D'où
 * l'assertion de non-vacuité en tête de chaque cas — la règle « prouver que la grandeur mesurée est
 * NON NULLE avant de la comparer » n'est pas décorative.
 */

const mkUser = (name: string, grossMonthly: number, netMonthly: number): User => ({
    name, grossSalary: grossMonthly, netSalary: netMonthly, color: '#10b981',
    age: 40, birthYear: 1986, canadaArrivalYear: 1986, hasOwnedPropertyLast4Years: true,
} as unknown as User);

/** Scénario VOLATIL : gros portefeuille non-enregistré + retraite proche = trajectoires qui se croisent. */
const params = (): SimulationParams => ({
    projection: {
        years: 30, returnRate: 6, inflationRate: 2, savingsMode: 'manual',
        manualContribution: 0, usePortfolioRate: false, monteCarloIterations: 200,
        returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
        emergencyFundMonths: 6, salaryGrowth: 0, propertyGrowthRate: 3,
    },
    calculatedStartingCash: 50000,
    liveCSVBalances: { CELI: 80000, CELIAPP: 0, REER: 150000, NON_ENREG: 100000, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: { targetAge: 60, targetMonthlyIncome: 5000, governmentPension: 1500 } as unknown as SimulationParams['retirementGoal'],
    config: { users: [mkUser('A', 9000, 6400)] as unknown as BudgetConfig['users'], splitMode: '50/50' },
    baseGrossAnnual: 108000, baseNetAnnual: 76800,
    currentRentExpense: 1500, baseMonthlyExpenses: 4000,
    startYear: 2026, startMonth: 0,
} as SimulationParams);

/** ⚠️ Le 2ᵉ argument `runMC` est ce qui ACTIVE le Monte Carlo. Sans lui, P10/P50/P90 sont nuls. */
const bandes = (): { p10: number; p50: number; p90: number }[] => {
    const r = calculateFutureProjection(params(), true);
    const base = (r.allResults as ProjectionResult[]).find((x) => x.stratType === 'BASE')!;
    return (base.chartData as ProjectionChartPoint[])
        .filter((d) => d.P10 != null && d.P50 != null && d.P90 != null)
        .map((d) => ({ p10: d.P10 as number, p50: d.P50 as number, p90: d.P90 as number }));
};

describe('[MC-BANDES-CROISEES] le cône est ORDONNÉ à chaque mois', () => {
    it('P10 ≤ P50 ≤ P90 sur TOUS les mois', () => {
        const b = bandes();

        // Non-vacuité, en deux temps : la série existe ET porte des valeurs réelles. Un cône de
        // zéros satisferait l'ordre trivialement (c'est exactement ce qui m'est arrivé).
        expect(b.length).toBeGreaterThan(300);
        expect(b.filter((x) => x.p10 !== 0).length).toBeGreaterThan(300);
        expect(Math.max(...b.map((x) => x.p90))).toBeGreaterThan(100000);

        // Discriminant MESURÉ : 99 mois violaient P10 ≤ P50 avant, 0 après.
        const violations = b.filter((x) => x.p10 > x.p50 || x.p50 > x.p90);
        expect(violations).toHaveLength(0);
    });

    it('l’écart de croisement est nul, pas seulement « petit »', () => {
        const b = bandes();
        expect(b.length).toBeGreaterThan(300);
        // Le pire écart mesuré avant correctif était de 737 974 $ — un seuil de tolérance aurait
        // laissé passer un vrai désordre. On exige l'ordre STRICT, garanti par construction depuis
        // que les bandes sont des percentiles par mois.
        const pire = Math.max(0, ...b.map((x) => Math.max(x.p10 - x.p50, x.p50 - x.p90)));
        expect(pire).toBe(0);
    });

    it('les bandes restent des grandeurs financières plausibles (pas un cône dégénéré)', () => {
        const b = bandes();
        // Garde anti-« correctif qui aplatit tout » : rendre P10 = P50 = P90 satisferait l'ordre
        // sans rien dire. Le cône doit rester OUVERT — l'incertitude est l'information.
        const ecartsFinaux = b.slice(-12).map((x) => x.p90 - x.p10);
        expect(Math.min(...ecartsFinaux)).toBeGreaterThan(0);
        for (const x of b) {
            expect(Number.isFinite(x.p10)).toBe(true);
            expect(Number.isFinite(x.p50)).toBe(true);
            expect(Number.isFinite(x.p90)).toBe(true);
        }
    });

    it('le cône s’ÉVASE avec le temps (l’incertitude croît, comme elle doit)', () => {
        const b = bandes();
        const largeurDebut = b[0].p90 - b[0].p10;
        const largeurFin = b[b.length - 1].p90 - b[b.length - 1].p10;

        // ⚠️ J'ai d'abord asserté « les trois bandes coïncident au premier point » — c'était FAUX :
        // `chartData[0]` a déjà subi un mois de rendement stochastique, les runs y divergent de
        // ~16 k$. Le test avait tort, pas le moteur (encore une fois :
        // `UN-TEST-QUI-ECHOUE-N-A-PAS-FORCEMENT-RAISON`). La propriété VRAIE et utile est
        // l'évasement : sur 30 ans, l'incertitude doit croître massivement.
        expect(largeurDebut).toBeGreaterThan(0);
        expect(largeurFin).toBeGreaterThan(largeurDebut * 5);
    });
});
