/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    getOrCreateDeviceId,
    readSyncMeta,
    writeSyncMeta,
    clearSyncMeta,
} from '../../services/sync/syncState';
import type { SyncMeta } from '../../services/sync/syncTypes';

const sample = (): SyncMeta => ({
    connectedEmail: 'a@b.com',
    connectedSub: 'sub-x',
    lastSyncedAt: 123,
    lastPulledUpdatedAt: 456,
    lastLocalHash: 'deadbeef',
    deviceId: 'dev-x',
});

beforeEach(() => {
    localStorage.clear();
});

describe('syncState — métadonnées locales', () => {
    it('round-trip write → read', () => {
        const meta = sample();
        writeSyncMeta(meta);
        expect(readSyncMeta()).toEqual(meta);
    });

    it('absence de meta → null', () => {
        expect(readSyncMeta()).toBeNull();
    });

    it('meta corrompu (JSON invalide) → null (repart de zéro, pas de décision sur du bidon)', () => {
        localStorage.setItem('financeai:sync:meta:v1', '{pas du json');
        expect(readSyncMeta()).toBeNull();
    });

    it('meta sans champ critique → null', () => {
        localStorage.setItem('financeai:sync:meta:v1', JSON.stringify({ connectedEmail: 'a@b.com' }));
        expect(readSyncMeta()).toBeNull();
    });

    it('clearSyncMeta efface la meta', () => {
        writeSyncMeta(sample());
        clearSyncMeta();
        expect(readSyncMeta()).toBeNull();
    });
});

describe('getOrCreateDeviceId', () => {
    it('crée puis persiste un id stable', () => {
        const id1 = getOrCreateDeviceId();
        const id2 = getOrCreateDeviceId();
        expect(id1).toBeTruthy();
        expect(id1).toBe(id2);
    });

    it('survit à un nouvel appel après lecture du storage', () => {
        const id = getOrCreateDeviceId();
        // Simule un rechargement : l'id doit être relu, pas régénéré.
        expect(localStorage.getItem('financeai:deviceId:v1')).toBe(id);
    });

    it('clearSyncMeta NE supprime PAS le deviceId', () => {
        const id = getOrCreateDeviceId();
        writeSyncMeta(sample());
        clearSyncMeta();
        expect(getOrCreateDeviceId()).toBe(id);
    });
});
