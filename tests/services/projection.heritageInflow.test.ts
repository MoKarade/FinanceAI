// tests/services/projection.heritageInflow.test.ts
//
// [ENG-HERITAGE-INFLOW] (bug rapporté par Marc 2026-07-31 : « le projet de vie héritage marche
// pas — j'arrive pas à faire en sorte que ce soit de l'argent positif, pas une dépense »).
// Racine : `applyLifeEvents` n'avait AUCUNE branche de rentrée d'argent — tout type hors
// KRACH/perte-de-revenu/vente tombait dans `addExpense`, donc un HERITAGE de 50 k$ était DÉBITÉ
// 50 k$ (impact net ≈ −100 k$ vs l'attendu). DISCRIMINANT : sur l'ancien code, le patrimoine avec
// héritage est INFÉRIEUR au patrimoine sans héritage → les deux assertions du 1er test échouent.

import { describe, it, expect } from 'vitest';
import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, LifeEvent } from '../../types';
import type { AllocationStrategy } from '../../services/projection/types';

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

const projection: ProjectionConfig = {
    years: 5, returnRate: 0, inflationRate: 0, savingsMode: 'manual', manualContribution: 0,
    usePortfolioRate: false, returnRates: { celi: 0, reer: 0, nonReg: 0, crypto: 0, cash: 0 },
    emergencyFundMonths: 6, salaryGrowth: 0, propertyGrowthRate: 0,
};

const u = (name: string, color: string) => ({ name, grossSalary: 0, netSalary: 0, color, age: 40, birthYear: 1986, canadaArrivalYear: 1986, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 });
const config: BudgetConfig = { users: [u('X', '#10b981'), u('Y', '#3b82f6')], splitMode: '50/50' };
const retirementGoal: RetirementGoal = { targetAge: 65, targetMonthlyIncome: 0, governmentPension: 0, lifeExpectancy: 90 };

const heritage: LifeEvent = {
    id: 'le_h', type: 'HERITAGE', name: 'Héritage de tante Rita', date: '2027-06-15', impactAmount: 50_000,
};

const baseParams = (lifeEvents: LifeEvent[]) => ({
    projection,
    calculatedStartingCash: 100_000,
    liveCSVBalances: { CELI: 0, CELIAPP: 0, REER: 0, NON_ENREG: 0, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents,
    retirementGoal, config,
    baseGrossAnnual: 0, baseNetAnnual: 0, currentRentExpense: 0, baseMonthlyExpenses: 1_000,
    startYear: 2026, startMonth: 0,
} as SimulationParams);

const run = (lifeEvents: LifeEvent[]) =>
    __runScenarioForTests(baseParams(lifeEvents), 'AUTO_MARGINAL' as AllocationStrategy, false, false);

describe('[ENG-HERITAGE-INFLOW] un héritage est une RENTRÉE, pas une dépense', () => {
    it('patrimoine final AVEC héritage ≈ SANS héritage + 50 k$ (ancien code : −50 k$ → échoue)', () => {
        const avec = run([heritage]);
        const sans = run([]);
        const delta = avec.finalNetWorth - sans.finalNetWorth;
        // À flux nuls (rendements 0, inflation 0), le delta doit être ~+50 000 (± frais MER minimes).
        expect(delta).toBeGreaterThan(48_000);
        expect(delta).toBeLessThan(52_000);
    });

    it('le mois de l\'événement, le NetWorth SAUTE de ~+50 k$ (visible au graphe, pas dilué)', () => {
        const avec = run([heritage]);
        const cd = avec.chartData;
        // 2027-06 = 18e mois (index 17) — on encadre le saut entre le mois précédent et le mois de l'événement.
        const before = num(cd[16].NetWorth);
        const after = num(cd[17].NetWorth);
        const monthlyDrift = num(cd[16].NetWorth) - num(cd[15].NetWorth); // dérive de base (dépenses)
        expect(after - before - monthlyDrift).toBeGreaterThan(45_000);
    });

    it('un héritage nommé « après vente … » ne déclenche JAMAIS une vente immobilière', () => {
        // Même classe qu'ENG-LIFEEVENT-VENTE-SUBSTRING : le type EXPLICITE prime sur le mot réservé.
        const piege: LifeEvent = { ...heritage, name: 'Héritage après vente du chalet familial' };
        const avec = run([piege]);
        const sans = run([]);
        const delta = avec.finalNetWorth - sans.finalNetWorth;
        expect(delta).toBeGreaterThan(48_000);
        expect(delta).toBeLessThan(52_000);
    });

    it('montant non fini → gain ignoré (0 $), jamais un NaN propagé au patrimoine', () => {
        const corrompu: LifeEvent = { ...heritage, impactAmount: Number.NaN };
        const avec = run([corrompu]);
        const sans = run([]);
        expect(Number.isFinite(avec.finalNetWorth)).toBe(true);
        expect(Math.abs(avec.finalNetWorth - sans.finalNetWorth)).toBeLessThan(1);
    });
});
