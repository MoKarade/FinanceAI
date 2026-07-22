// tests/mcp/refreshPrices.test.ts
//
// [HUB-REFRESH-CRON] runPriceRefresh — rafraîchissement serveur des prix (déclencheur planifié).
// Vérifie : (1) un cours changé applique le patch ET réécrit Drive avec la VERSION lue (OCC) ;
// (2) aucun changement → AUCUNE écriture (pas de push parasite) ; (3) un symbole non quotable est
// skippé honnêtement, sans écriture ; (4) une source non-inscriptible échoue clairement ; (5) le
// save n'altère QUE les cours (les autres champs de l'actif survivent).

import { describe, it, expect, beforeEach } from 'vitest';
import { runPriceRefresh } from '../../mcp/refreshPrices';
import { __resetPriceRefreshThrottle } from '../../services/priceRefresh';
import { StateConflictError, isStateConflictError } from '../../mcp/state/stateErrors';
import type { StateStore } from '../../mcp/state/stateStore';
import type { SaveResult } from '../../mcp/state/writeAppState';
import type { AppState, Asset } from '../../types';
import type { Quote } from '../../services/marketData';

function asset(over: Partial<Asset> = {}): Asset {
    return {
        symbol: 'AAPL', quantity: 10, currency: 'USD', currentPrice: 100, name: 'Apple',
        performance: 0, dateBought: '2024-01-01', ...over,
    };
}

/** On ne s'intéresse qu'à `assets` : le reste de l'AppState n'est pas lu par runPriceRefresh. */
function stateWith(assets: Asset[]): AppState {
    return { assets } as unknown as AppState;
}

function mockStore(state: AppState, version: number | null): {
    store: StateStore;
    saves: Array<{ state: AppState; expectedVersion: number | null | undefined }>;
} {
    const saves: Array<{ state: AppState; expectedVersion: number | null | undefined }> = [];
    const store = {
        canWrite: true,
        get: async () => state,
        getWithVersion: async () => ({ state, version }),
        save: async (next: AppState, expectedVersion?: number | null): Promise<SaveResult> => {
            saves.push({ state: next, expectedVersion });
            return { version: (version ?? 0) + 1 } as SaveResult;
        },
    } as unknown as StateStore;
    return { store, saves };
}

const quote = (price: number, currency = 'USD'): Quote => ({
    symbol: 'AAPL', price, change: 0, changePercent: 0, currency, timestamp: 1_700_000_000_000,
});

/** Deps rapides : provider présent, pas d'attente réseau. */
const fastDeps = (getQuote: (s: string) => Promise<Quote | null>) => ({
    getQuote, hasProvider: () => true, sleep: async () => {}, delayMs: 0, now: () => 1_700_000_100_000,
});

beforeEach(() => __resetPriceRefreshThrottle());

describe('runPriceRefresh', () => {
    it('cours changé → patch appliqué ET save avec la VERSION lue (OCC), saved:true', async () => {
        const { store, saves } = mockStore(stateWith([asset({ currentPrice: 100 })]), 42);
        const out = await runPriceRefresh(store, fastDeps(async () => quote(120)));

        expect(out.saved).toBe(true);
        expect(out.refreshed).toEqual(['AAPL']);
        expect(saves).toHaveLength(1);
        expect(saves[0].expectedVersion).toBe(42); // OCC : la version LUE est passée au save
        expect(saves[0].state.assets[0].currentPrice).toBe(120);
    });

    it('n\'altère QUE le cours : les autres champs de l\'actif survivent', async () => {
        const { store, saves } = mockStore(
            stateWith([asset({ currentPrice: 100, quantity: 7, name: 'Apple Inc', accountType: 'CELI' })]),
            1,
        );
        await runPriceRefresh(store, fastDeps(async () => quote(133)));
        const saved = saves[0].state.assets[0];
        expect({ q: saved.quantity, n: saved.name, a: saved.accountType }).toEqual({ q: 7, n: 'Apple Inc', a: 'CELI' });
    });

    it('aucun cours changé (même prix) → AUCUNE écriture, saved:false', async () => {
        const { store, saves } = mockStore(stateWith([asset({ currentPrice: 100 })]), 5);
        const out = await runPriceRefresh(store, fastDeps(async () => quote(100)));
        expect(out.saved).toBe(false);
        expect(out.unchanged).toEqual(['AAPL']);
        expect(saves).toHaveLength(0);
    });

    it('symbole non quotable (pas de provider) → skippé no-quote, aucune écriture', async () => {
        const { store, saves } = mockStore(stateWith([asset({ symbol: 'GIC-MANUEL' })]), 5);
        const out = await runPriceRefresh(store, {
            getQuote: async () => null, hasProvider: () => false, sleep: async () => {}, delayMs: 0,
        });
        expect(out.saved).toBe(false);
        expect(out.skipped).toEqual([{ symbol: 'GIC-MANUEL', reason: 'no-quote' }]);
        expect(saves).toHaveLength(0);
    });

    it('source non-inscriptible → erreur claire, jamais d\'écriture silencieuse', async () => {
        const store = { canWrite: false, get: async () => stateWith([]), getWithVersion: async () => ({ state: stateWith([]), version: null }), save: async () => { throw new Error('ne devrait pas être appelé'); } } as unknown as StateStore;
        await expect(runPriceRefresh(store)).rejects.toThrow(/non inscriptible/i);
    });

    it('conflit OCC au save → propage un StateConflictError (le cron distingue transitoire vs panne)', async () => {
        // Contrat sur lequel repose POST /refresh : un conflit reste TYPÉ jusqu'au handler (→ 200
        // conflict:true, réessai), là où une panne réelle non typée doit devenir 5xx (alerte).
        const { store } = mockStore(stateWith([asset({ currentPrice: 100 })]), 7);
        (store as { save: unknown }).save = async () => { throw new StateConflictError('Conflit : Drive a bougé.'); };
        const err = await runPriceRefresh(store, fastDeps(async () => quote(150))).catch((e) => e);
        expect(isStateConflictError(err)).toBe(true);
    });

    it('panne réelle au save (jeton révoqué) → erreur NON typée conflit → deviendra un 5xx', async () => {
        const { store } = mockStore(stateWith([asset({ currentPrice: 100 })]), 7);
        (store as { save: unknown }).save = async () => { throw new Error('invalid_grant : refresh Drive révoqué.'); };
        const err = await runPriceRefresh(store, fastDeps(async () => quote(150))).catch((e) => e);
        expect(isStateConflictError(err)).toBe(false);
    });
});
