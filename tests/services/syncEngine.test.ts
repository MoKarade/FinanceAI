import { describe, it, expect } from 'vitest';
import {
    decideOnLoad,
    shouldPush,
    hashPayload,
    canonicalJson,
    buildEnvelope,
} from '../../services/sync/syncEngine';
import { SYNC_SCHEMA_VERSION, type SyncEnvelope, type SyncMeta } from '../../services/sync/syncTypes';

// ── Helpers ────────────────────────────────────────────────────────────────
const meta = (over: Partial<SyncMeta> = {}): SyncMeta => ({
    connectedEmail: 'user@example.com',
    lastSyncedAt: 1000,
    lastPulledUpdatedAt: 1000,
    lastLocalHash: 'aaaaaaaa',
    deviceId: 'dev-1',
    ...over,
});

const envelope = (over: Partial<SyncEnvelope> = {}): SyncEnvelope => ({
    schemaVersion: SYNC_SCHEMA_VERSION,
    updatedAt: 1000,
    deviceId: 'dev-2',
    appVersion: '1.0.0',
    enc: false,
    payload: { transactions: [{ id: 't1' }] },
    ...over,
});

/**
 * decideOnLoad EST le garde-fou anti-perte. Chaque ligne de la matrice
 * (docs/GOOGLE_DRIVE_SYNC_DESIGN.md §4) a son test : une régression ici effacerait
 * des données financières.
 */
describe('decideOnLoad — matrice anti-perte', () => {
    it('Drive absent + local vide → noop', () => {
        const d = decideOnLoad({ drive: null, localIsEmpty: true, localHash: 'x', meta: meta() });
        expect(d.action).toBe('noop');
        expect(d.reason).toBe('drive-absent-local-vide');
    });

    it('Drive absent + local non-vide → push (première sync)', () => {
        const d = decideOnLoad({ drive: null, localIsEmpty: false, localHash: 'x', meta: meta() });
        expect(d.action).toBe('push');
        expect(d.reason).toBe('premiere-sync');
    });

    it('Drive présent + local VIDE → pull (restaure incognito/nouvel appareil)', () => {
        const d = decideOnLoad({ drive: envelope(), localIsEmpty: true, localHash: 'x', meta: meta() });
        expect(d.action).toBe('pull');
        expect(d.reason).toBe('local-vide-restaurer');
    });

    it('Drive a avancé + local INCHANGÉ → pull (sûr)', () => {
        const d = decideOnLoad({
            drive: envelope({ updatedAt: 2000 }),
            localIsEmpty: false,
            localHash: 'aaaaaaaa', // == meta.lastLocalHash → inchangé
            meta: meta({ lastPulledUpdatedAt: 1000, lastLocalHash: 'aaaaaaaa' }),
        });
        expect(d.action).toBe('pull');
        expect(d.reason).toBe('drive-plus-recent-local-inchange');
    });

    it('Drive a avancé + local MODIFIÉ → conflict (jamais d écrasement auto)', () => {
        const d = decideOnLoad({
            drive: envelope({ updatedAt: 2000 }),
            localIsEmpty: false,
            localHash: 'bbbbbbbb', // != meta.lastLocalHash → modifié
            meta: meta({ lastPulledUpdatedAt: 1000, lastLocalHash: 'aaaaaaaa' }),
        });
        expect(d.action).toBe('conflict');
        expect(d.reason).toBe('divergence-deux-cotes');
    });

    it('Drive PAS avancé + local modifié → push', () => {
        const d = decideOnLoad({
            drive: envelope({ updatedAt: 1000 }),
            localIsEmpty: false,
            localHash: 'cccccccc',
            meta: meta({ lastPulledUpdatedAt: 1000, lastLocalHash: 'aaaaaaaa' }),
        });
        expect(d.action).toBe('push');
        expect(d.reason).toBe('local-modifie');
    });

    it('Rien n a bougé des deux côtés → noop (déjà sync)', () => {
        const d = decideOnLoad({
            drive: envelope({ updatedAt: 1000 }),
            localIsEmpty: false,
            localHash: 'aaaaaaaa',
            meta: meta({ lastPulledUpdatedAt: 1000, lastLocalHash: 'aaaaaaaa' }),
        });
        expect(d.action).toBe('noop');
        expect(d.reason).toBe('deja-sync');
    });
});

/**
 * restoreIntent = login PAR LE GATE (« je me connecte pour récupérer mon compte »). Sur un appareil
 * jamais synchronisé via ce système (méta vierge : lastPulledUpdatedAt=0 ET lastLocalHash=''),
 * Drive doit gagner même si le local n'est pas strictement vide (défaut/restes d'un autre device).
 * Bug Marc 2026-05-29 : sans ça, le gate classait tout en « conflit » et montrait le local (mauvaises
 * données) au lieu de restaurer. Le boot normal (restoreIntent absent/false) garde la garde stricte.
 */
