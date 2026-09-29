/**
 * @vitest-environment jsdom
 *
 * [CHIFFREMENT-PHASE1] Mémorisation de la passphrase par appareil (plan §3, avis pole-securite
 * OBLIGATOIRE avant tout code) : clé AES non extractible (IndexedDB) + verrou biométrique/WebAuthn
 * à CHAQUE usage (authentificateur de PLATEFORME, userVerification "required"). Échec fermé partout :
 * WebAuthn indisponible/refusé, IndexedDB indisponible, blob absent/altéré → jamais un repli plus
 * faible, la phrase complète est redemandée.
 *
 * Fake IndexedDB Map-based (comme secureKeyStore.detailed.test.ts) : `fake-indexeddb` (le paquet) ne
 * sait pas structured-clone une CryptoKey non extractible ; un Map en mémoire stocke la RÉFÉRENCE
 * de l'objet, ce qui exerce le vrai round-trip (génération → persistance → relecture → déchiffrement).
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { webcrypto } from 'node:crypto';

beforeAll(() => {
    if (!globalThis.crypto?.subtle) {
        (globalThis as { crypto?: Crypto }).crypto = webcrypto as unknown as Crypto;
    }
});

// ── IndexedDB minimal en mémoire (persiste entre les appels d'un même test) ──────────────────────
type Store = Map<string, unknown>;
const dbStores = new Map<string, Store>();

function installFakeIndexedDB(): void {
    const fake = {
        open(name: string) {
            const req: Record<string, unknown> = { result: undefined, error: null };
            queueMicrotask(() => {
                let store = dbStores.get(name);
                const isNew = !store;
                if (!store) { store = new Map(); dbStores.set(name, store); }
                const db = makeDb(store as Store);
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

function makeDb(store: Store): IDBDatabase {
    return {
        objectStoreNames: { contains: () => true } as unknown as DOMStringList,
        createObjectStore: () => ({}) as IDBObjectStore,
        close: () => {},
        transaction: () => {
            const tx: Record<string, unknown> = { error: null };
            tx.objectStore = () => ({
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
                delete: (key: string) => {
                    const r: Record<string, unknown> = { result: undefined, error: null };
                    store.delete(key);
                    queueMicrotask(() => {
                        if (typeof tx.oncomplete === 'function') (tx.oncomplete as () => void)();
                        if (typeof r.onsuccess === 'function') (r.onsuccess as () => void)();
                    });
                    return r;
                },
            });
            return tx as unknown as IDBTransaction;
        },
    } as unknown as IDBDatabase;
}

/** Stub WebAuthn minimal : simule un authentificateur de PLATEFORME dispo/absent, et un succès/échec
 *  de vérification. `navigator.credentials.create`/`.get` renvoient des objets suffisants (id/rawId). */
function stubWebAuthn(opts: { plateformeDisponible: boolean; createReussit: boolean; getReussit: boolean }): void {
    class FakePublicKeyCredential {
        static isUserVerifyingPlatformAuthenticatorAvailable = vi.fn(async () => opts.plateformeDisponible);
    }
    vi.stubGlobal('PublicKeyCredential', FakePublicKeyCredential as unknown as typeof PublicKeyCredential);
    const rawId = new Uint8Array([1, 2, 3, 4]).buffer;
    const credentials = {
        create: vi.fn(async () => {
            if (!opts.createReussit) throw new Error('création refusée (utilisateur ou plateforme)');
            return { rawId, id: 'fake-id', type: 'public-key' };
        }),
        get: vi.fn(async () => {
            if (!opts.getReussit) throw new Error('vérification refusée (utilisateur ou plateforme)');
            return { id: 'fake-id', type: 'public-key' };
        }),
    };
    vi.stubGlobal('navigator', { ...globalThis.navigator, credentials });
}

beforeEach(() => {
    dbStores.clear();
    localStorage.clear();
    installFakeIndexedDB();
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (!globalThis.crypto?.subtle) {
        (globalThis as { crypto?: Crypto }).crypto = webcrypto as unknown as Crypto;
    }
});

describe('[CHIFFREMENT-PHASE1] deviceKeyStore — disponibilité', () => {
    it('isPlatformAuthenticatorAvailable : true quand la plateforme le confirme', async () => {
        stubWebAuthn({ plateformeDisponible: true, createReussit: true, getReussit: true });
        const { isPlatformAuthenticatorAvailable } = await import('../../services/deviceKeyStore');
        expect(await isPlatformAuthenticatorAvailable()).toBe(true);
    });

    it('isPlatformAuthenticatorAvailable : false si WebAuthn est absent du navigateur', async () => {
        vi.stubGlobal('PublicKeyCredential', undefined);
        const { isPlatformAuthenticatorAvailable } = await import('../../services/deviceKeyStore');
        expect(await isPlatformAuthenticatorAvailable()).toBe(false);
    });

    it('isPlatformAuthenticatorAvailable : false si la plateforme n\'a pas d\'authentificateur', async () => {
        stubWebAuthn({ plateformeDisponible: false, createReussit: true, getReussit: true });
        const { isPlatformAuthenticatorAvailable } = await import('../../services/deviceKeyStore');
        expect(await isPlatformAuthenticatorAvailable()).toBe(false);
    });
});

