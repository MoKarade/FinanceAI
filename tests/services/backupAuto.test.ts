import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { webcrypto } from 'node:crypto';

// SF-1 — on vérifie que les échecs IndexedDB ne sont plus avalés silencieusement
// (console.warn invisible en prod sans backend) mais journalisés via le logger
// borné (errorLogger), SANS changer le contrat de retour (null/[]/false/void).
vi.mock('../../services/errorLogger', () => ({ logError: vi.fn() }));
import { logError } from '../../services/errorLogger';

// IndexedDB n'est pas dispo en jsdom → les tests « glue » stubent via
// vi.stubGlobal. Le cœur métier S-A (chiffrement du payload) est, lui, testé
// purement en injectant une CryptoKey (modèle identique à secureKeyStore.test).
beforeAll(() => {
    if (!globalThis.crypto?.subtle) {
        (globalThis as { crypto?: Crypto }).crypto = webcrypto as unknown as Crypto;
    }
});

const makeKey = (): Promise<CryptoKey> =>
    globalThis.crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt'],
    ) as Promise<CryptoKey>;

// Snapshot localStorage représentatif (PII financière) pour vérifier le non-leak.
const SAMPLE_PAYLOAD = JSON.stringify({
    state: { transactions: [{ payee: 'Loyer', amount: -1850 }], users: [{ salary: 92000 }] },
});

describe('backupAuto', () => {
    beforeEach(() => {
        // Pas d'IndexedDB dans le test environment par défaut
        // → les fonctions doivent gracefully fail
    });

    it('listBackups returns [] si IndexedDB indisponible', async () => {
        const { listBackups } = await import('../../services/backupAuto');
        // Force IndexedDB indisponible
        vi.stubGlobal('indexedDB', undefined);
        const result = await listBackups();
        expect(result).toEqual([]);
        vi.unstubAllGlobals();
    });

    it('createBackupNow returns null si localStorage vide', async () => {
        const { createBackupNow } = await import('../../services/backupAuto');
        // jsdom localStorage est vide par défaut
        localStorage.clear();
        const result = await createBackupNow('manual');
        expect(result).toBeNull();
    });

    it('createBackupNow : échec IndexedDB avec payload → logError (non silencieux) + null', async () => {
        const { createBackupNow } = await import('../../services/backupAuto');
        localStorage.setItem('financeai-storage', SAMPLE_PAYLOAD);
        vi.stubGlobal('indexedDB', undefined);
        vi.mocked(logError).mockClear();
        const result = await createBackupNow('manual');
        expect(result).toBeNull();
        expect(logError).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('createBackupNow') }),
        );
        vi.unstubAllGlobals();
        localStorage.clear();
    });

    it('getBackupStats returns count=0 sur état initial', async () => {
        const { getBackupStats } = await import('../../services/backupAuto');
        vi.stubGlobal('indexedDB', undefined);
        const stats = await getBackupStats();
        expect(stats.count).toBe(0);
        expect(stats.totalBytes).toBe(0);
        vi.unstubAllGlobals();
    });

    it('initAutoBackup silent fail si IndexedDB indisponible', async () => {
        const { initAutoBackup } = await import('../../services/backupAuto');
        vi.stubGlobal('indexedDB', undefined);
        await expect(initAutoBackup()).resolves.toBeUndefined();
        vi.unstubAllGlobals();
    });

    it('restoreBackup retourne false si id invalide', async () => {
        const { restoreBackup } = await import('../../services/backupAuto');
        vi.stubGlobal('indexedDB', undefined);
        const result = await restoreBackup('nonexistent-id');
        expect(result).toBe(false);
        vi.unstubAllGlobals();
    });
});

describe('backupAuto — chiffrement au repos (S-A)', () => {
    it('buildStoredPayload chiffre quand une clé est fournie (pas de PII en clair)', async () => {
        const { buildStoredPayload } = await import('../../services/backupAuto');
        const stored = await buildStoredPayload(SAMPLE_PAYLOAD, await makeKey());
        expect(stored.encrypted).toBe(true);
        expect(stored.payload).not.toBe(SAMPLE_PAYLOAD);
        expect(stored.payload).not.toContain('Loyer');
        expect(stored.payload).not.toContain('92000');
    });

    it('buildStoredPayload dégrade en clair sans clé (backup quand même)', async () => {
        const { buildStoredPayload } = await import('../../services/backupAuto');
        const stored = await buildStoredPayload(SAMPLE_PAYLOAD, null);
        expect(stored.encrypted).toBe(false);
        expect(stored.payload).toBe(SAMPLE_PAYLOAD);
    });

    it('round-trip : readStoredPayload restitue fidèlement le plaintext chiffré', async () => {
        const { buildStoredPayload, readStoredPayload } = await import('../../services/backupAuto');
        const key = await makeKey();
        const stored = await buildStoredPayload(SAMPLE_PAYLOAD, key);
        const back = await readStoredPayload({ payload: stored.payload, encrypted: true }, key);
        expect(back).toBe(SAMPLE_PAYLOAD);
    });

    it('readStoredPayload lit un ancien backup en clair (encrypted absent ou false)', async () => {
        const { readStoredPayload } = await import('../../services/backupAuto');
        expect(await readStoredPayload({ payload: SAMPLE_PAYLOAD }, null)).toBe(SAMPLE_PAYLOAD);
        const key = await makeKey();
        expect(await readStoredPayload({ payload: SAMPLE_PAYLOAD, encrypted: false }, key)).toBe(SAMPLE_PAYLOAD);
    });

    it('readStoredPayload lève si chiffré mais clé absente', async () => {
        const { readStoredPayload } = await import('../../services/backupAuto');
        await expect(readStoredPayload({ payload: 'blob', encrypted: true }, null)).rejects.toThrow();
    });

    it('readStoredPayload rejette un blob altéré (AES-GCM authentifie)', async () => {
        const { buildStoredPayload, readStoredPayload } = await import('../../services/backupAuto');
        const key = await makeKey();
        const stored = await buildStoredPayload(SAMPLE_PAYLOAD, key);
        const bytes = Buffer.from(stored.payload, 'base64');
        bytes[bytes.length - 1] ^= 0xff; // flip dans le tag GCM
        const tampered = bytes.toString('base64');
        await expect(readStoredPayload({ payload: tampered, encrypted: true }, key)).rejects.toThrow();
    });
});
