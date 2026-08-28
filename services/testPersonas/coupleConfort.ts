// services/testPersonas/coupleConfort.ts
//
// Persona PAR DÉFAUT — « Couple à l'aise » (Alex & Sam).
// Réutilise les fixtures historiques (testConfig/testAssets/testBudget/testGoals/
// testTransactions) telles quelles : double revenu confortable, maison avec
// hypothèque, 1 enfant, actifs CELI/REER/NonReg/Crypto, dettes modérées.
//
// C'est le persona PAR DÉFAUT (`DEFAULT_PERSONA_ID`) du Mode Test depuis toujours —
// conservé à l'identique pour ne casser aucun consommateur ni les baselines E2E.
// ⚠️ Une exception depuis [TEST-PERSONA-NON-DETERMINISTE] (lot 30) : `generateTestTransactions`
// est désormais SEEDÉ, donc ses montants ont changé UNE fois. Les baselines visées ci-dessus
// sont les `@visual` (hors gate CI, tolérance 2 %, déjà dépendantes de `new Date()`).

import type { AppState } from '../../types';
import { TEST_CONFIG } from '../testConfig';
import { TEST_ASSETS } from '../testAssets';
import { TEST_BUDGET_ITEMS, TEST_DEBTS, TEST_REAL_ESTATE } from '../testBudget';
import {
    TEST_CHILD_GOALS,
    TEST_FINANCIAL_GOALS,
    TEST_LIFE_EVENTS,
    TEST_RETIREMENT,
    TEST_TRAVEL,
} from '../testGoals';
import { generateTestTransactions } from '../testTransactions';

export function buildCoupleConfort(): Partial<AppState> {
    return {
        config: TEST_CONFIG,
        budgetItems: TEST_BUDGET_ITEMS,
        assets: TEST_ASSETS,
        initialBalances: {
            CELI: 32000,
            REER: 12500,
            'NON-ENREG': 3500,
            CRYPTO: 14250,
            LIQUIDITE: 8500,
        },
        transactions: generateTestTransactions(),
        debts: TEST_DEBTS,
        retirementGoal: TEST_RETIREMENT,
        realEstateGoals: TEST_REAL_ESTATE,
        childGoals: TEST_CHILD_GOALS,
        travelGoals: TEST_TRAVEL,
        lifeEvents: TEST_LIFE_EVENTS,
        financialGoals: TEST_FINANCIAL_GOALS,
        investmentAccounts: [],
        investmentTransactions: [],
        insurancePolicies: [],
        rentalProperties: [],
        privateBusinesses: [],
        vehicleReplacements: [],
        majorRenovations: [],
        charitableGoals: [],
    };
}
