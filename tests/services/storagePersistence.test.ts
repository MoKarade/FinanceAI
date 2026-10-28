// tests/services/storagePersistence.test.ts
//
// [STORAGE-PERSIST-REQUEST] Le coffre chiffré (IndexedDB + localStorage) n'était JAMAIS déclaré
// persistant : le navigateur pouvait l'évincer sous pression disque. Ce module demande la
// persistance UNE fois, sans jamais lever, et expose un état DIAGNOSTICABLE. Les quatre issues
// (accordée / refusée / non supportée / exception) sont exercées une par une — un faux navigateur
// par cas, jamais un seul faux qui « marche ».
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    requestPersistentStorage, getStoragePersistence, queryStoragePersisted, libellePersistance,
    _resetStoragePersistenceForTests,
} from '../../services/storagePersistence';

const ORIGINAL = Object.getOwnPropertyDescriptor(globalThis.navigator, 'storage');
const fauxStorage = (impl: Record<string, unknown> | undefined) => {
    Object.defineProperty(globalThis.navigator, 'storage', { value: impl, configurable: true });
};

describe('[STORAGE-PERSIST-REQUEST] requestPersistentStorage / queryStoragePersisted', () => {
    beforeEach(() => _resetStoragePersistenceForTests());
    afterEach(() => {
        if (ORIGINAL) Object.defineProperty(globalThis.navigator, 'storage', ORIGINAL);
        else delete (globalThis.navigator as unknown as Record<string, unknown>).storage;
        _resetStoragePersistenceForTests();
    });

    it('avant toute demande : « inconnue » (jamais un état fabriqué)', () => {
        expect(getStoragePersistence()).toBe('inconnue');
    });

    it('persist() → true : « accordee », et la demande n\'est faite qu\'UNE fois (promesse mémoïsée)', async () => {
        const persist = vi.fn(async () => true);
        fauxStorage({ persist });
        await expect(requestPersistentStorage()).resolves.toBe('accordee');
        await expect(requestPersistentStorage()).resolves.toBe('accordee');
        expect(persist).toHaveBeenCalledTimes(1);
        expect(getStoragePersistence()).toBe('accordee');
    });

    it('persist() → false : « refusee » — un refus est un ÉTAT, pas une exception', async () => {
        fauxStorage({ persist: vi.fn(async () => false) });
        await expect(requestPersistentStorage()).resolves.toBe('refusee');
        expect(getStoragePersistence()).toBe('refusee');
    });

    it('API absente (Safari, environnement sans navigator.storage) : « non-supportee », sans lever', async () => {
        fauxStorage(undefined);
        await expect(requestPersistentStorage()).resolves.toBe('non-supportee');
        await expect(queryStoragePersisted()).resolves.toBe('non-supportee');
    });

    it('persist() qui LÈVE : « inconnue », sans propager — le boot ne doit jamais casser pour ça', async () => {
        fauxStorage({ persist: vi.fn(async () => { throw new Error('SecurityError'); }) });
        await expect(requestPersistentStorage()).resolves.toBe('inconnue');
    });

    it('queryStoragePersisted lit l\'état RÉEL (persisted()), indépendant de la demande', async () => {
        fauxStorage({ persist: vi.fn(async () => false), persisted: vi.fn(async () => true) });
        await requestPersistentStorage();
        expect(getStoragePersistence()).toBe('refusee');       // ce que la demande a rendu
        await expect(queryStoragePersisted()).resolves.toBe('accordee'); // ce que le navigateur dit MAINTENANT
    });

    it('chaque libellé dit ce que l\'état IMPLIQUE (éviction) — et les quatre sont distincts', () => {
        const etats = ['accordee', 'refusee', 'non-supportee', 'inconnue'] as const;
        const libelles = etats.map(libellePersistance);
        expect(new Set(libelles).size).toBe(4);
        for (const l of libelles) expect(l).toMatch(/^STORAGE: /);
        expect(libellePersistance('refusee')).toMatch(/évictable|best-effort/);
        expect(libellePersistance('accordee')).toMatch(/ne seront pas évincés/);
    });
});
