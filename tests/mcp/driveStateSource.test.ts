// tests/mcp/driveStateSource.test.ts
//
// Lot 3 — DriveStateSource : lit/écrit le blob financeai-sync.json de l'app via driveAppData (fetch
// mocké). On prouve : lecture clair → AppState nu ; écriture → enveloppe enc:false qui CONSERVE la
// version persist + apiKeysEnc ; coffre chiffré → erreur claire ; pas de blob → erreur claire ; et que
// la source nourrit bien le loader existant (loadAppStateFromSource).

import { describe, it, expect, vi } from 'vitest';
import type { FetchLike } from '../../services/googleDrive/driveAppData';
import type { SyncEnvelope } from '../../services/sync/syncTypes';
import { DriveStateSource } from '../../mcp/drive/driveStateSource';
import { buildDefaultAppState, loadAppStateFromSource } from '../../mcp/state/loadAppState';

const resp = (data: unknown, ok = true, status = 200): Response =>
    ({ ok, status, json: async () => data } as unknown as Response);

/** fetch mocké routant par URL/méthode comme l'API Drive ; capture l'enveloppe écrite. */
function makeFetch(opts: {
    fileExists?: boolean;
    envelope?: SyncEnvelope | null;
    onWrite?: (env: SyncEnvelope) => void;
}): FetchLike {
    return async (url, init) => {
        const method = (init?.method || 'GET').toUpperCase();
        if (method === 'GET' && url.includes('alt=media')) return resp(opts.envelope ?? null); // readSyncFile
        if (method === 'POST' && url.includes('uploadType=multipart')) {                       // createSyncFile
            return resp({ id: 'file-new' });
        }
        if (method === 'PATCH' && url.includes('uploadType=media')) {                          // updateSyncFile
            opts.onWrite?.(JSON.parse(init?.body as string) as SyncEnvelope);
            return resp({});
        }
        if (url.includes('spaces=appDataFolder')) {                                            // findSyncFile
            return resp({ files: opts.fileExists ? [{ id: 'file-1', modifiedTime: '2026' }] : [] });
        }
        return resp({}, false, 404);
    };
}

const token = async () => 'tok-test';

function clearEnvelope(state: unknown, version = 7, apiKeysEnc?: string): SyncEnvelope {
    return {
        schemaVersion: 1, updatedAt: 1_000, deviceId: 'app', appVersion: 'web',
        enc: false, payload: { state, version }, ...(apiKeysEnc ? { apiKeysEnc } : {}),
    };
}

describe('DriveStateSource — lecture', () => {
    it('clair (enc:false) → renvoie l\'AppState nu (payload.state)', async () => {
        const state = { transactions: [{ id: 't1' }], config: { users: [{ name: 'Marc' }] } };
        const src = new DriveStateSource(token, makeFetch({ fileExists: true, envelope: clearEnvelope(state) }));
        expect(JSON.parse(await src.loadRaw())).toEqual(state);
    });

    it('alimente le loader existant → AppState valide normalisé', async () => {
        const state = { transactions: [], config: { users: [{ name: 'Marc', grossSalary: 5000, netSalary: 4000 }] } };
        const src = new DriveStateSource(token, makeFetch({ fileExists: true, envelope: clearEnvelope(state) }));
        const app = await loadAppStateFromSource(src);
        expect(app.config.users[0].name).toBe('Marc');
        expect(app.fxRates.CAD).toBe(1); // défaut rempli par normalize
    });

    it('aucun blob → erreur claire', async () => {
        const src = new DriveStateSource(token, makeFetch({ fileExists: false }));
        await expect(src.loadRaw()).rejects.toThrow(/Aucune sauvegarde/i);
    });

    it('coffre chiffré (enc:true) → erreur « retire la passphrase »', async () => {
        const enc: SyncEnvelope = { schemaVersion: 1, updatedAt: 1, deviceId: 'a', appVersion: 'w', enc: true, payload: null, encPayload: 'FAI1...' };
        const src = new DriveStateSource(token, makeFetch({ fileExists: true, envelope: enc }));
        await expect(src.loadRaw()).rejects.toThrow(/passphrase/i);
    });
});

describe('DriveStateSource — écriture', () => {
    it('réécrit une enveloppe enc:false en CONSERVANT version persist + apiKeysEnc, et SANS les clés API', async () => {
        const captured: SyncEnvelope[] = [];
        const existing = clearEnvelope({ old: true }, 9, 'KEYS-ENC-BLOB');
        const src = new DriveStateSource(token, makeFetch({ fileExists: true, envelope: existing, onWrite: (e) => captured.push(e) }));

        const next = buildDefaultAppState();
        next.apiKeys = { anthropic: 'sk-secret', finnhub: 'fh-secret' };
        next.config.users[0] = { ...next.config.users[0], name: 'Marc', grossSalary: 5833 };

        const res = await src.saveState(next);
        expect(res.backupPath).toBeNull();
        expect(captured).toHaveLength(1);
        const env = captured[0];
        expect(env.enc).toBe(false);
        const persist = env.payload as { state: Record<string, unknown>; version: number };
        expect(persist.version).toBe(9); // version persist existante préservée
        expect(persist.state).not.toHaveProperty('apiKeys'); // clés API jamais écrites dans payload.state
        expect((persist.state.config as { users: { name: string }[] }).users[0].name).toBe('Marc');
        expect(env.apiKeysEnc).toBe('KEYS-ENC-BLOB'); // clés chiffrées de l'app préservées
    });

    it('coffre chiffré existant → refuse d\'écrire (erreur claire)', async () => {
        const enc: SyncEnvelope = { schemaVersion: 1, updatedAt: 1, deviceId: 'a', appVersion: 'w', enc: true, payload: null, encPayload: 'FAI1' };
        const src = new DriveStateSource(token, makeFetch({ fileExists: true, envelope: enc }));
        await expect(src.saveState(buildDefaultAppState())).rejects.toThrow(/passphrase/i);
    });

    it('le token provider est appelé (jeton requis pour Drive)', async () => {
        const getToken = vi.fn(async () => 'tok-xyz');
        const src = new DriveStateSource(getToken, makeFetch({ fileExists: true, envelope: clearEnvelope({}) }));
        await src.loadRaw();
        expect(getToken).toHaveBeenCalled();
    });
});
