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
 * Reconnexion / gate : il n'y a PLUS d'exception « restoreIntent » (qui faisait gagner Drive même sur
 * du LOCAL réel → une vieille copie Drive écrasait des données récentes à la reconnexion). Bug Marc
 * 2026-07-14 : 230k$ de placements locaux clobberés par une copie Drive périmée (SPCX seul). UNE seule
 * garde anti-perte : local vide → pull (restaure) ; local réel + Drive divergent → `conflict` (choix
 * utilisateur, surfacé par l'UI globale SyncConflictModal), JAMAIS d'écrasement auto. Le cas légitime
 * « nouvel appareil, je restaure » passe par la règle local-vide (hasMeaningfulData classe un défaut/
 * onboarding frais comme vide).
 */
describe('decideOnLoad — anti-clobber reconnexion (retrait restoreIntent, Marc 2026-07-14)', () => {
    const fresh = (over: Partial<SyncMeta> = {}): SyncMeta =>
        meta({ lastPulledUpdatedAt: 0, lastLocalHash: '', ...over });

    it('DISCRIMINANT : méta vierge (reconnexion) + local RÉEL + Drive divergent → conflict (JAMAIS pull auto)', () => {
        // Le piège EXACT : appareil déconnecté (méta vierge) avec des placements locaux réels, Drive
        // porte une VIEILLE copie pauvre. AVANT le fix : restoreIntent → pull → local écrasé. APRÈS : conflict.
        const d = decideOnLoad({
            drive: envelope({ updatedAt: 5000, payload: { state: { assets: [{ symbol: 'SPCX' }] } } }),
            localIsEmpty: false, // l'appareil a les vraies données (230k$)
            localHash: 'richlocal',
            meta: fresh(), // méta vierge = déconnecté / jamais syncé via ce système
        });
        expect(d.action).toBe('conflict');
        expect(d.reason).toBe('divergence-deux-cotes');
    });

    it('méta vierge + local réel + Drive avancé → conflict (pas de restauration destructrice)', () => {
        const d = decideOnLoad({
            drive: envelope({ updatedAt: 2000 }),
            localIsEmpty: false,
            localHash: 'bbbbbbbb',
            meta: fresh(),
        });
        expect(d.action).toBe('conflict');
        expect(d.reason).toBe('divergence-deux-cotes');
    });

    it('méta vierge MAIS contenu Drive == local (reconnexion sur données identiques) → noop (pas de conflit bruyant)', () => {
        const identical = { state: { transactions: [{ id: 't1' }] } };
        const d = decideOnLoad({
            drive: envelope({ updatedAt: 2000, payload: identical }),
            localIsEmpty: false,
            localHash: hashPayload(identical), // == hash du payload Drive (clair)
            meta: fresh(),
        });
        expect(d.action).toBe('noop');
        expect(d.reason).toBe('contenu-identique');
    });

    it('local VIDE (nouvel appareil) → pull : la restauration légitime passe TOUJOURS (aucune perte possible)', () => {
        const d = decideOnLoad({
            drive: envelope(),
            localIsEmpty: true,
            localHash: 'x',
            meta: fresh(),
        });
        expect(d.action).toBe('pull');
        expect(d.reason).toBe('local-vide-restaurer');
    });

    it('local réel strictement en avance (Drive pas avancé depuis la dernière sync) → push (publie, pas de conflit)', () => {
        const d = decideOnLoad({
            drive: envelope({ updatedAt: 1000 }),
            localIsEmpty: false,
            localHash: 'cccccccc',
            meta: meta({ lastPulledUpdatedAt: 1000, lastLocalHash: 'aaaaaaaa' }),
        });
        expect(d.action).toBe('push');
        expect(d.reason).toBe('local-modifie');
    });

    it('Drive ABSENT + local réel → push (première sync, rien à écraser)', () => {
        const d = decideOnLoad({
            drive: null,
            localIsEmpty: false,
            localHash: 'bbbbbbbb',
            meta: fresh(),
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
        expect(env.apiKeysEnc).toBeUndefined(); // pas de champ clés si non fourni
        expect(env.apiKeys).toBeUndefined();    // jamais de clés en clair
    });

    it('inclut le blob de clés CHIFFRÉ quand fourni (apiKeysEnc), jamais en clair', () => {
        const env = buildEnvelope({ k: 'v' }, 'dev-9', '2.1.0', 4242, 'ENC_BLOB_B64');
        expect(env.apiKeysEnc).toBe('ENC_BLOB_B64');
        expect(env.apiKeys).toBeUndefined();
    });
});
