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
import { makeStateStore } from '../../mcp/state/stateStore';

const resp = (data: unknown, ok = true, status = 200): Response =>
    ({ ok, status, json: async () => data } as unknown as Response);

/** fetch mocké routant par URL/méthode comme l'API Drive ; capture l'enveloppe écrite ET les
 *  fichiers créés (multipart : sync OU backup .bak.json), sert la liste des backups, trace les DELETE. */
function makeFetch(opts: {
    fileExists?: boolean;
    envelope?: SyncEnvelope | null;
    onWrite?: (env: SyncEnvelope) => void;
    /** Fichiers créés via multipart, capturés { name, content }. */
    created?: Array<{ name: string; content: unknown }>;
    /** Backups pré-existants servis à listAppDataFiles (pruning). */
    backupList?: Array<{ id: string; name: string; modifiedTime: string }>;
    /** Ids supprimés (DELETE). */
    deleted?: string[];
}): FetchLike {
    return async (url, init) => {
        const method = (init?.method || 'GET').toUpperCase();
        if (method === 'GET' && url.includes('alt=media')) return resp(opts.envelope ?? null); // readSyncFile
        if (method === 'POST' && url.includes('uploadType=multipart')) {                       // createAppDataFile
            const body = String(init?.body ?? '');
            const metaMatch = body.match(/\{"name":"([^"]+)"/);
            const parts = body.split('\r\n\r\n');
            let content: unknown = null;
            try { content = JSON.parse((parts[2] ?? '').split('\r\n')[0]); } catch { /* méta seulement */ }
            opts.created?.push({ name: metaMatch?.[1] ?? '?', content });
            return resp({ id: `file-created-${opts.created?.length ?? 0}` });
        }
        if (method === 'PATCH' && url.includes('uploadType=media')) {                          // updateSyncFile
            opts.onWrite?.(JSON.parse(init?.body as string) as SyncEnvelope);
            return resp({});
        }
        if (method === 'DELETE') {                                                             // pruning
            const id = url.split('/').pop()?.split('?')[0] ?? '?';
            opts.deleted?.push(id);
            return { ok: true, status: 204, json: async () => ({}) } as unknown as Response;
        }
        if (url.includes('spaces=appDataFolder') && url.includes('contains')) {                // listAppDataFiles
            return resp({ files: opts.backupList ?? [] });
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
        const created: Array<{ name: string; content: unknown }> = [];
        const existing = clearEnvelope({ old: true }, 9, 'KEYS-ENC-BLOB');
        const src = new DriveStateSource(token, makeFetch({ fileExists: true, envelope: existing, onWrite: (e) => captured.push(e), created }));

        const next = buildDefaultAppState();
        next.apiKeys = { anthropic: 'sk-secret', finnhub: 'fh-secret' };
        next.config.users[0] = { ...next.config.users[0], name: 'Marc', grossSalary: 5833 };

        const res = await src.saveState(next);
        // [MCP-PAYSLIP-BACKUP] : la sauvegarde Drive horodatée est désormais RÉELLE (spec tenue).
        expect(res.backupPath).toMatch(/^appDataFolder\/financeai-sync\..+\.bak\.json$/);
        expect(captured).toHaveLength(1);
        const env = captured[0];
        expect(env.enc).toBe(false);
        const persist = env.payload as { state: Record<string, unknown>; version: number };
        expect(persist.version).toBe(9); // version persist existante préservée
        expect(persist.state).not.toHaveProperty('apiKeys'); // clés API jamais écrites dans payload.state
        expect((persist.state.config as { users: { name: string }[] }).users[0].name).toBe('Marc');
        expect(env.apiKeysEnc).toBe('KEYS-ENC-BLOB'); // clés chiffrées de l'app préservées
    });

    it("[MCP-PAYSLIP-BACKUP] sauvegarde l'ANCIEN blob dans un .bak.json AVANT d'écraser (contenu intégral)", async () => {
        const captured: SyncEnvelope[] = [];
        const created: Array<{ name: string; content: unknown }> = [];
        const existing = clearEnvelope({ marker: 'OLD', salaire: 9975 }, 7, 'KEYS');
        const src = new DriveStateSource(token, makeFetch({ fileExists: true, envelope: existing, onWrite: (e) => captured.push(e), created }));

        await src.saveState(buildDefaultAppState());

        // 1 fichier créé = le backup (l'écrasement du sync passe par PATCH, pas par création).
        expect(created).toHaveLength(1);
        expect(created[0].name).toMatch(/^financeai-sync\..+\.bak\.json$/);
        // Le backup contient l'ANCIENNE enveloppe intégrale (rollback possible), et le PATCH la nouvelle.
        const backedUp = created[0].content as SyncEnvelope;
        expect((backedUp.payload as { state: { marker: string } }).state.marker).toBe('OLD');
        expect(JSON.stringify(captured[0])).not.toContain('OLD'); // le blob vivant, lui, est bien remplacé
    });

    it('1er write (aucun blob) → création directe, pas de backup, backupPath null', async () => {
        const created: Array<{ name: string; content: unknown }> = [];
        const src = new DriveStateSource(token, makeFetch({ fileExists: false, created }));
        const res = await src.saveState(buildDefaultAppState());
        expect(res.backupPath).toBeNull();
        expect(created).toHaveLength(1); // seule création : le fichier de sync lui-même
        expect(created[0].name).toBe('financeai-sync.json');
    });

    it('[MCP-PAYSLIP-BACKUP] garde de CONCURRENCE : le blob a avancé depuis la lecture → refuse d\'écraser', async () => {
        const captured: SyncEnvelope[] = [];
        const created: Array<{ name: string; content: unknown }> = [];
        // Lecture initiale : blob updatedAt=1000. Puis l'app pousse (updatedAt=2000) avant notre save.
        const stale = clearEnvelope({ v: 'lu-par-mcp' });            // updatedAt: 1000
        const advanced = { ...clearEnvelope({ v: 'pousse-par-app' }), updatedAt: 2000 };
        let current = stale;
        const fetchFn = makeFetch({ fileExists: true, envelope: stale, onWrite: (e) => captured.push(e), created });
        const routed: typeof fetchFn = async (url, init) => {
            if ((init?.method || 'GET').toUpperCase() === 'GET' && url.includes('alt=media')) {
                return { ok: true, status: 200, json: async () => current } as unknown as Response;
            }
            return fetchFn(url, init);
        };
        const src = new DriveStateSource(token, routed);

        await src.loadRaw();          // le connecteur lit (voit updatedAt=1000)
        current = advanced;           // l'app pousse entre-temps (updatedAt=2000)

        await expect(src.saveState(buildDefaultAppState())).rejects.toThrow(/Conflit.*modifiée depuis/i);
        expect(captured).toHaveLength(0); // RIEN écrasé
        expect(created).toHaveLength(0);  // pas même de backup (write refusé net)
    });

    it('[MCP-PAYSLIP-BACKUP] FAIL-CLOSED : le backup échoue → RIEN n\'est écrasé (write refusé net)', async () => {
        // La promesse « sauvegarde AVANT écriture » ne doit jamais être rompue : si le POST du backup
        // échoue (quota/5xx), l'écrasement du blob vivant NE DOIT PAS partir.
        const captured: SyncEnvelope[] = [];
        const base = makeFetch({ fileExists: true, envelope: clearEnvelope({ marker: 'OLD' }), onWrite: (e) => captured.push(e) });
        const failingBackup: FetchLike = async (url, init) => {
            const method = (init?.method || 'GET').toUpperCase();
            if (method === 'POST' && url.includes('uploadType=multipart')) {
                return { ok: false, status: 500, json: async () => ({}), text: async () => 'quota' } as unknown as Response;
            }
            return base(url, init);
        };
        const src = new DriveStateSource(token, failingBackup);
        await expect(src.saveState(buildDefaultAppState())).rejects.toThrow();
        expect(captured).toHaveLength(0); // AUCUN PATCH : le blob vivant est intact
    });

    it('pruning rolling : au-delà de 5 backups listés, les plus VIEUX sont supprimés', async () => {
        const deleted: string[] = [];
        const created: Array<{ name: string; content: unknown }> = [];
        // Le mock liste 6 backups pré-existants (le backup TOUT JUSTE créé par ce save n'est pas
        // re-listé par ce mock) → 6 − 5 gardés = le plus vieux (bk-0) supprimé. En prod, le backup
        // frais (horodaté à la ms) est toujours le plus récent du tri → jamais élagué en premier.
        // Nom réel des backups : `financeai-sync.json.<ISO>.bak.json` (SYNC_FILE_NAME + ISO + suffixe).
        const backupList = Array.from({ length: 6 }, (_, i) => ({
            id: `bk-${i}`,
            name: `financeai-sync.json.2026-07-0${i + 1}T00-00-00-000Z.bak.json`,
            modifiedTime: '2026',
        }));
        const src = new DriveStateSource(token, makeFetch({
            fileExists: true, envelope: clearEnvelope({}), created, backupList, deleted,
        }));
        await src.saveState(buildDefaultAppState());
        expect(deleted).toEqual(['bk-0']); // 6 listés − 5 gardés = le plus vieux supprimé
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

describe('DriveStateSource — [MCP-WRITE-VERSION-TOKEN] OCC per-call (jeton de version)', () => {
    /** fetch dont le blob GET « persiste » : chaque PATCH devient le nouveau `current` (updatedAt avance). */
    function makeAdvancingFetch(captured: SyncEnvelope[], created: Array<{ name: string; content: unknown }>): FetchLike {
        let current: SyncEnvelope = clearEnvelope({ v: 'v1000' }); // updatedAt 1000
        const base = makeFetch({
            fileExists: true, envelope: current, created,
            onWrite: (e) => { captured.push(e); current = e; }, // le blob avance à la version écrite
        });
        return async (url, init) => {
            if ((init?.method || 'GET').toUpperCase() === 'GET' && url.includes('alt=media')) {
                return { ok: true, status: 200, json: async () => current } as unknown as Response;
            }
            return base(url, init);
        };
    }

    it('loadRawVersioned renvoie le raw ET la version (updatedAt du blob)', async () => {
        const src = new DriveStateSource(token, makeFetch({ fileExists: true, envelope: clearEnvelope({ transactions: [{ id: 't1' }] }) }));
        const { raw, version } = await src.loadRawVersioned();
        expect(version).toBe(1_000);
        expect(JSON.parse(raw)).toMatchObject({ transactions: [{ id: 't1' }] });
    });

    it('save avec le BON jeton → écrit (aucun faux conflit)', async () => {
        const captured: SyncEnvelope[] = [];
        const src = new DriveStateSource(token, makeAdvancingFetch(captured, []));
        const { version } = await src.loadRawVersioned(); // 1000
        const res = await src.saveState(buildDefaultAppState(), version);
        expect(captured).toHaveLength(1);           // écrit
        expect(typeof res.version).toBe('number');  // nouveau jeton retourné
        expect(res.version).not.toBe(1_000);        // la version a avancé
    });

    // DISCRIMINANT : 2 tool-calls partis du MÊME jeton (1000). A écrit → le blob ET lastSeenUpdatedAt
    // avancent à la version de A. B (jeton périmé 1000) : la garde PROCESS-WIDE comparerait
    // existing.updatedAt == lastSeenUpdatedAt (tous deux = version de A) → PAS de conflit → B CLOBBERAIT.
    // L'OCC compare expectedVersion(1000) != existing → REFUSE. C'est exactement le trou que le jeton ferme.
    it('2ᵉ save avec jeton PÉRIMÉ refusé là où la garde process-wide clobbererait', async () => {
        const captured: SyncEnvelope[] = [];
        const src = new DriveStateSource(token, makeAdvancingFetch(captured, []));
        const { version } = await src.loadRawVersioned(); // 1000 — jeton partagé par A et B

        await src.saveState(buildDefaultAppState(), version); // A : OK, blob avance, lastSeen = versionA
        expect(captured).toHaveLength(1);

        // B : MÊME jeton périmé → conflit (l'OCC), alors que la garde process-wide passerait.
        await expect(src.saveState(buildDefaultAppState(), version)).rejects.toThrow(/Conflit/i);
        expect(captured).toHaveLength(1); // B n'a RIEN écrit
    });

    it('store.getWithVersion() → jeton propagé au save (bout en bout)', async () => {
        const captured: SyncEnvelope[] = [];
        const store = makeStateStore(new DriveStateSource(token, makeAdvancingFetch(captured, [])), { ttlMs: 0 });
        const { version } = await store.getWithVersion();
        expect(version).toBe(1_000);
        await store.save(buildDefaultAppState(), version); // bon jeton → écrit
        expect(captured).toHaveLength(1);
    });
});

describe('StateStore — invalidation du cache sur échec de save (rend vrai le « relance le tool »)', () => {
    it('save en conflit → cache invalidé → le get() suivant RELIT la source (pas le cache périmé)', async () => {
        // C'est la moitié STORE de la garde de concurrence : le message d'erreur du conflit promet
        // « Relance le tool : il relira l'état à jour » — vrai SEULEMENT si le cache est purgé.
        let loads = 0;
        const source = {
            description: 'test',
            loadRaw: async () => { loads++; return JSON.stringify(buildDefaultAppState()); },
            saveState: async () => { throw new Error('Conflit : la sauvegarde Drive a été modifiée depuis la lecture'); },
        };
        const store = makeStateStore(source, { ttlMs: 60_000 });

        await store.get();                 // 1re lecture → cache chaud (TTL 60 s)
        await store.get();                 // servie par le cache
        expect(loads).toBe(1);

        await expect(store.save(buildDefaultAppState())).rejects.toThrow(/Conflit/);

        await store.get();                 // APRÈS l'échec : le cache doit avoir été purgé → relecture
        expect(loads).toBe(2);
    });
});
