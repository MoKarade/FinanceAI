/**
 * @vitest-environment jsdom
 *
 * Chemins d'échec de l'ORCHESTRATION du coffre (le cœur crypto est couvert par
 * secureKeyStore.test.ts). On verrouille le contrat UX de la restauration des clés :
 *   - loadApiKeysDetailed distingue 'ok' / 'empty' / 'decrypt_failed' (l'UI affiche un toast
 *     « re-saisir vos clés » UNIQUEMENT dans le 3e cas) ;
 *   - saveApiKeys LÈVE si le coffre est indisponible (l'appelant décide quoi montrer, jamais un
 *     échec silencieux qui ferait croire que les clés sont persistées).
 *
 * jsdom ne fournit ni Web Crypto (selon la version) ni IndexedDB :
 *   - on injecte le webcrypto de Node (comme cloudBackup.test.ts) ;
 *   - on fournit un IndexedDB minimal EN MÉMOIRE (suffisant pour openDb/idbGet/idbPut : 1 store,
 *     get/put, upgrade). Cela exerce le VRAI code du coffre de bout en bout (pas un mock du module).
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import {
    saveApiKeys,
    loadApiKeysDetailed,
    getOrCreateDeviceKey,
    type PersistedApiKeys,
} from '../../services/secureKeyStore';

beforeAll(() => {
    // jsdom ne garantit pas SubtleCrypto → on injecte celui de Node (AES-GCM). No-op s'il existe déjà.
    if (!globalThis.crypto?.subtle) {
        (globalThis as { crypto?: Crypto }).crypto = webcrypto as unknown as Crypto;
    }
});

const LS_BLOB_KEY = 'app_api_keys_enc';
const SAMPLE: PersistedApiKeys = { anthropic: 'sk-ant-xyz', finnhub: 'fh-123' };

// ── IndexedDB minimal en mémoire ────────────────────────────────────────────
// Implémente UNIQUEMENT ce que secureKeyStore utilise : open(+upgrade), objectStore.get/put,
// db.transaction/close, et les callbacks onsuccess/oncomplete/onerror. Volontairement minimal.
type Store = Map<string, unknown>;
const dbStores = new Map<string, Store>(); // dbName → (key → value)

function installFakeIndexedDB(): void {
    const fake = {
        open(name: string, _version?: number) {
            const req: Record<string, unknown> = { result: undefined, error: null };
            queueMicrotask(() => {
                let store = dbStores.get(name);
                const isNew = !store;
                if (!store) {
                    store = new Map();
                    dbStores.set(name, store);
                }
                const db = makeDb(name, store as Store);
                if (isNew && typeof req.onupgradeneeded === 'function') {
                    req.result = db;
                    (req.onupgradeneeded as () => void)();
                }
                req.result = db;
                if (typeof req.onsuccess === 'function') (req.onsuccess as () => void)();
            });
            return req;
        },
    };
    vi.stubGlobal('indexedDB', fake as unknown as IDBFactory);
}

function makeDb(name: string, store: Store): IDBDatabase {
    const objectStoreNames = { contains: () => true } as unknown as DOMStringList;
    return {
        objectStoreNames,
        createObjectStore: () => ({}) as IDBObjectStore,
        close: () => {},
        transaction: (_names: string | string[], _mode?: IDBTransactionMode) => {
            const tx: Record<string, unknown> = { error: null };
            const objectStore = () => ({
                get: (key: string) => {
                    const r: Record<string, unknown> = { result: undefined, error: null };
                    queueMicrotask(() => {
                        r.result = store.get(key);
                        if (typeof r.onsuccess === 'function') (r.onsuccess as () => void)();
                    });
                    return r;
                },
                put: (value: unknown, key: string) => {
                    const r: Record<string, unknown> = { result: undefined, error: null };
                    store.set(key, value);
                    queueMicrotask(() => {
                        if (typeof tx.oncomplete === 'function') (tx.oncomplete as () => void)();
                        if (typeof r.onsuccess === 'function') (r.onsuccess as () => void)();
                    });
                    return r;
                },
            });
            tx.objectStore = objectStore;
            return tx as unknown as IDBTransaction;
        },
    } as unknown as IDBDatabase;
}

beforeEach(() => {
    dbStores.clear();
    localStorage.clear();
    installFakeIndexedDB();
});

afterEach(() => {
    vi.unstubAllGlobals();
    // Réinjecte le crypto de Node si le unstub l'a retiré (les autres tests en dépendent).
    if (!globalThis.crypto?.subtle) {
        (globalThis as { crypto?: Crypto }).crypto = webcrypto as unknown as Crypto;
    }
});

describe('loadApiKeysDetailed — statut "ok"', () => {
    it('round-trip via saveApiKeys : clés persistées puis relues, status "ok"', async () => {
        await saveApiKeys(SAMPLE);
        const res = await loadApiKeysDetailed();
        expect(res.status).toBe('ok');
        if (res.status === 'ok') expect(res.keys).toEqual(SAMPLE);
    });
});

describe('loadApiKeysDetailed — statut "empty"', () => {
    it('aucun blob en localStorage → "empty" (1er lancement), sans toucher IndexedDB', async () => {
        // localStorage vide (beforeEach) → court-circuit avant l'ouverture IDB.
        const res = await loadApiKeysDetailed();
        expect(res.status).toBe('empty');
    });

    it('IndexedDB absent (navigateur dégradé) → "empty" (coffre non supporté)', async () => {
        // Même avec un blob présent : sans IDB, isSecureKeyStoreSupported() est faux → "empty".
        localStorage.setItem(LS_BLOB_KEY, 'blob-quelconque');
        vi.stubGlobal('indexedDB', undefined);
        const res = await loadApiKeysDetailed();
        expect(res.status).toBe('empty');
    });
});

describe('loadApiKeysDetailed — statut "decrypt_failed"', () => {
    it('blob présent mais CLÉ DE DEVICE absente (IDB vidé) → "decrypt_failed"', async () => {
        // On écrit un blob valide chiffré avec la clé de device…
        await saveApiKeys(SAMPLE);
        const blob = localStorage.getItem(LS_BLOB_KEY);
        expect(blob).toBeTruthy();
        // …puis on simule un IndexedDB vidé (clé de device disparue) en gardant le blob.
        dbStores.clear();
        const res = await loadApiKeysDetailed();
        expect(res.status).toBe('decrypt_failed'); // l'UI doit demander de re-saisir les clés
    });

    it('blob ALTÉRÉ (clé présente mais ciphertext corrompu) → "decrypt_failed"', async () => {
        await saveApiKeys(SAMPLE); // crée la clé de device + un blob valide
        localStorage.setItem(LS_BLOB_KEY, 'AAAAAAAAAAAAAAAAAAAAAAAA'); // base64 valide mais indéchiffrable
        const res = await loadApiKeysDetailed();
        expect(res.status).toBe('decrypt_failed');
    });
});

describe('saveApiKeys — coffre indisponible → LÈVE (jamais un succès silencieux)', () => {
    it('IndexedDB absent → rejette avec un message explicite', async () => {
        vi.stubGlobal('indexedDB', undefined);
        await expect(saveApiKeys(SAMPLE)).rejects.toThrow(/coffre chiffré indisponible/i);
        // Et surtout : rien n'a été écrit (pas de faux « sauvegardé »).
        expect(localStorage.getItem(LS_BLOB_KEY)).toBeNull();
    });

    it('Web Crypto absent → rejette aussi (coffre non supporté)', async () => {
        // On retire subtle uniquement le temps de l'appel (isSecureKeyStoreSupported() le vérifie).
        const realCrypto = globalThis.crypto;
        vi.stubGlobal('crypto', {} as Crypto);
        await expect(saveApiKeys(SAMPLE)).rejects.toThrow();
        vi.stubGlobal('crypto', realCrypto);
    });
});

describe('getOrCreateDeviceKey — idempotence (une seule clé par profil)', () => {
    it('deux appels rendent la MÊME clé (réutilisée depuis IndexedDB, pas régénérée)', async () => {
        const a = await getOrCreateDeviceKey();
        const b = await getOrCreateDeviceKey();
        // Le fake IDB stocke la CryptoKey par référence → l'identité prouve la réutilisation.
        expect(b).toBe(a);
    });
});
