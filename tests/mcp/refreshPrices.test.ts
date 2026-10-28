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
import type { LectureFxComplete } from '../../services/fx/ecritureFx';

function asset(over: Partial<Asset> = {}): Asset {
    return {
        symbol: 'AAPL', quantity: 10, currency: 'USD', currentPrice: 100, name: 'Apple',
        performance: 0, dateBought: '2024-01-01', ...over,
    };
}

/** [FX-SERVEUR-JAMAIS-RAFRAICHI] Instant des tests (≈ 14/11/2023) et état FX déjà à jour : une
 *  lecture IDENTIQUE à cet instant ne doit rien écrire, ce qui isole les tests de prix. */
const T = 1_700_000_100_000;
const FX_A_JOUR = {
    fxRates: { USD: 1.37, EUR: 1.49, CAD: 1, lastFetched: T },
    fxRatesEstimated: false, fxRatesSource: 'api', fxLastAttemptCause: 'ok', fxLastAttemptAt: T,
    fxObservationDate: '2023-11-13',
} as const;
const lectureIdentique = async (): Promise<LectureFxComplete> => ({
    USD: 1.37, EUR: 1.49, CAD: 1, lastFetched: T, estimated: false, source: 'api', cause: 'ok',
    attemptAt: T, observationDate: '2023-11-13',
});

/** `assets` + un état FX déjà à jour ; le reste de l'AppState n'est pas lu par runPriceRefresh. */
function stateWith(assets: Asset[], fx: object = FX_A_JOUR): AppState {
    return { assets, ...fx } as unknown as AppState;
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
const fastDeps = (getQuote: (s: string) => Promise<Quote | null>, lireTauxFx = lectureIdentique) => ({
    getQuote, hasProvider: () => true, sleep: async () => {}, delayMs: 0, now: () => T, lireTauxFx,
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
            lireTauxFx: lectureIdentique,
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

// [FX-SERVEUR-JAMAIS-RAFRAICHI] Les taux de la Banque du Canada n'étaient lus que par le navigateur,
// au démarrage : le serveur valorisait au taux de la dernière ouverture de l'app. La passe planifiée
// les lit désormais, avec la MÊME décision et la MÊME écriture que le navigateur.
describe('runPriceRefresh — taux de change', () => {
    const memePrix = async () => quote(100);
    const lecture = (over: Partial<LectureFxComplete>) => async (): Promise<LectureFxComplete> => ({
        ...(await lectureIdentique()), ...over,
    });

    it('taux de marché NEUFS, prix inchangés → écrit taux + provenance + date, saved:true', async () => {
        const { store, saves } = mockStore(stateWith([asset({ currentPrice: 100 })]), 3);
        const out = await runPriceRefresh(store, fastDeps(memePrix, lecture({ USD: 1.38, observationDate: '2023-11-14' })));
        expect(out.fx).toEqual({ ecriture: 'taux', cause: 'ok' });
        expect(out.saved).toBe(true);
        expect(saves).toHaveLength(1);
        const ecrit = saves[0].state as unknown as typeof FX_A_JOUR;
        expect(ecrit.fxRates.USD).toBe(1.38);
        expect(ecrit.fxRatesSource).toBe('api');
        expect(ecrit.fxObservationDate).toBe('2023-11-14');
        expect(saves[0].expectedVersion).toBe(3); // OCC, comme pour les prix
    });

    it('lecture IDENTIQUE et récente → aucune écriture (contrôle négatif)', async () => {
        const { store, saves } = mockStore(stateWith([asset({ currentPrice: 100 })]), 3);
        const out = await runPriceRefresh(store, fastDeps(memePrix));
        expect(out.fx).toEqual({ ecriture: 'aucune', cause: 'ok' });
        expect(saves).toHaveLength(0);
    });

    it('taux SAISI À LA MAIN + Banque du Canada injoignable → le taux saisi SURVIT, seule la trace change', async () => {
        const manuel = { ...FX_A_JOUR, fxRates: { USD: 1.365, EUR: 1.5, CAD: 1, lastFetched: T }, fxRatesSource: 'manuel', fxObservationDate: undefined };
        const { store, saves } = mockStore(stateWith([asset({ currentPrice: 100 })], manuel), 3);
        // Le repli en dur que rend `fetchFxRates` quand le réseau manque.
        const repli = lecture({ USD: 1.4, EUR: 1.47, lastFetched: 0, estimated: true, source: 'repli', cause: 'reseau', attemptAt: T + 1000, observationDate: undefined });
        const out = await runPriceRefresh(store, fastDeps(memePrix, repli));
        expect(out.fx).toEqual({ ecriture: 'diagnostic', cause: 'reseau' });
        expect(saves).toHaveLength(1);
        const ecrit = saves[0].state as unknown as { fxRates: { USD: number; EUR: number }; fxRatesSource: string; fxLastAttemptCause: string };
        expect(ecrit.fxRates.USD).toBe(1.365);
        expect(ecrit.fxRates.EUR).toBe(1.5);
        expect(ecrit.fxRatesSource).toBe('manuel');
        expect(ecrit.fxLastAttemptCause).toBe('reseau');
    });

    it('blob ANCIEN sans aucun champ FX → la lecture de marché les écrit au lieu de lever', async () => {
        const { store, saves } = mockStore(stateWith([asset({ currentPrice: 100 })], {}), 3);
        const out = await runPriceRefresh(store, fastDeps(memePrix));
        expect(out.fx.ecriture).toBe('taux');
        expect((saves[0].state as unknown as typeof FX_A_JOUR).fxRates.USD).toBe(1.37);
    });

    it('lecture qui LÈVE → rapportée (jamais avalée), et les PRIX sont quand même rafraîchis', async () => {
        const { store, saves } = mockStore(stateWith([asset({ currentPrice: 100 })]), 3);
        const out = await runPriceRefresh(store, fastDeps(async () => quote(120), async () => { throw new Error('boum'); }));
        expect(out.fx).toEqual({ ecriture: 'echec', erreur: 'boum' });
        expect(out.saved).toBe(true);
        expect(saves[0].state.assets[0].currentPrice).toBe(120);
        // Et les champs FX existants ne sont pas touchés.
        expect((saves[0].state as unknown as typeof FX_A_JOUR).fxRates.USD).toBe(1.37);
    });
});
