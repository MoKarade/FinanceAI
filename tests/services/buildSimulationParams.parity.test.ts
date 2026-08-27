// tests/services/buildSimulationParams.parity.test.ts
//
// Lot 0 — PARITÉ de l'adaptateur pur AppState → SimulationParams.
//
// Objectif : prouver que `buildSimulationParams` (extrait de FutureProjection.tsx)
// produit EXACTEMENT les mêmes SimulationParams que le chemin React, pour chaque
// persona fixture. On réplique fidèlement l'assemblage du composant (mêmes
// formules, même chaîne de dérivation de liveCSVBalances via
// reconstructPortfolioHistory + deriveStartingBalancesFromHistory — ce que fait le
// hook usePastPortfolioHistory) et on compare champ par champ avec la sortie de
// la fonction pure. Le moteur lui-même reste inchangé (suite complète verte).

import { describe, it, expect } from 'vitest';
import { TEST_PERSONAS } from '../../services/testPersonas';
import { normalizeAppState } from '../../mcp/state/loadAppState';
import {
    buildSimulationParams,
    buildSimulationParamsFromState,
    derivePortfolioStartingBalances,
    computeStartingCash,
    computeMonthlySavings,
    type BuildSimulationParamsInputs,
} from '../../services/projection/buildSimulationParams';
import { reconstructPortfolioHistory } from '../../services/history/reconstructPortfolioHistory';
import { deriveStartingBalancesFromHistory } from '../../services/history/startingBalancesFromHistory';
import { getEffectivePurchases } from '../../utils/assetPurchases';
import type { AppState, User } from '../../types';
import type { SimulationParams } from '../../services/projection';

// Réplique de la dérivation liveCSVBalances de FutureProjection.tsx (via le hook
// usePastPortfolioHistory → reconstructPortfolioHistory → deriveStartingBalances).
function reactLiveCSVBalances(state: AppState) {
    const minimal = (state.assets ?? []).map((a) => ({
        symbol: a.symbol,
        quantity: a.quantity || 0,
        currency: a.currency || 'CAD',
        currentPrice: a.currentPrice || 0,
        accountType: a.accountType,
        dateBought: a.dateBought,
        purchases: getEffectivePurchases(a),
        priceHistory: (a.priceHistory || []).map((p) => ({ date: p.date, price: p.price })),
    }));
    const hist = reconstructPortfolioHistory(minimal, (state.fxRates ?? {}) as Record<string, number>);
    return deriveStartingBalancesFromHistory(hist.points);
}

// Réplique EXACTE du useMemo `params` de FutureProjection.tsx (état au refactor
// Lot 0), à un startYear/startMonth fixés pour le déterminisme.
function reactParams(state: AppState, startYear: number, startMonth: number): SimulationParams {
    const users = (state.config?.users ?? []) as unknown as User[];
    const baseNetAnnual = users.reduce((s, u) => s + ((u.netSalary || u.salary || 0) * 12), 0);
    const baseGrossAnnual = users.reduce((s, u) => s + ((u.grossSalary || 0) * 12), 0);
    const calculatedMonthlySavings = computeMonthlySavings(state.config, state.budgetItems ?? []);
    const baseMonthlyExpenses = baseNetAnnual / 12 - calculatedMonthlySavings;

    const budgetItems = state.budgetItems ?? [];
    const rentItem = budgetItems.find(
        (b) =>
            b.name.toLowerCase().includes('loyer') ||
            b.name.toLowerCase().includes('rent') ||
            b.name.toLowerCase().includes('hypothèque') ||
            // [BUDGET-TX-CATEGORIES] réplique du canonique : « Logement » reconnu (sinon 1600 $)
            b.name.toLowerCase().includes('logement'),
    );
    let currentRentExpense = 1600;
    if (rentItem) {
        let val = rentItem.target;
        if (rentItem.frequency === 'Yearly') val /= 12;
        if (rentItem.frequency === 'Weekly') val *= 4.33;
        currentRentExpense = val;
    }

    return {
        projection: state.projection,
        calculatedStartingCash: computeStartingCash(state.initialBalances ?? {}, state.transactions ?? []),
        liveCSVBalances: reactLiveCSVBalances(state),
        realEstateGoals: (state.realEstateGoals ?? []).filter(Boolean),
        debts: state.debts || [],
        childGoals: (state.childGoals ?? []).filter(Boolean),
        travelGoals: state.travelGoals ?? [],
        lifeEvents: state.lifeEvents ?? [],
        retirementGoal: state.retirementGoal,
        config: state.config,
        baseGrossAnnual,
        baseNetAnnual,
        currentRentExpense,
        baseMonthlyExpenses,
        startYear,
        startMonth,
        insurancePolicies: state.insurancePolicies ?? [],
        vehicleReplacements: state.vehicleReplacements ?? [],
        majorRenovations: state.majorRenovations ?? [],
        charitableGoals: state.charitableGoals ?? [],
        rentalProperties: state.rentalProperties ?? [],
        privateBusinesses: state.privateBusinesses ?? [],
        financialGoals: state.financialGoals ?? [],
    };
}

