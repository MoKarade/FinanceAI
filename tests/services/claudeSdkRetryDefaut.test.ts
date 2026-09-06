// tests/services/claudeSdkRetryDefaut.test.ts
//
// [VISION-NO-RETRY] (lot 209, 2026-09-06) — le ticket affirmait qu'`analyzePayslip`, `analyzeBankStatement`
// et les quatre autres one-shots « n'ont aucun backoff sur 429/5xx » et qu'« un 429 transitoire sur un
// upload de relevé force un re-upload manuel complet ». MESURÉ sur le VRAI SDK (`@anthropic-ai/sdk`,
// seul `fetch` est simulé) : le client que `makeClient` construit réessaie DE LUI-MÊME — `maxRetries`
// vaut 2 par défaut, sur 408 / 409 / 429 / 5xx et sur une panne de connexion, en honorant `retry-after`
// (backoff 0,5 s → 8 s sinon), et il s'arrête sans réessai sur un signal d'abandon. Le ticket décrivait
// un manque dans NOTRE code que la BIBLIOTHÈQUE comble déjà : il est caduc, et cette garde ancre le FAIT
// (un 429 est réessayé, un 401 ne l'est pas, une exhaustion coûte exactement 1 + 2 appels) pour qu'un
// `maxRetries: 0` posé un jour dans `makeClient` rougisse ici.
//
// ⚠️ Rien n'est simulé sous `fetch` : c'est le contrat d'erreur du VRAI module qu'on mesure
// (`UNE-CAUSE-CLASSEE-PUIS-JETEE-EST-UNE-CAUSE-ABSENTE` — un faux module encode le contrat qu'on CROIT avoir).
// `retry-after: 0` rend le réessai instantané ; la panne de connexion (sans en-tête) passe par le backoff
// par défaut du SDK, donc par de faux timers — ce test ne dort jamais.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { chat, analyzeBankStatement, makeClient } from '../../services/claude';

const ok = (text: string) => new Response(JSON.stringify({
    id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-4-6',
    content: [{ type: 'text', text }], stop_reason: 'end_turn',
    usage: { input_tokens: 1, output_tokens: 1 },
}), { status: 200, headers: { 'content-type': 'application/json' } });

const ko = (status: number, headers: Record<string, string> = {}) => new Response(
    JSON.stringify({ type: 'error', error: { type: 'rate_limit_error', message: `HTTP ${status}` } }),
    { status, headers: { 'content-type': 'application/json', ...headers } },
);

/** File de réponses : une `Response`, ou une `Error` à REJETER (panne de connexion). */
let queue: Array<Response | Error>;
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
    queue = [];
    fetchSpy = vi.fn(async () => {
        const next = queue.shift();
        if (!next) throw new Error('file de réponses vide — le test attendait moins d\'appels');
        if (next instanceof Error) throw next;
        return next;
    });
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubEnv('VITE_CLAUDE_TRANSPORT', '');
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
});

describe('[VISION-NO-RETRY] le SDK réessaie déjà les erreurs transitoires — mesuré sur le vrai client', () => {
    it('le client de makeClient part avec maxRetries = 2 (la valeur par défaut du SDK, jamais forcée à 0)', async () => {
        const client = await makeClient('sk-ant-test');
        expect(client.maxRetries).toBe(2);
        const vision = await makeClient('sk-ant-test', 'vision');
        expect(vision.maxRetries).toBe(2);
    });

    it('chat() : un 429 avec retry-after est réessayé et la réponse suivante est rendue (2 appels réseau)', async () => {
        queue.push(ko(429, { 'retry-after': '0' }), ok('réponse'));
        await expect(chat([{ role: 'user', content: 'salut' }], 'sk-ant-test')).resolves.toBe('réponse');
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('analyzeBankStatement (Vision) : un 503 sur l\'upload du relevé est réessayé — aucun re-upload manuel', async () => {
        queue.push(
            ko(503, { 'retry-after': '0' }),
            ok('[{"date":"2026-06-05","description":"EPICERIE METRO","amount":-42.5}]'),
        );
        const file = new File(['%PDF-1.4 releve'], 'releve.pdf', { type: 'application/pdf' });
        const txns = await analyzeBankStatement(file, 'sk-ant-test');
        expect(txns).toHaveLength(1);
        expect(txns[0].amount).toBe(-42.5);
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('une panne de connexion (fetch rejette) est réessayée après le backoff par défaut du SDK', async () => {
        vi.useFakeTimers();
        queue.push(new TypeError('fetch failed'), ok('après la panne'));
        const pending = chat([{ role: 'user', content: 'salut' }], 'sk-ant-test');
        // Le backoff par défaut (0,5 s × 2^n, jitter compris) est bien sous le timeout de 30 s de `chat`.
        await vi.advanceTimersByTimeAsync(5_000);
        await expect(pending).resolves.toBe('après la panne');
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('épuisement : trois 429 d\'affilée → l\'erreur remonte après EXACTEMENT 1 + maxRetries appels', async () => {
        queue.push(ko(429, { 'retry-after': '0' }), ko(429, { 'retry-after': '0' }), ko(429, { 'retry-after': '0' }));
        await expect(chat([{ role: 'user', content: 'salut' }], 'sk-ant-test')).rejects.toMatchObject({ status: 429 });
        expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it('contrôle : un 401 (clé refusée) et un 400 (requête) ne sont PAS réessayés — un seul appel chacun', async () => {
        queue.push(ko(401));
        await expect(chat([{ role: 'user', content: 'salut' }], 'sk-ant-test')).rejects.toMatchObject({ status: 401 });
        expect(fetchSpy).toHaveBeenCalledTimes(1);

        fetchSpy.mockClear();
        queue.push(ko(400));
        await expect(chat([{ role: 'user', content: 'salut' }], 'sk-ant-test')).rejects.toMatchObject({ status: 400 });
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('contrôle : un signal déjà abandonné (timeout / annulation) ne déclenche AUCUN appel ni réessai', async () => {
        const ctrl = new AbortController();
        ctrl.abort(new Error('annulé par l\'utilisateur'));
        await expect(chat([{ role: 'user', content: 'salut' }], 'sk-ant-test', { signal: ctrl.signal })).rejects.toThrow();
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});