describe('decideOnLoad — restoreIntent (gate : restauration explicite)', () => {
    const fresh = (over: Partial<SyncMeta> = {}): SyncMeta =>
        meta({ lastPulledUpdatedAt: 0, lastLocalHash: '', ...over });

    it('GATE + appareil jamais syncé + local NON-vide + Drive présent → pull (restaure)', () => {
        const d = decideOnLoad({
            drive: envelope({ updatedAt: 2000 }),
            localIsEmpty: false,
            localHash: 'bbbbbbbb',
            meta: fresh(),
            restoreIntent: true,
        });
        expect(d.action).toBe('pull');
        expect(d.reason).toBe('gate-restaure-appareil-neuf');
    });

    it('BOOT normal (sans restoreIntent) + même situation → conflict (garde anti-perte stricte)', () => {
        const d = decideOnLoad({
            drive: envelope({ updatedAt: 2000 }),
            localIsEmpty: false,
            localHash: 'bbbbbbbb',
            meta: fresh(),
            // restoreIntent absent → false
        });
        expect(d.action).toBe('conflict');
        expect(d.reason).toBe('divergence-deux-cotes');
    });

    it('GATE + appareil DÉJÀ syncé (méta non-vierge) → matrice normale (pas de pull forcé)', () => {
        // Drive a avancé + local modifié → conflit, même avec restoreIntent : un appareil qui a
        // déjà synchronisé a un historique de confiance, on ne force pas l'écrasement.
        const d = decideOnLoad({
            drive: envelope({ updatedAt: 2000 }),
            localIsEmpty: false,
            localHash: 'bbbbbbbb',
            meta: meta({ lastPulledUpdatedAt: 1000, lastLocalHash: 'aaaaaaaa' }),
            restoreIntent: true,
        });
        expect(d.action).toBe('conflict');
        expect(d.reason).toBe('divergence-deux-cotes');
    });

    it('GATE + local VIDE → pull (inchangé : la règle local-vide prime)', () => {
        const d = decideOnLoad({
            drive: envelope(),
            localIsEmpty: true,
            localHash: 'x',
            meta: fresh(),
            restoreIntent: true,
        });
        expect(d.action).toBe('pull');
        expect(d.reason).toBe('local-vide-restaurer');
    });

    it('GATE + Drive ABSENT + local non-vide → push (première sync, rien à écraser)', () => {
        const d = decideOnLoad({
            drive: null,
            localIsEmpty: false,
            localHash: 'bbbbbbbb',
            meta: fresh(),
            restoreIntent: true,
        });
        expect(d.action).toBe('push');
        expect(d.reason).toBe('premiere-sync');
    });
});

describe('shouldPush — garde push-au-changement', () => {
    it('refuse de pousser un état vide (anti-écrasement incognito)', () => {
        expect(shouldPush(true)).toBe(false);
    });
    it('autorise le push si local non-vide', () => {
        expect(shouldPush(false)).toBe(true);
    });
    it('refuse de pousser en mode test (anti-écrasement par données persona)', () => {
        expect(shouldPush(false, true)).toBe(false);
    });
    it('autorise le push hors mode test si local non-vide', () => {
        expect(shouldPush(false, false)).toBe(true);
    });
});

describe('hashPayload / canonicalJson', () => {
    it('hash stable quel que soit l ordre des clés', () => {
        const a = { x: 1, y: { b: 2, a: 3 }, z: [1, 2] };
        const b = { z: [1, 2], y: { a: 3, b: 2 }, x: 1 };
        expect(hashPayload(a)).toBe(hashPayload(b));
    });

    it('hash différent si une valeur change', () => {
        expect(hashPayload({ a: 1 })).not.toBe(hashPayload({ a: 2 }));
    });

    it('canonicalJson trie les clés récursivement', () => {
        expect(canonicalJson({ b: 1, a: { d: 1, c: 2 } })).toBe('{"a":{"c":2,"d":1},"b":1}');
    });

    it('hash est un hex 8 caractères', () => {
        expect(hashPayload({ any: 'thing' })).toMatch(/^[0-9a-f]{8}$/);
    });

    it("préserve l'ordre des tableaux (l'ordre y est significatif)", () => {
        expect(hashPayload([1, 2, 3])).not.toBe(hashPayload([3, 2, 1]));
    });
});

describe('buildEnvelope', () => {
    it('construit une enveloppe complète avec enc:false et les valeurs injectées', () => {
        const env = buildEnvelope({ k: 'v' }, 'dev-9', '2.1.0', 4242);
        expect(env).toEqual({
            schemaVersion: SYNC_SCHEMA_VERSION,
            updatedAt: 4242,
            deviceId: 'dev-9',
            appVersion: '2.1.0',
            enc: false,
            payload: { k: 'v' },
        });
        expect(env.apiKeys).toBeUndefined(); // pas de champ clés si non fourni (rétro-compat v1)
    });

    it('inclut apiKeys quand fournies (sync v2)', () => {
        const keys = { anthropic: 'sk-x', finnhub: 'fh-y' };
        const env = buildEnvelope({ k: 'v' }, 'dev-9', '2.1.0', 4242, keys);
        expect(env.apiKeys).toEqual(keys);
    });
});
