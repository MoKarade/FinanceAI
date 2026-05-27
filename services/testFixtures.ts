// services/testFixtures.ts
//
// Fixtures pour le "Mode Test" — permet de remplir l'app avec des données
// réalistes Québec/Canada 2026 pour tester rapidement les flows sans saisir.
// Activable via Settings → Outils dev → "Activer mode test". Un backup
// IndexedDB est créé automatiquement avant le switch (cf cloudBackup auto).
//
// Convention "no fake data" du CLAUDE.md : ces fixtures NE sont JAMAIS
// chargées au boot ni dans un état par défaut. Elles ne s'activent que
// sur action utilisateur explicite, et un banner permanent signale le mode.
//
// DT4 — Fichier splitté en modules plus petits pour la lisibilité :
//   testConfig.ts       → utilisateurs + config couple
//   testAssets.ts       → actifs CELI/REER/NonReg/Crypto
//   testBudget.ts       → catégories budget, immobilier, dettes
//   testGoals.ts        → retraite, enfants, voyages, life events, objectifs
//   testTransactions.ts → 60 transactions de test sur 3 mois
//   testMarketData.ts   → generateTestMarketData (CSV Yahoo Finance bundlé)
//
// Ce fichier est le point d'entrée unique — les importeurs extérieurs
// (TestModePanel, usePortfolioHistory, tests) n'ont pas à changer.

import type { AppState } from '../types';
import { TEST_CONFIG, TEST_USERS } from './testConfig';
import { TEST_ASSETS } from './testAssets';
import { TEST_BUDGET_ITEMS, TEST_DEBTS, TEST_REAL_ESTATE } from './testBudget';
import {
    TEST_CHILD_GOALS,
    TEST_FINANCIAL_GOALS,
    TEST_LIFE_EVENTS,
    TEST_RETIREMENT,
    TEST_TRAVEL,
} from './testGoals';
import { generateTestTransactions } from './testTransactions';

// Re-export pour les consommateurs qui importaient directement depuis ce
// fichier (ex : tests unitaires qui mockent generateTestMarketData).
export { generateTestMarketData } from './testMarketData';
// Re-export TEST_USERS pour les tests qui vérifient les utilisateurs.
export { TEST_USERS };

/**
 * Retourne un état complet de test. Les balances et soldes sont cohérents
 * (CELI ~30k, REER ~12k, NonReg ~3.5k, Crypto ~14k = total ~60k).
 */
export function buildTestFixtures(): Partial<AppState> {
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
        savingsGoals: [],
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
