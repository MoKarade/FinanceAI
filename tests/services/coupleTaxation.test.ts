// tests/services/coupleTaxation.test.ts
//
// CI-1000x — Phase 2 (axe A1). Verrouille deux propriétés de l'impôt sur le
// revenu d'emploi dans le moteur de projection :
//
//   1) UNITÉS — `grossSalary` est MENSUEL dans le store (comme `netSalary`).
//      computeIncomeBaseline doit l'annualiser (× 12) avant de le passer au
//      moteur fiscal, qui attend un brut ANNUEL.
//      Bug historique corrigé ici : le brut mensuel était lu tel quel comme un
//      brut annuel → revenu 12× trop bas → impôt d'emploi ~0 sur TOUTE la
//      projection (un « 120 k$ » était taxé comme 10 k$, sous l'exemption de base).
//
//   2) PAR CONJOINT — l'impôt est calculé par individu, pas sur le ménage
//      combiné. La preuve est la progressivité de calculateFiscalReport (source
//      de vérité fiscale, appelée une fois par conjoint dans le calcul de décembre) :
//      un seul revenu de 120 k$ paie PLUS que deux revenus de 60 k$ réunis.
//
//   3) BOUT EN BOUT — le brut pilote réellement l'impôt dans la projection :
//      un salarié à 120 k$/an affiche un taux marginal élevé (≫ celui d'un
//      « 10 k$ » qui était l'effet du bug).

import { describe, it, expect } from 'vitest';
import { computeIncomeBaseline } from '../../services/projection/setupSimulation';
import { calculateFiscalReport } from '../../utils/tax';
import { calculateFutureProjection, type SimulationParams } from '../../services/projection';
import type { ProjectionResult, ProjectionChartPoint } from '../../services/projection/types';
import type { BudgetConfig, User } from '../../types';

// ── 1. UNITÉS : computeIncomeBaseline annualise le brut mensuel ──────────────

describe('computeIncomeBaseline — brut MENSUEL → annuel (× 12)', () => {
    it('annualise grossSalary (5000 $/mois → 60 000 $/an)', () => {
        const r = computeIncomeBaseline({}, [
            { grossSalary: 5000, netSalary: 3700 },
            { grossSalary: 4000, netSalary: 2900 },
        ]);
        expect(r.grossMarcBaseAnnual).toBe(60000); // 5000 × 12
        expect(r.grossAnnaBaseAnnual).toBe(48000); // 4000 × 12
        // netSalary reste mensuel (cohérent avec le reste de l'app)
        expect(r.incomeMarcNetMonthly).toBe(3700);
        expect(r.incomeAnnaNetMonthly).toBe(2900);
    });

    it('estime le brut depuis le net (× 12 × 1.35) quand grossSalary est absent', () => {
        const r = computeIncomeBaseline({}, [{ netSalary: 4000 }, undefined]);
        // Pas de division/multiplication parasite : net mensuel × 12 × 1.35.
        expect(r.grossMarcBaseAnnual).toBeCloseTo(4000 * 12 * 1.35, 5);
        expect(r.grossAnnaBaseAnnual).toBe(0);
    });

    it('un solo à 10 000 $/mois est vu comme 120 k$/an (pas 10 k$ — le bug)', () => {
        const r = computeIncomeBaseline({}, [{ grossSalary: 10000, netSalary: 7000 }]);
        expect(r.grossMarcBaseAnnual).toBe(120000);
        expect(r.grossMarcBaseAnnual).toBeGreaterThan(100000); // garde anti-régression explicite
    });
});

// ── 2. PAR CONJOINT : progressivité de l'impôt (source de vérité) ────────────

describe('calculateFiscalReport — impôt progressif & par individu', () => {
    const YEAR = 2026;
    const tax = (gross: number) => calculateFiscalReport(gross, 0, 0, YEAR).totalTax;

    it('un revenu de 120 k$ paie un impôt réel (> 0) — symptôme du bug = 0', () => {
        expect(tax(120000)).toBeGreaterThan(0);
        // Ordre de grandeur QC+féd pour 120 k$ : largement > 20 k$ d'impôt.
        expect(tax(120000)).toBeGreaterThan(20000);
    });

    it('progressif : un seul 120 k$ paie PLUS que deux 60 k$ réunis (gain du calcul par conjoint)', () => {
        const single = tax(120000);
        const split = 2 * tax(60000);
        expect(single).toBeGreaterThan(split);
    });

    it('monotone croissant : tax(120k) > tax(60k) > tax(30k) > 0', () => {
        expect(tax(120000)).toBeGreaterThan(tax(60000));
        expect(tax(60000)).toBeGreaterThan(tax(30000));
        expect(tax(30000)).toBeGreaterThanOrEqual(0);
    });
});

