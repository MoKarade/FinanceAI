// [FINTABLE Lot 1] Client HTTP : enveloppe, pagination par curseur, erreurs typées, 429, timeout.

import { describe, it, expect, vi } from 'vitest';
import { FintableClient } from '../../../services/fintable/client';
import { FintableError } from '../../../services/fintable/types';

const TOKEN = 'ft_pat_SECRET_VALUE_NEVER_LEAK';

function res(status: number, body: unknown, headers: Record<string, string> = {}): Response {
    return {
        status,
        headers: { get: (k: string) => headers[k] ?? headers[k.toLowerCase()] ?? null },
        text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    } as unknown as Response;
}

/** Client de test : pas d'attente réelle entre les re-tentatives. */
function makeClient(fetchImpl: typeof fetch, sleepImpl = vi.fn(async () => {})) {
    const client = new FintableClient({
        token: TOKEN,
        fetchImpl,
        sleepImpl,
        baseUrl: 'https://fintable.io/api/v2',
    });
    return { client, sleepImpl };
}

describe('FintableClient — enveloppe et en-têtes', () => {
    it('déballe {data: …} et envoie le jeton en Bearer', async () => {
        const fetchImpl = vi.fn(async () => res(200, { data: [{ id: 'acc_1' }] }));
        const { client } = makeClient(fetchImpl as unknown as typeof fetch);

        const out = await client.get<Array<{ id: string }>>('/accounts');

        expect(out.data).toEqual([{ id: 'acc_1' }]);
        const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe('https://fintable.io/api/v2/accounts');
        expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
        expect((init.headers as Record<string, string>).Accept).toBe('application/json');
    });

    it('ne met JAMAIS le jeton dans l\'URL (les URL finissent dans les logs Cloud Run)', async () => {
        const fetchImpl = vi.fn(async () => res(200, { data: [] }));
        const { client } = makeClient(fetchImpl as unknown as typeof fetch);
        await client.get('/accounts', { limit: 500 });
        const [url] = fetchImpl.mock.calls[0] as unknown as [string];
        expect(url).not.toContain(TOKEN);
        expect(url).toContain('limit=500');
    });

    it('remonte `snapshot_date` de l\'enveloppe (il n\'est pas dans `data`)', async () => {
        const fetchImpl = vi.fn(async () => res(200, { data: [], snapshot_date: '2026-07-26' }));
        const { client } = makeClient(fetchImpl as unknown as typeof fetch);
        expect((await client.get('/accounts/acc_1/holdings')).snapshotDate).toBe('2026-07-26');
    });

    it('REFUSE une 2xx sans champ « data » (contrat rompu, pas un vide légitime)', async () => {
        const fetchImpl = vi.fn(async () => res(200, { oups: true }));
        const { client } = makeClient(fetchImpl as unknown as typeof fetch);
        await expect(client.get('/accounts')).rejects.toMatchObject({ code: 'MALFORMED' });
    });
});

