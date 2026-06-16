// [FA-12] Test d'intégration survivorMode SEEDÉ (découverte code-reviewer FA-10).
//
// Aucun test n'exerçait runScenario avec un décès du conjoint : la régression
// « quelqu'un retire le ternaire taxFilers/ageSpouse du call-site de décembre »
// (FA-10) ne serait attrapée par rien. Ce test pilote une itération Monte Carlo
// seedée via le hook __runScenarioForTests.
//
// DESIGN (consigné au BACKLOG FA-12) :
// - La mortalité du conjoint (trySpouseMortality) n'est tirée que sous enableMonteCarlo,
//   en janvier, avec p = mortalityAnnualProbability(âge) — plafonnée à 0,33 (100 ans+),
//   donc le décès n'est jamais « garanti » : on ÉPINGLE le seed (mcIterationIndex=0)
//   dont le tirage du PREMIER janvier déclenche le décès (vérifié par scan k=0..5).
// - `replayHistoricalYear` OVERRIDE les taux APRÈS les tirages MC (marketShocks.ts) :
//   les gaussiennes consommées n'affectent AUCUN taux (crypto=0 : seul taux non couvert)
//   → les runs modelSurvivor ON/OFF sont BIT-IDENTIQUES jusqu'au décès, et la
//   divergence de NetWorth est causée par le décès SEUL (tous les autres événements
//   stochastiques sont gateés par leur flag *Enabled AVANT de consommer le rng).
// - En MC, chartData est allégé ({NetWorth, monthIndex}) : les assertions passent par
//   la série NetWorth + les agrégats (totalTaxesPaid, finalNetWorth).
//
// SI CE TEST CASSE après un changement moteur qui ajoute/retire des appels rng :
// re-scanner k=0..7 (premier k dont la divergence tombe à mi=12) et ré-épingler.

import { describe, it, expect } from 'vitest';
import { __runScenarioForTests as runScenario } from '../../services/projection';
import type { SimulationParams } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal } from '../../types';

const makeProjection = (modelSurvivor: boolean): ProjectionConfig => ({
    years: 12, returnRate: 6, inflationRate: 2, savingsMode: 'manual', manualContribution: 0,
    usePortfolioRate: false,
    returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 0, cash: 1 },
    emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3,
    useManualBalances: true, manualCELIRoom: 0, manualREERRoom: 0,
    modelSurvivor,
    // Replay déterministe : 1990 absent du dataset US → fallback slice(0, years),
    // déterministe aussi — seule la STABILITÉ compte ici, pas l'année.
    replayHistoricalYear: 1990,
} as unknown as ProjectionConfig);

const makeConfig = (): BudgetConfig => ({
    users: [
        { name: 'Solo', grossSalary: 0, netSalary: 0, color: '#10b981', age: 64, birthYear: 1962,
          canadaArrivalYear: 1980, hasOwnedPropertyLast4Years: true, celiContributed: 0, rrspContributed: 0 },
        // Conjoint centenaire : p(décès/an) = 0,33 (plafond mortalityAnnualProbability)
        // → maximise la chance qu'un seed déclenche le décès au premier janvier.
        { name: 'Conjoint', grossSalary: 0, netSalary: 0, color: '#3b82f6', age: 100, birthYear: 1926,
          canadaArrivalYear: 1950, hasOwnedPropertyLast4Years: true, celiContributed: 0, rrspContributed: 0 },
    ],
    splitMode: '50/50',
} as unknown as BudgetConfig);

const makeGoal = (): RetirementGoal => ({
    targetAge: 60, targetMonthlyIncome: 6000, governmentPension: 1850,
    rrqEstimateMonthly: 800, psvEstimateMonthly: 700, lifeExpectancy: 96,
    dbPensionMonthly: 1500, dbPensionStartAge: 60, dbPensionIndexationPct: 100, dbSurvivorPct: 60,
});