// ── 3. BOUT EN BOUT : le brut pilote l'impôt dans la projection ──────────────

function mkUser(name: string, grossMonthly: number, netMonthly: number): User {
    return {
        name, grossSalary: grossMonthly, netSalary: netMonthly, color: '#10b981',
        age: 40, birthYear: 1986, canadaArrivalYear: 1986, hasOwnedPropertyLast4Years: true,
    } as unknown as User;
}

function paramsForUsers(users: User[]): SimulationParams {
    const grossMonthly = users.reduce((s, u) => s + (u.grossSalary || 0), 0);
    const netMonthly = users.reduce((s, u) => s + (u.netSalary || 0), 0);
    return {
        projection: {
            years: 5, returnRate: 6, inflationRate: 2, savingsMode: 'manual',
            manualContribution: 0, usePortfolioRate: false,
            returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
            emergencyFundMonths: 6, salaryGrowth: 0, propertyGrowthRate: 3,
        },
        calculatedStartingCash: 20000,
        liveCSVBalances: { CELI: 0, CELIAPP: 0, REER: 0, NON_ENREG: 0, CRYPTO: 0, REEE: 0 },
        realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
        retirementGoal: { targetAge: 65, targetMonthlyIncome: 4000, governmentPension: 1500 } as unknown as SimulationParams['retirementGoal'],
        config: { users: users as unknown as BudgetConfig['users'], splitMode: '50/50' },
        baseGrossAnnual: grossMonthly * 12,
        baseNetAnnual: netMonthly * 12,
        currentRentExpense: 1500,
        baseMonthlyExpenses: 3000,
        startYear: 2026,
        startMonth: 0,
    } as SimulationParams;
}

function baseResult(users: User[]): ProjectionResult {
    const r = calculateFutureProjection(paramsForUsers(users));
    return (r.allResults as ProjectionResult[]).find((x) => x.stratType === 'BASE')!;
}

describe('Projection — le brut pilote vraiment l\'impôt (bout en bout)', () => {
    it('un salarié à 120 k$/an affiche un taux marginal élevé (le bug donnait ~0)', () => {
        const base = baseResult([mkUser('Solo', 10000, 7000)]); // 120 k$/an
        const marginalAt0 = base.chartData[0]?.marginalTaxRate ?? 0;
        // À 120 k$, le marginal QC+féd avoisine 45 %. Seuil prudent : > 20 %.
        // Sous le bug (revenu lu = 10 k$), le marginal était ~0–13 %.
        expect(marginalAt0).toBeGreaterThan(20);
    });

    it('le patrimoine final reste fini et non-NaN avec un impôt d\'emploi réel', () => {
        const base = baseResult([mkUser('A', 5000, 3700), mkUser('B', 5000, 3700)]);
        const finalNW = base.estateNetWorth ?? base.finalNetWorth ?? 0;
        expect(Number.isFinite(finalNW)).toBe(true);
        for (const d of base.chartData) expect(Number.isFinite((d as ProjectionChartPoint).NetWorth)).toBe(true);
    });
});

// ── 4. PHASE 1 refactor « REER par conjoint » : registre shadow, invariant Σ == commun ──
describe('Projection — registre REER par conjoint (invariant Σ == solde commun)', () => {
    const withReer = (users: User[], reer: number): SimulationParams => {
        const p = paramsForUsers(users);
        return { ...p, liveCSVBalances: { ...p.liveCSVBalances, REER: reer } };
    };
    const lastReer = (res: ProjectionResult): number => {
        const cd = res.chartData;
        return (cd[cd.length - 1] as ProjectionChartPoint).REER ?? 0;
    };
    const baseOf = (p: SimulationParams): ProjectionResult =>
        (calculateFutureProjection(p).allResults as ProjectionResult[]).find(x => x.stratType === 'BASE')!;

    it('couple : 2 entrées finies ≥ 0, Σ == REER commun final, clé salariale (A>B)', () => {
        const base = baseOf(withReer([mkUser('A', 6000, 4200), mkUser('B', 3000, 2200)], 120000));
        const byUser = base.reerByUserFinal!;
        expect(byUser).toHaveLength(2);
        expect(byUser.every(x => Number.isFinite(x) && x >= 0)).toBe(true);
        expect(byUser.reduce((s, x) => s + x, 0)).toBeCloseTo(lastReer(base), 2); // INVARIANT
        expect(byUser[0]).toBeGreaterThan(byUser[1]); // A (plus haut salaire) détient plus de REER
    });

    it('solo : reerByUserFinal = [REER commun final]', () => {
        const base = baseOf(withReer([mkUser('Solo', 8000, 5600)], 90000));
        const byUser = base.reerByUserFinal!;
        expect(byUser).toHaveLength(1);
        expect(byUser[0]).toBeCloseTo(lastReer(base), 2);
    });
});
