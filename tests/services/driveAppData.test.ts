import { describe, it, expect, vi } from 'vitest';
import {
    findSyncFile,
    createSyncFile,
    readSyncFile,
    updateSyncFile,
    deleteSyncFile,
    fetchUserEmail,
    DriveAuthError,
    DriveError,
    SYNC_FILE_NAME,
    type FetchLike,
} from '../../services/googleDrive/driveAppData';
import { SYNC_SCHEMA_VERSION, type SyncEnvelope } from '../../services/sync/syncTypes';

const env: SyncEnvelope = {
    schemaVersion: SYNC_SCHEMA_VERSION,
    updatedAt: 1234,
    deviceId: 'dev-1',
    appVersion: '1.0.0',
    enc: false,
    payload: { transactions: [{ id: 't1' }] },
};

/** Réponse fetch factice. */
function res(body: unknown, init: { ok?: boolean; status?: number } = {}): Response {
    const ok = init.ok ?? true;
    return {
        ok,
        status: init.status ?? (ok ? 200 : 500),
        json: async () => body,
        text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    } as Response;
}

describe('driveAppData — findSyncFile', () => {
    it('retourne la réf si le fichier existe', async () => {
        const f: FetchLike = vi.fn(async () =>
            res({ files: [{ id: 'file-1', modifiedTime: '2026-01-01T00:00:00Z' }] }),
        );
        const ref = await findSyncFile('tok', f);
        expect(ref).toEqual({ id: 'file-1', modifiedTime: '2026-01-01T00:00:00Z' });
    });

    it('retourne null si aucun fichier', async () => {
        const f: FetchLike = vi.fn(async () => res({ files: [] }));
        expect(await findSyncFile('tok', f)).toBeNull();
    });

    it('cherche bien dans appDataFolder avec le bon nom + Bearer', async () => {
        const f = vi.fn<FetchLike>(async () => res({ files: [] }));
        await findSyncFile('mon-token', f);
        const [url, init] = f.mock.calls[0];
        expect(url).toContain('spaces=appDataFolder');
        expect(decodeURIComponent(url as string)).toContain(`name='${SYNC_FILE_NAME}'`);
        expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer mon-token' });
    });

    it('401 → DriveAuthError', async () => {
        const f: FetchLike = vi.fn(async () => res('unauthorized', { ok: false, status: 401 }));
        await expect(findSyncFile('tok', f)).rejects.toBeInstanceOf(DriveAuthError);
    });

    it('403 → DriveError clair (config), PAS DriveAuthError, avec le détail Google', async () => {
        const body = 'Google Drive API has not been used in project ... or it is disabled';
        const f: FetchLike = vi.fn(async () => res(body, { ok: false, status: 403 }));
        const err = await findSyncFile('tok', f).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(DriveError);
        expect(err).not.toBeInstanceOf(DriveAuthError);
        expect((err as DriveError).status).toBe(403);
        expect((err as Error).message).toContain('403');
        expect((err as Error).message).toContain('disabled'); // détail Google propagé
    });

    it('500 → DriveError avec status', async () => {
        const f: FetchLike = vi.fn(async () => res('boom', { ok: false, status: 500 }));
        await expect(findSyncFile('tok', f)).rejects.toBeInstanceOf(DriveError);
    });
});

describe('driveAppData — createSyncFile', () => {
    it('POST multipart, retourne l id créé', async () => {
        const f = vi.fn<FetchLike>(async () => res({ id: 'new-file' }));
        const id = await createSyncFile('tok', env, f);
        expect(id).toBe('new-file');
        const [url, init] = f.mock.calls[0];
        expect(url).toContain('uploadType=multipart');
        expect((init as RequestInit).method).toBe('POST');
        const body = (init as RequestInit).body as string;
        expect(body).toContain(SYNC_FILE_NAME);
        expect(body).toContain('appDataFolder');
        expect(body).toContain('"deviceId":"dev-1"'); // l'enveloppe est bien dans le corps
    });

    it('création sans id retourné → DriveError', async () => {
        const f: FetchLike = vi.fn(async () => res({}));
        await expect(createSyncFile('tok', env, f)).rejects.toBeInstanceOf(DriveError);
    });
});

describe('driveAppData — readSyncFile', () => {
    it('lit et parse l enveloppe', async () => {
        const f: FetchLike = vi.fn(async () => res(env));
        const got = await readSyncFile('tok', 'file-1', f);
        expect(got).toEqual(env);
    });

    it('utilise alt=media', async () => {
        const f = vi.fn<FetchLike>(async () => res(env));
        await readSyncFile('tok', 'file-9', f);
        expect(f.mock.calls[0][0]).toContain('file-9?alt=media');
    });
});

describe('driveAppData — updateSyncFile', () => {
    it('PATCH media avec l enveloppe en corps', async () => {
        const f = vi.fn<FetchLike>(async () => res({}));
        await updateSyncFile('tok', 'file-1', env, f);
        const [url, init] = f.mock.calls[0];
        expect(url).toContain('uploadType=media');
        expect((init as RequestInit).method).toBe('PATCH');
        expect((init as RequestInit).body).toBe(JSON.stringify(env));
    });

    it('401 → DriveAuthError', async () => {
        const f: FetchLike = vi.fn(async () => res('no', { ok: false, status: 401 }));
        await expect(updateSyncFile('tok', 'f', env, f)).rejects.toBeInstanceOf(DriveAuthError);
    });
});

describe('driveAppData — deleteSyncFile', () => {
    it('DELETE sur le bon fichier (204 = succès)', async () => {
        const f = vi.fn<FetchLike>(async () => res(null, { ok: true, status: 204 }));
        await expect(deleteSyncFile('tok', 'file-1', f)).resolves.toBeUndefined();
        const [url, init] = f.mock.calls[0];
        expect(url).toContain('/files/file-1');
        expect((init as RequestInit).method).toBe('DELETE');
    });

    it('404 toléré (fichier déjà absent → idempotent, pas d erreur)', async () => {
        const f: FetchLike = vi.fn(async () => res('not found', { ok: false, status: 404 }));
        await expect(deleteSyncFile('tok', 'file-x', f)).resolves.toBeUndefined();
    });

    it('401 → DriveAuthError', async () => {
        const f: FetchLike = vi.fn(async () => res('no', { ok: false, status: 401 }));
        await expect(deleteSyncFile('tok', 'file-1', f)).rejects.toBeInstanceOf(DriveAuthError);
    });
});

describe('driveAppData — fetchUserEmail', () => {
    it('retourne l email', async () => {
        const f: FetchLike = vi.fn(async () => res({ email: 'marc@example.com' }));
        expect(await fetchUserEmail('tok', f)).toBe('marc@example.com');
    });

    it('non-ok → null (best effort, ne casse pas le sync)', async () => {
        const f: FetchLike = vi.fn(async () => res('no', { ok: false, status: 403 }));
        expect(await fetchUserEmail('tok', f)).toBeNull();
    });

    it('exception réseau → null', async () => {
        const f: FetchLike = vi.fn(async () => {
            throw new Error('network down');
        });
        expect(await fetchUserEmail('tok', f)).toBeNull();
    });
});
