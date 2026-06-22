import { describe, it, expect } from 'vitest';
import { migratePersistedState, useFinanceStore } from '../../store/useFinanceStore';

// [PH4-F] Les abonnements deviennent PERSISTÉS (champ additif `subscriptions`). Approche ADDITIVE
// (PAS de bump v7→v8) : rien à migrer (les abos n'étaient jamais stockés, seulement détectés à la
// volée). Le champ est fourni par l'ÉTAT INITIAL du store (défaut []) + le `merge` Zustand par défaut.
// Ces tests PROUVENT la rétrocompat : un vieil état persisté (sans `subscriptions`) ne perd rien,
// et le champ existe bien dans le store. Discriminant : avant PH4-F, `getState().subscriptions` est
// `undefined` (≠ []) → le 1er test échoue (RED). Cf. discipline « test de migration RED d'abord ».

describe('[PH4-F] subscriptions — migration additive (rétrocompat, sans bump v7→v8)', () => {
    it('le store initialise subscriptions à [] (le champ additif existe)', () => {
        expect(useFinanceStore.getState().subscriptions).toEqual([]);
    });

    it('un état v7 SANS subscriptions se migre SANS PERTE (champ fourni par l\'init, pas par migrate)', () => {
        const v7 = {
            assets: [{ symbol: 'AAPL', quantity: 1 }],
            transactions: [{ id: 1, amount: -10 }],
            retirementGoal: { targetAge: 65, lifeExpectancy: 90 },
            apiKeys: { anthropic: 'x', finnhub: '' },
        };
        const migrated = migratePersistedState(v7, 7) as Record<string, unknown>;
        // Aucun champ existant perdu.
        expect(migrated.assets).toEqual([{ symbol: 'AAPL', quantity: 1 }]);
        expect(migrated.transactions).toEqual([{ id: 1, amount: -10 }]);
        expect(migrated.retirementGoal).toEqual({ targetAge: 65, lifeExpectancy: 90 });
        // `subscriptions` n'est PAS injecté par migrate (additif via init + merge) → absent ici, c'est CORRECT
        // (le store le défaultera à [] à la réhydratation). Surtout : aucune corruption.
        expect(migrated.subscriptions).toBeUndefined();
    });

    it('un état qui a DÉJÀ des subscriptions persistés les CONSERVE (forward-compat)', () => {
        const withSubs = {
            transactions: [],
            subscriptions: [{ payee: 'Netflix', averageAmount: 17, dayOfMonth: 5, category: 'Abos', lastDate: '2026-06-05', yearlyCost: 204 }],
        };
        const migrated = migratePersistedState(withSubs, 7) as Record<string, unknown>;
        expect(migrated.subscriptions).toEqual(withSubs.subscriptions);
    });
});
