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

/**
 * [TEST-PERSONA-FIXTURE-PARTAGEE] Copie PROFONDE des constantes partagées. Sans elle, ce persona
 * — le seul des sept dans ce cas, et c'est le persona PAR DÉFAUT — rendait à chaque appel les
 * MÊMES objets — les **DIX** champs réutilisés depuis des constantes de module, pas cinq :
 * `config`, `budgetItems`, `assets`, `debts`, `retirementGoal`, `realEstateGoals`, `childGoals`,
 * `travelGoals`, `lifeEvents`, `financialGoals` (identité stricte mesurée entre deux `build()`), donc toute mutation d'un consommateur contaminait tous les
 * suivants dans le même processus. Mesuré : écrire `config.users[0].netSalary = 999` sur un build
 * change la valeur lue par le build SUIVANT (5 200 → 999).
 *
 * Ce n'est pas théorique — ça a faussé une mesure de cette session : deux cas d'un même relevé
 * partageaient une corruption, et le second affichait un `baseNetAnnual` de 52 800 au lieu de
 * 115 200 sans que rien ne l'explique. Un fixture partagé ne casse pas un test, il en fabrique
 * un FAUX, ce qui est pire. Les six autres personas construisent déjà des littéraux frais.
 *
 * `structuredClone` plutôt qu'un spread : `{ ...TEST_CONFIG }` partagerait encore le tableau
 * `users`, et `[...TEST_ASSETS]` partagerait encore chaque actif — or c'est justement à ce
 * niveau-là qu'on mute.
 */
export function buildCoupleConfort(): Partial<AppState> {
    return {
        config: structuredClone(TEST_CONFIG),
        budgetItems: structuredClone(TEST_BUDGET_ITEMS),
        assets: structuredClone(TEST_ASSETS),
        initialBalances: {
            CELI: 32000,
            REER: 12500,
            'NON-ENREG': 3500,
            CRYPTO: 14250,
            LIQUIDITE: 8500,
        },
        transactions: generateTestTransactions(),
        debts: structuredClone(TEST_DEBTS),
        retirementGoal: structuredClone(TEST_RETIREMENT),
        realEstateGoals: structuredClone(TEST_REAL_ESTATE),
        childGoals: structuredClone(TEST_CHILD_GOALS),
        travelGoals: structuredClone(TEST_TRAVEL),
        lifeEvents: structuredClone(TEST_LIFE_EVENTS),
        financialGoals: structuredClone(TEST_FINANCIAL_GOALS),
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