describe('FintableClient — erreurs typées', () => {
    it('401 → AUTH, NON transitoire, et AUCUNE re-tentative', async () => {
        const fetchImpl = vi.fn(async () =>
            res(401, { error: { type: 'unauthenticated', message: 'Missing token.' } }));
        const { client } = makeClient(fetchImpl as unknown as typeof fetch);

        const err = await client.get('/accounts').catch((e: unknown) => e);
        expect(err).toBeInstanceOf(FintableError);
        expect((err as FintableError).code).toBe('AUTH');
        expect((err as FintableError).isTransient).toBe(false);
        // Insister sur un jeton révoqué ne ferait que brûler du quota.
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('403 → FORBIDDEN, 404 → NOT_FOUND, 422 → VALIDATION (aucun retry)', async () => {
        for (const [status, code] of [[403, 'FORBIDDEN'], [404, 'NOT_FOUND'], [422, 'VALIDATION']] as const) {
            const fetchImpl = vi.fn(async () => res(status, { error: { type: 'x', message: 'y' } }));
            const { client } = makeClient(fetchImpl as unknown as typeof fetch);
            await expect(client.get('/accounts')).rejects.toMatchObject({ code });
            expect(fetchImpl).toHaveBeenCalledTimes(1);
        }
    });

    it('le message d\'erreur ne CONTIENT JAMAIS le jeton', async () => {
        const fetchImpl = vi.fn(async () =>
            res(401, { error: { type: 'unauthenticated', message: 'Missing, expired, or revoked token.' } }));
        const { client } = makeClient(fetchImpl as unknown as typeof fetch);
        const err = await client.get('/accounts').catch((e: unknown) => e) as FintableError;
        expect(err.message).not.toContain(TOKEN);
        // …tout en restant diagnosticable.
        expect(err.message).toContain('401');
        expect(err.message).toContain('unauthenticated');
    });

    it('un corps non-JSON sur une erreur ne fait pas planter le parsing', async () => {
        const fetchImpl = vi.fn(async () => res(503, '<html>maintenance</html>'));
        const { client } = makeClient(fetchImpl as unknown as typeof fetch);
        // 503 est transitoire → re-tenté puis rejeté proprement, jamais un SyntaxError brut.
        await expect(client.get('/accounts')).rejects.toMatchObject({ code: 'SERVER' });
    });
});

describe('FintableClient — 429 et transitoires', () => {
    it('429 → RATE_LIMIT re-tenté en honorant Retry-After, puis succès', async () => {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(res(429, { error: { type: 'rate_limited', message: 'Slow down' } }, { 'Retry-After': '2' }))
            .mockResolvedValueOnce(res(200, { data: [{ id: 'acc_1' }] }));
        const sleepImpl = vi.fn(async () => {});
        const { client } = makeClient(fetchImpl as unknown as typeof fetch, sleepImpl);

        const out = await client.get<Array<{ id: string }>>('/accounts');

        expect(out.data).toEqual([{ id: 'acc_1' }]);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        // Retry-After: 2 secondes → 2000 ms, pas le back-off générique.
        expect(sleepImpl).toHaveBeenCalledWith(2000);
    });

    it('5xx re-tenté puis succès', async () => {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(res(500, { error: { type: 'server_error', message: 'boom' } }))
            .mockResolvedValueOnce(res(200, { data: 'ok' }));
        const { client } = makeClient(fetchImpl as unknown as typeof fetch);
        expect((await client.get('/me')).data).toBe('ok');
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('un échec réseau est classé NETWORK (transitoire), pas MALFORMED', async () => {
        const fetchImpl = vi.fn(async () => { throw new TypeError('fetch failed'); });
        const { client } = makeClient(fetchImpl as unknown as typeof fetch);
        const err = await client.get('/accounts').catch((e: unknown) => e) as FintableError;
        expect(err.code).toBe('NETWORK');
        expect(err.isTransient).toBe(true);
    });

    it('les re-tentatives sont BORNÉES (pas de boucle infinie sur un 500 permanent)', async () => {
        const fetchImpl = vi.fn(async () => res(500, { error: { type: 'server_error', message: 'down' } }));
        const { client } = makeClient(fetchImpl as unknown as typeof fetch);
        await expect(client.get('/accounts')).rejects.toMatchObject({ code: 'SERVER' });
        expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(4); // 1 + MAX_RETRIES
    });
});

describe('FintableClient — pagination par curseur', () => {
    it('suit next_cursor jusqu\'à null et concatène dans l\'ordre', async () => {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(res(200, { data: [{ id: 'tx_1' }, { id: 'tx_2' }], next_cursor: 'CUR1' }))
            .mockResolvedValueOnce(res(200, { data: [{ id: 'tx_3' }], next_cursor: null }));
        const { client } = makeClient(fetchImpl as unknown as typeof fetch);

        const all = await client.getAllPages<{ id: string }>('/transactions', { limit: 500 });

        expect(all.map((t) => t.id)).toEqual(['tx_1', 'tx_2', 'tx_3']);
        // Le curseur est renvoyé tel quel à la page suivante.
        const [url2] = fetchImpl.mock.calls[1] as unknown as [string];
        expect(url2).toContain('cursor=CUR1');
    });

    it('un curseur RÉPÉTÉ interrompt la pagination (garde anti-boucle du cron)', async () => {
        // Un serveur qui rendrait toujours le même curseur ferait tourner un cron à l'infini.
        const fetchImpl = vi.fn(async () => res(200, { data: [{ id: 'tx_1' }], next_cursor: 'SAME' }));
        const { client } = makeClient(fetchImpl as unknown as typeof fetch);
        await expect(client.getAllPages('/transactions', {})).rejects.toMatchObject({ code: 'MALFORMED' });
    });

    it('REFUSE une page dont « data » n\'est pas une liste', async () => {
        const fetchImpl = vi.fn(async () => res(200, { data: { nope: true } }));
        const { client } = makeClient(fetchImpl as unknown as typeof fetch);
        await expect(client.getAllPages('/transactions', {})).rejects.toMatchObject({ code: 'MALFORMED' });
    });
});

describe('FintableClient — le timeout couvre la LECTURE DU CORPS', () => {
    it('abandonne un corps qui stalle après des en-têtes reçues (leçon SYNC-FETCH-TIMEOUT)', async () => {
        // Discriminant : un `clearTimeout` posé dès que `fetch()` résout laisserait ce cas pendre
        // à l'infini — les en-têtes arrivent, c'est le STREAM du corps qui ne finit jamais.
        const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => ({
            status: 200,
            headers: { get: () => null },
            text: () => new Promise<string>((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () => { reject(new Error('aborted')); });
            }),
        }) as unknown as Response);

        const client = new FintableClient({
            token: TOKEN,
            fetchImpl: fetchImpl as unknown as typeof fetch,
            sleepImpl: async () => {},
            timeoutMs: 40,
        });

        const err = await client.get('/transactions').catch((e: unknown) => e) as FintableError;
        expect(err).toBeInstanceOf(FintableError);
        expect(err.code).toBe('NETWORK');
    }, 10_000);
});