const makeParams = (modelSurvivor: boolean): SimulationParams => ({
    projection: makeProjection(modelSurvivor),
    calculatedStartingCash: 50_000,
    liveCSVBalances: { CELI: 100_000, CELIAPP: 0, REER: 600_000, NON_ENREG: 100_000, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: makeGoal(), config: makeConfig(),
    baseGrossAnnual: 0, baseNetAnnual: 0,
    currentRentExpense: 1_500, baseMonthlyExpenses: 5_000,
    startYear: 2026, startMonth: 0, financialGoals: [],
} as unknown as SimulationParams);

// Seed épinglé : k=0 → décès du conjoint au PREMIER janvier (mi=12, scan 2026-06-10).
const K_DEATH_YEAR1 = 0;

const run = (modelSurvivor: boolean, k: number) =>
    runScenario(makeParams(modelSurvivor), 'AUTO_MARGINAL', true, false, k, 'BASE', {});

const firstDivergence = (a: { chartData: Array<{ NetWorth: number }> }, b: { chartData: Array<{ NetWorth: number }> }): number => {
    const n = Math.min(a.chartData.length, b.chartData.length);
    for (let i = 0; i < n; i++) {
        if (Math.abs(a.chartData[i].NetWorth - b.chartData[i].NetWorth) > 0.01) return i;
    }
    return -1;
};

describe('[FA-12] survivorMode — intégration runScenario seedée (décès du conjoint en année 1)', () => {
    const surv = run(true, K_DEATH_YEAR1);
    const base = run(false, K_DEATH_YEAR1);

    it('runs BIT-IDENTIQUES avant le décès, divergence au premier janvier (mi=12)', () => {
        // Identité pré-décès = preuve que le replay neutralise bien les tirages MC
        // (toute autre source de divergence ferait dévier dès le mois 1).
        const div = firstDivergence(surv, base);
        expect(div).toBe(12);
    });

    it('le décès change MATÉRIELLEMENT le moteur fiscal : décaissement de survivant à 1 contribuable (FISC-SURVIVOR-DRAWDOWN)', () => {
        // CORRIGÉ 2026-06-15 (FISC-SURVIVOR-DRAWDOWN). Avant : le survivant puisait son REER aux seuils
        // DOUBLÉS du couple (pbma/bracket1/oasCap × activeUsersCount=2 dans cashflowAllocation) → sur-retrait
        // au mauvais palier → impôt cumulé artificiellement gonflé (anciennement ≈ 412,6 k$, « > base ×1.10 »).
        // Désormais le survivant = 1 contribuable (liveFilers=1, seuils individuels, cohérent avec le filing de
        // décembre FA-10 taxFilers=1) → puise MOINS de REER aux paliers sûrs, comble via CELI/non-enreg →
        // impôt cumulé PLUS BAS que le couple (1 personne sur 11 ans = moins de décaissement total).
        // Mesuré au pin : surv ≈ 221,0 k$ vs base ≈ 266,6 k$ (Δ ~17 %, le décès reste matériel).
        // Le contrat FA-10 « survivant = 1 contribuable au filing » reste gardé DIRECTEMENT par les tests
        // unitaires FA-10 de retirementIncome.test.ts (SRG survivorMode = barème célibataire).
        expect(surv.totalTaxesPaid).toBeLessThan(base.totalTaxesPaid);
        expect(base.totalTaxesPaid - surv.totalTaxesPaid).toBeGreaterThan(base.totalTaxesPaid * 0.05);
    });

    it('le patrimoine final du survivant est PLUS BAS (PSV du défunt cesse + impôt plus lourd)', () => {
        expect(surv.finalNetWorth).toBeLessThan(base.finalNetWorth);
    });

    it('modelSurvivor=OFF → AUCUNE consommation rng de mortalité : le run base est identique quel que soit le seed', () => {
        const base2 = run(false, K_DEATH_YEAR1 + 1);
        expect(firstDivergence(base, base2)).toBe(-1);
        expect(base2.totalTaxesPaid).toBeCloseTo(base.totalTaxesPaid, 6);
    });

    it('la simulation CONTINUE après le décès du conjoint (user1 survivant, série complète)', () => {
        expect(surv.chartData.length).toBe(base.chartData.length);
        expect(surv.chartData.length).toBe(12 * 12 + 1);
    });
});
