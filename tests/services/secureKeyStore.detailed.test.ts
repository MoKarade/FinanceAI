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

// ── [FINTABLE-TOKEN-WIPE] ───────────────────────────────────────────────────
// Bug signalé par Marc (« mon jeton Fintable se perd tout le temps »), diagnostiqué le 2026-08-13.
//
// Le jeton Fintable est DEVICE-LOCAL : `services/sync/syncSnapshot.ts` l'exclut DÉLIBÉRÉMENT de ce
// qui part vers Drive (un jeton bancaire ne doit pas voyager). Conséquence contre-intuitive : il
// n'est jamais non plus dans ce qui en REVIENT. Or `syncPull` réécrivait le coffre avec le payload
// Drive — donc `{anthropic, finnhub}` seuls — et `saveApiKeys` écrasait EN BLOC.
//
// Le symptôme était trompeur : le store en mémoire fusionne (`{...prev, ...keys}`), donc le jeton
// continuait de marcher dans l'onglet ouvert et ne disparaissait qu'au RECHARGEMENT suivant.
//
// Ces tests exercent le vrai coffre (IndexedDB en mémoire, AES réel), pas un mock.
describe('[FINTABLE-TOKEN-WIPE] saveApiKeys préserve les champs device-local', () => {
    it('une écriture SANS `fintable` (payload Drive) ne l\'efface PAS du coffre', async () => {
        // 1. Marc colle son jeton sur cet appareil.
        await saveApiKeys({ anthropic: 'sk-ant-xyz', finnhub: 'fh-123', fintable: 'ft-secret-789' });

        // 2. Une synchro Drive arrive. Par construction elle ne porte QUE ces deux clés.
        await saveApiKeys({ anthropic: 'sk-ant-NOUVEAU', finnhub: 'fh-NOUVEAU' });

        // 3. Rechargement de l'app → c'est ici que le jeton disparaissait.
        const after = await loadApiKeysDetailed();
        expect(after.status).toBe('ok');
        if (after.status !== 'ok') return;
        expect(after.keys.fintable, 'le jeton Fintable a été effacé par la synchro Drive').toBe('ft-secret-789');
        // Les clés qui VOYAGENT, elles, doivent bien avoir été mises à jour — sinon le correctif
        // aurait simplement figé le coffre.
        expect(after.keys.anthropic).toBe('sk-ant-NOUVEAU');
        expect(after.keys.finnhub).toBe('fh-NOUVEAU');
    });

    it('un `fintable` explicitement VIDE efface bien le jeton (absent ≠ effacé)', async () => {
        await saveApiKeys({ anthropic: 'a', finnhub: 'f', fintable: 'ft-a-effacer' });
        // L'utilisateur vide le champ dans l'UI : la valeur est PRÉSENTE, juste vide.
        await saveApiKeys({ anthropic: 'a', finnhub: 'f', fintable: '' });

        const after = await loadApiKeysDetailed();
        expect(after.status).toBe('ok');
        if (after.status !== 'ok') return;
        expect(after.keys.fintable, 'un effacement explicite doit passer').toBe('');
    });

    it('premier enregistrement sur un coffre VIDE : rien à préserver, rien ne casse', async () => {
        const after0 = await loadApiKeysDetailed();
        expect(after0.status).toBe('empty');

        await saveApiKeys({ anthropic: 'a', finnhub: 'f' });
        const after = await loadApiKeysDetailed();
        expect(after.status).toBe('ok');
        if (after.status !== 'ok') return;
        expect(after.keys.fintable).toBeUndefined();
    });

    it('coffre ILLISIBLE : l\'écriture passe quand même (on ne bloque pas sur la préservation)', async () => {
        // Blob corrompu → `loadApiKeysDetailed` rend 'decrypt_failed'. Les NOUVELLES clés doivent
        // malgré tout être persistées : préserver est un bonus, jamais une condition d'écriture.
        localStorage.setItem(LS_BLOB_KEY, 'blob-corrompu-!!');
        await expect(saveApiKeys({ anthropic: 'a', finnhub: 'f', fintable: 'ft-neuf' })).resolves.toBeUndefined();

        const after = await loadApiKeysDetailed();
        expect(after.status).toBe('ok');
        if (after.status !== 'ok') return;
        expect(after.keys.fintable).toBe('ft-neuf');
    });
});
