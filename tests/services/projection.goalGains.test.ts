// tests/services/projection.goalGains.test.ts
//
// [PV-10] Les retraits NON-ENREG déclenchés par les échéances d'objectifs
// (FinancialGoal) doivent RÉALISER le gain en capital (ACB proportionnel,
// banque de pertes, accCapitalGainsYear) — donc être imposés.
//
// Bug corrigé : le goal-mutator décrémentait l'ACB du montant VENDU complet et
// ne réalisait AUCUN gain → retraits jamais imposés (sous-imposition réelle,
// NON conservateur) et ACB faussé pour les ventes suivantes.
//
// Déclencheur déterministe : NonReg avec gain latent accumulé par la croissance
// (convention moteur : ACB initial = solde initial, zéro latent au départ),
// objectif financier ciblant NON-ENREG à l'échéance année 3.

import { describe, it, expect } from 'vitest';
import { calculateFutureProjection, type SimulationParams } from '../../services/projection';
import type { ProjectionResult } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, FinancialGoal } from '../../types';

const makeProjection = (): ProjectionConfig => ({
    years: 6,
    returnRate: 6,
    inflationRate: 2,
    savingsMode: 'manual',
    manualContribution: 0,
    usePortfolioRate: false,
    returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 0, cash: 0 },
    emergencyFundMonths: 6,
    salaryGrowth: 2,
    propertyGrowthRate: 3,
    // Rooms CELI/REER manuelles à 0 : sinon l'optimisation mensuelle « NonReg → CELI/REER
    // si espace » draine le NonReg dès le mois 0 (la room historique IGNORE celiContributed).
    // Les soldes retombent sur liveCSVBalances (manualX absent ⇒ fallback).
    useManualBalances: true,
    manualCELIRoom: 0,
    manualREERRoom: 0,
});

const makeConfig = (): BudgetConfig => ({
    users: [
        {
            name: 'Alex', grossSalary: 7700, netSalary: 5300, color: '#10b981',
            age: 35, birthYear: 1991, canadaArrivalYear: 1991,
            hasOwnedPropertyLast4Years: false,
            // Droits CELI/REER SATURÉS : sinon l'optimisation mensuelle « NonReg → CELI/REER
            // si espace » vide le NonReg dès le mois 0 et l'objectif n'a plus rien à vendre.
            celiContributed: 999_999, rrspContributed: 999_999,
        },
        {
            name: 'Sam', grossSalary: 6000, netSalary: 4210, color: '#3b82f6',
            age: 33, birthYear: 1993, canadaArrivalYear: 1993,
            hasOwnedPropertyLast4Years: false,
            celiContributed: 999_999, rrspContributed: 999_999,
        },
    ],
    splitMode: '50/50',
});

const makeGoal = (): RetirementGoal => ({
    targetAge: 60, targetMonthlyIncome: 5500, governmentPension: 1850, lifeExpectancy: 92,
});

// Échéance 2029-06 → monthIndex ~41 ; le NonReg (200 k$, ACB 200 k$) a ~3,5 ans
// de croissance à 6 % → gain latent ~45 k$ ; le retrait de 150 k$ réalise une
// fraction proportionnelle de ce gain (≈ 150k × latent/valeur ≈ 28 k$).
const GOAL_NONREG: FinancialGoal = {
    id: 'fg-1', name: 'Achat chalet', type: 'other' as FinancialGoal['type'],
    targetAmount: 150_000, manualCurrentAmount: 0, deadline: '2029-06-15',
    targetAccount: 'NON-ENREG', status: 'active',
};

const makeParams = (financialGoals: FinancialGoal[]): SimulationParams => ({
    projection: makeProjection(),
    calculatedStartingCash: 10_000,
    liveCSVBalances: { CELI: 0, CELIAPP: 0, REER: 0, NON_ENREG: 200_000, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: makeGoal(),
    config: makeConfig(),
    baseGrossAnnual: 92_400, baseNetAnnual: 63_600,
    currentRentExpense: 1_500, baseMonthlyExpenses: 4_000,
    startYear: 2026, startMonth: 0,
    financialGoals,
});

const run = (p: SimulationParams): ProjectionResult => calculateFutureProjection(p);

/** Somme d'un champ chiffré sur toute la série. */
const sumField = (r: ProjectionResult, field: string): number =>
    r.chartData.reduce((s, pt) => s + (Number(pt[field]) || 0), 0);

describe('[PV-10] Retrait d\'objectif NON-ENREG — gain en capital réalisé et imposé', () => {
    const avecGoal = run(makeParams([GOAL_NONREG]));
    const sansGoal = run(makeParams([]));

    it('le retrait d\'objectif déclenche un impôt sur les gains (TaxPaidGains > 0)', () => {
        const taxAvec = sumField(avecGoal, 'TaxPaidGains');
        const taxSans = sumField(sansGoal, 'TaxPaidGains');
        // DELTA : l'objectif ajoute la vente de ~150 k$ (gain proportionnel ~28 k$ imposé).
        // Avant le fix : aucune réalisation → delta ≈ 0. (Assertion en delta : les resets de
        // room de janvier peuvent générer un peu d'Opti NonReg→CELI dans les DEUX scénarios.)
        expect(taxAvec - taxSans).toBeGreaterThan(1000);
    });

    it('le retrait est bien effectué (NonReg baisse de l\'ordre du montant à l\'échéance)', () => {
        const before = avecGoal.chartData.find(p => p.monthIndex === 40);
        const after = avecGoal.chartData.find(p => p.monthIndex === 42);
        expect(before && after).toBeTruthy();
        const drop = Number(before!.NonReg) - Number(after!.NonReg);
        // ~150 k$ moins le liquide disponible consommé d'abord (cascade LIQUID→NonReg).
        expect(drop).toBeGreaterThan(100_000);
    });

    it('l\'ACB n\'est plus vidé à tort : une 2e vente ne sur-réalise pas de gains', () => {
        // Garde-fou global : le total des gains imposés reste BORNÉ par le gain latent
        // réellement accumulé (≈ 45 k$ à l'échéance + croissance résiduelle ensuite).
        // L'ancien code (ACB -= montant vendu) aurait gonflé les gains des ventes
        // SUIVANTES au-delà du latent réel.
        const delta = sumField(avecGoal, 'TaxPaidGains') - sumField(sansGoal, 'TaxPaidGains');
        // Impôt ≈ gains imposables × taux marginal — très en deçà de 45 k$ de gains × ~50 %.
        expect(delta).toBeLessThan(25_000);
    });
});