describe('[CHIFFREMENT-PHASE1] deviceKeyStore — rememberPassphraseOnDevice', () => {
    it('plateforme disponible + création WebAuthn réussie : "remembered", isDeviceRemembered() devient true', async () => {
        stubWebAuthn({ plateformeDisponible: true, createReussit: true, getReussit: true });
        const { rememberPassphraseOnDevice, isDeviceRemembered } = await import('../../services/deviceKeyStore');
        expect(await isDeviceRemembered()).toBe(false);
        const res = await rememberPassphraseOnDevice('une-phrase-secrete-suffisamment-longue');
        expect(res).toBe('remembered');
        expect(await isDeviceRemembered()).toBe(true);
    });

    it('aucun authentificateur de plateforme : "unavailable", RIEN n\'est mémorisé (pas de repli plus faible)', async () => {
        stubWebAuthn({ plateformeDisponible: false, createReussit: true, getReussit: true });
        const { rememberPassphraseOnDevice, isDeviceRemembered } = await import('../../services/deviceKeyStore');
        const res = await rememberPassphraseOnDevice('une-phrase-secrete-suffisamment-longue');
        expect(res).toBe('unavailable');
        expect(await isDeviceRemembered()).toBe(false);
    });

    it('création WebAuthn refusée par l\'utilisateur : "unavailable", rien mémorisé', async () => {
        stubWebAuthn({ plateformeDisponible: true, createReussit: false, getReussit: true });
        const { rememberPassphraseOnDevice, isDeviceRemembered } = await import('../../services/deviceKeyStore');
        const res = await rememberPassphraseOnDevice('une-phrase-secrete-suffisamment-longue');
        expect(res).toBe('unavailable');
        expect(await isDeviceRemembered()).toBe(false);
    });

    it('IndexedDB indisponible : "unavailable", rien mémorisé', async () => {
        vi.stubGlobal('indexedDB', undefined);
        stubWebAuthn({ plateformeDisponible: true, createReussit: true, getReussit: true });
        const { rememberPassphraseOnDevice } = await import('../../services/deviceKeyStore');
        expect(await rememberPassphraseOnDevice('une-phrase-secrete-suffisamment-longue')).toBe('unavailable');
    });

    it('la clé générée est bien AES-GCM 256 bits et NON EXTRACTIBLE (extractable: false)', async () => {
        stubWebAuthn({ plateformeDisponible: true, createReussit: true, getReussit: true });
        const genererCle = vi.spyOn(globalThis.crypto.subtle, 'generateKey');
        const { rememberPassphraseOnDevice } = await import('../../services/deviceKeyStore');
        await rememberPassphraseOnDevice('une-phrase-secrete-suffisamment-longue');
        expect(genererCle).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'AES-GCM', length: 256 }),
            false, // extractable
            expect.arrayContaining(['encrypt', 'decrypt']),
        );
    });
});

