import { describe, it, expect, vi, beforeEach } from 'vitest';

// fake-indexeddb : monte une impl IndexedDB en mémoire pour les tests.
// Pas de dépendance npm — on stub via vi.stubGlobal pour les tests basiques.

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