const START_YEAR = 2026;
const START_MONTH = 0;

describe('Lot 0 — parité buildSimulationParams vs chemin React', () => {
    for (const persona of TEST_PERSONAS) {
        it(`${persona.emoji} ${persona.label} — params identiques`, () => {
            const state = normalizeAppState(persona.build());
            const expected = reactParams(state, START_YEAR, START_MONTH);
            const actual = buildSimulationParamsFromState(state, {
                startYear: START_YEAR,
                startMonth: START_MONTH,
            });
            // Égalité structurelle profonde sur l'ENSEMBLE des SimulationParams.
            expect(actual).toEqual(expected);
        });
    }

    it('buildSimulationParams est une extraction pure (mêmes inputs → mêmes champs)', () => {
        const state = normalizeAppState(
            TEST_PERSONAS.find((p) => p.id === 'couple-confort')!.build(),
        );
        // Construit l'objet inputs comme le ferait le composant (hooks résolus).
        const inputs: BuildSimulationParamsInputs = {
            projection: state.projection,
            config: state.config,
            liveCSVBalances: derivePortfolioStartingBalances(state.assets ?? [], state.fxRates ?? {}),
            calculatedStartingCash: computeStartingCash(state.initialBalances ?? {}, state.transactions ?? []),
            realEstateGoals: state.realEstateGoals ?? [],
            debts: state.debts ?? [],
            childGoals: state.childGoals ?? [],
            travelGoals: state.travelGoals ?? [],
            lifeEvents: state.lifeEvents ?? [],
            retirementGoal: state.retirementGoal,
            financialGoals: state.financialGoals ?? [],
            budgetItems: state.budgetItems ?? [],
            calculatedMonthlySavings: computeMonthlySavings(state.config, state.budgetItems ?? []),
            startYear: START_YEAR,
            startMonth: START_MONTH,
            insurancePolicies: state.insurancePolicies ?? [],
            vehicleReplacements: state.vehicleReplacements ?? [],
            majorRenovations: state.majorRenovations ?? [],
            charitableGoals: state.charitableGoals ?? [],
            rentalProperties: state.rentalProperties ?? [],
            privateBusinesses: state.privateBusinesses ?? [],
        };
        const direct = buildSimulationParams(inputs);
        const viaState = buildSimulationParamsFromState(state, {
            startYear: START_YEAR,
            startMonth: START_MONTH,
        });
        expect(direct).toEqual(viaState);
        // baseMonthlyExpenses dérivé correctement.
        expect(direct.baseMonthlyExpenses).toBeCloseTo(
            direct.baseNetAnnual / 12 - inputs.calculatedMonthlySavings,
            6,
        );
    });
});