describe('[CHIFFREMENT-PHASE1] deviceKeyStore — tryUnlockRememberedPassphrase (le verrou à CHAQUE usage)', () => {
    it('round-trip complet : mémorise puis déverrouille (verrou WebAuthn réussi) → même phrase', async () => {
        stubWebAuthn({ plateformeDisponible: true, createReussit: true, getReussit: true });
        const { rememberPassphraseOnDevice, tryUnlockRememberedPassphrase } = await import('../../services/deviceKeyStore');
        await rememberPassphraseOnDevice('ma-phrase-de-test-tres-longue');
        expect(await tryUnlockRememberedPassphrase()).toBe('ma-phrase-de-test-tres-longue');
    });

    // ── Filet non bloquant (§3 du plan) : expiration par INACTIVITÉ à ~30 jours sur la mémorisation
    // elle-même — hygiène, pas une protection contre un vol le jour même. Horloge INJECTÉE (`now`),
    // jamais Date.now() réel, pour un test déterministe. ─────────────────────────────────────────
    it('filet 30j : lastUsed à 31 jours d\'inactivité → null (mémorisation traitée comme expirée)', async () => {
        stubWebAuthn({ plateformeDisponible: true, createReussit: true, getReussit: true });
        const { rememberPassphraseOnDevice, tryUnlockRememberedPassphrase } = await import('../../services/deviceKeyStore');
        let t = 1_000_000_000_000;
        await rememberPassphraseOnDevice('ma-phrase-de-test-tres-longue', { now: () => t });
        const UN_JOUR_MS = 24 * 60 * 60 * 1000;
        t += 31 * UN_JOUR_MS;
        expect(await tryUnlockRememberedPassphrase({ now: () => t })).toBeNull();
    });

    it('filet 30j : lastUsed à 29 jours d\'inactivité → déverrouille normalement (pas encore expiré)', async () => {
        stubWebAuthn({ plateformeDisponible: true, createReussit: true, getReussit: true });
        const { rememberPassphraseOnDevice, tryUnlockRememberedPassphrase } = await import('../../services/deviceKeyStore');
        let t = 1_000_000_000_000;
        await rememberPassphraseOnDevice('ma-phrase-de-test-tres-longue', { now: () => t });
        const UN_JOUR_MS = 24 * 60 * 60 * 1000;
        t += 29 * UN_JOUR_MS;
        expect(await tryUnlockRememberedPassphrase({ now: () => t })).toBe('ma-phrase-de-test-tres-longue');
    });

    it('rien de mémorisé (jamais activé) : null, sans même solliciter WebAuthn', async () => {
        stubWebAuthn({ plateformeDisponible: true, createReussit: true, getReussit: true });
        const mod = await import('../../services/deviceKeyStore');
        expect(await mod.tryUnlockRememberedPassphrase()).toBeNull();
    });

    it('verrou WebAuthn ÉCHOUE à l\'usage (utilisateur refuse/annule) : null — ÉCHEC FERMÉ, jamais le blob déchiffré quand même', async () => {
        stubWebAuthn({ plateformeDisponible: true, createReussit: true, getReussit: true });
        const { rememberPassphraseOnDevice } = await import('../../services/deviceKeyStore');
        await rememberPassphraseOnDevice('ma-phrase-de-test-tres-longue');
        // Le verrou échoue maintenant (vol/absence de l'utilisateur légitime).
        stubWebAuthn({ plateformeDisponible: true, createReussit: true, getReussit: false });
        const { tryUnlockRememberedPassphrase } = await import('../../services/deviceKeyStore');
        expect(await tryUnlockRememberedPassphrase()).toBeNull();
    });

    it('authentificateur de plateforme devenu INDISPONIBLE depuis la mémorisation : null, échec fermé', async () => {
        stubWebAuthn({ plateformeDisponible: true, createReussit: true, getReussit: true });
        const { rememberPassphraseOnDevice } = await import('../../services/deviceKeyStore');
        await rememberPassphraseOnDevice('ma-phrase-de-test-tres-longue');
        vi.stubGlobal('PublicKeyCredential', undefined);
        const { tryUnlockRememberedPassphrase } = await import('../../services/deviceKeyStore');
        expect(await tryUnlockRememberedPassphrase()).toBeNull();
    });

    it('IndexedDB devenu indisponible depuis la mémorisation (clé perdue) : null, jamais une exception qui sort', async () => {
        stubWebAuthn({ plateformeDisponible: true, createReussit: true, getReussit: true });
        const { rememberPassphraseOnDevice } = await import('../../services/deviceKeyStore');
        await rememberPassphraseOnDevice('ma-phrase-de-test-tres-longue');
        vi.stubGlobal('indexedDB', undefined);
        const { tryUnlockRememberedPassphrase } = await import('../../services/deviceKeyStore');
        await expect(tryUnlockRememberedPassphrase()).resolves.toBeNull();
    });

    it('blob localStorage altéré (corruption) : null, jamais une exception qui sort', async () => {
        stubWebAuthn({ plateformeDisponible: true, createReussit: true, getReussit: true });
        const { rememberPassphraseOnDevice } = await import('../../services/deviceKeyStore');
        await rememberPassphraseOnDevice('ma-phrase-de-test-tres-longue');
        // Corrompt le blob chiffré sans toucher la clé IDB.
        for (const k of Object.keys(localStorage)) {
            if (/passphrase.*blob|blob.*passphrase/i.test(k)) localStorage.setItem(k, 'zzz-corrompu-zzz');
        }
        const { tryUnlockRememberedPassphrase } = await import('../../services/deviceKeyStore');
        await expect(tryUnlockRememberedPassphrase()).resolves.toBeNull();
    });
});

describe('[CHIFFREMENT-PHASE1] deviceKeyStore — forgetDevice (« Oublier cet appareil »)', () => {
    it('après forgetDevice : isDeviceRemembered=false, plus rien à déverrouiller', async () => {
        stubWebAuthn({ plateformeDisponible: true, createReussit: true, getReussit: true });
        const { rememberPassphraseOnDevice, isDeviceRemembered, forgetDevice, tryUnlockRememberedPassphrase } = await import('../../services/deviceKeyStore');
        await rememberPassphraseOnDevice('ma-phrase-de-test-tres-longue');
        expect(await isDeviceRemembered()).toBe(true);
        await forgetDevice();
        expect(await isDeviceRemembered()).toBe(false);
        expect(await tryUnlockRememberedPassphrase()).toBeNull();
    });
});
