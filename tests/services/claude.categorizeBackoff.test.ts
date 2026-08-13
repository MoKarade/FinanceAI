// tests/services/claude.categorizeBackoff.test.ts
//
// [AI-CATEGORIZE-NO-BACKOFF] Un 429 sur un chunk était AVALÉ (catch → transactions rendues
// inchangées) et le chunk suivant repartait AUSSITÔT. Une limite d'API atteinte tôt dans un gros
// import dégradait donc TOUT le reste en « non catégorisé », sans réessai ni signal — et le
// martèlement prolongeait le rate-limit qui venait de se déclencher.
//
// ⚠️ `sleep` est INJECTÉ : ces tests ne dorment jamais. Un test de backoff qui attend vraiment
// devient un test lent que quelqu'un finit par désactiver.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Transaction } from '../../types';

const mocks = vi.hoisted(() => ({
    /** File de comportements : `null` = réponse OK, sinon l'erreur à lever. */
    behaviours: [] as Array<unknown | null>,
    calls: 0,
    logError: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
    default: class {
        messages = {
            create: vi.fn(async () => {
                const b = mocks.behaviours[mocks.calls] ?? null;
                mocks.calls++;
                if (b !== null) throw b;
                return { content: [{ type: 'text', text: '[]' }] };
            }),
        };
    },
}));

vi.mock('../../services/errorLogger', () => ({ logError: mocks.logError }));

import {
    categorizeBatch,
    classifyCategorizeError,
    categorizeBackoffMs,
    retryAfterMsOf,
    CATEGORIZE_BASE_BACKOFF_MS,
    CATEGORIZE_MAX_BACKOFF_MS,
} from '../../services/claude';

const tx = (id: number): Transaction =>
    ({ id, date: '2026-06-05', payee: `MARCHAND ${id}`, amount: -50, category: 'Uncategorized', status: 'processed' } as Transaction);

/** Une erreur du SDK Anthropic : un objet porteur d'un `status` (et parfois de `headers`). */
const apiError = (status: number, headers?: Record<string, string>) =>
    Object.assign(new Error(`HTTP ${status}`), { status, headers });

const waits: number[] = [];
const fakeSleep = (ms: number): Promise<void> => { waits.push(ms); return Promise.resolve(); };

beforeEach(() => {
    mocks.behaviours = [];
    mocks.calls = 0;
    mocks.logError.mockClear();
    waits.length = 0;
});

describe('classifyCategorizeError — ce qu\'on réessaie, ce qu\'on abandonne', () => {
    it('429 / 408 / 5xx / réseau sans statut → rejouable', () => {
        expect(classifyCategorizeError(apiError(429))).toBe('retryable');
        expect(classifyCategorizeError(apiError(408))).toBe('retryable');
        expect(classifyCategorizeError(apiError(500))).toBe('retryable');
        expect(classifyCategorizeError(apiError(503))).toBe('retryable');
        // Une panne réseau ou un timeout ne porte AUCUN statut : transitoire par nature.
        expect(classifyCategorizeError(new Error('fetch failed'))).toBe('retryable');
    });

    it('401 / 403 → `auth` : la clé ne redeviendra pas valide au chunk suivant', () => {
        expect(classifyCategorizeError(apiError(401))).toBe('auth');
        expect(classifyCategorizeError(apiError(403))).toBe('auth');
    });

    it('4xx de requête → `fatal` : rejouer le même prompt redonnerait la même erreur', () => {
        expect(classifyCategorizeError(apiError(400))).toBe('fatal');
        expect(classifyCategorizeError(apiError(413))).toBe('fatal');
        expect(classifyCategorizeError(apiError(422))).toBe('fatal');
    });
});

describe('categorizeBackoffMs — le serveur a le dernier mot, mais jamais sans borne', () => {
    it('sans `Retry-After` : backoff exponentiel depuis la base', () => {
        expect(categorizeBackoffMs(1, apiError(429))).toBe(CATEGORIZE_BASE_BACKOFF_MS);
        expect(categorizeBackoffMs(2, apiError(429))).toBe(CATEGORIZE_BASE_BACKOFF_MS * 2);
        expect(categorizeBackoffMs(3, apiError(429))).toBe(CATEGORIZE_BASE_BACKOFF_MS * 4);
    });

    it('`Retry-After` en secondes PRIME sur notre estimation', () => {
        expect(categorizeBackoffMs(1, apiError(429, { 'retry-after': '7' }))).toBe(7_000);
        // …y compris quand il demande d'attendre MOINS que notre backoff : c'est lui qui sait.
        expect(categorizeBackoffMs(3, apiError(429, { 'retry-after': '1' }))).toBe(1_000);
    });

    it('`Retry-After` déraisonnable reste BORNÉ — un import ne se gèle pas une journée', () => {
        expect(categorizeBackoffMs(1, apiError(429, { 'retry-after': '86400' })))
            .toBe(CATEGORIZE_MAX_BACKOFF_MS);
    });

    it('lit les deux formes de `headers` (objet `Headers` du SDK ou plain object)', () => {
        const viaHeaders = { status: 429, headers: new Headers({ 'retry-after': '5' }) };
        expect(retryAfterMsOf(viaHeaders)).toBe(5_000);
        expect(retryAfterMsOf(apiError(429, { 'Retry-After': '5' }))).toBe(5_000);
    });

    it('`Retry-After` en DATE HTTP est honoré ; une date passée est ignorée', () => {
        const now = Date.parse('2026-08-13T12:00:00Z');
        const futur = apiError(429, { 'retry-after': 'Thu, 13 Aug 2026 12:00:30 GMT' });
        expect(retryAfterMsOf(futur, now)).toBe(30_000);
        const passe = apiError(429, { 'retry-after': 'Thu, 13 Aug 2026 11:59:00 GMT' });
        expect(retryAfterMsOf(passe, now), 'une date passée doit rendre la main au backoff').toBeUndefined();
    });

    it('en-tête absent, vide ou illisible → `undefined` (jamais 0, qui vaudrait « réessaie tout de suite »)', () => {
        expect(retryAfterMsOf(apiError(429))).toBeUndefined();
        expect(retryAfterMsOf(apiError(429, { 'retry-after': '' }))).toBeUndefined();
        expect(retryAfterMsOf(apiError(429, { 'retry-after': 'bientôt' }))).toBeUndefined();
        expect(retryAfterMsOf(apiError(429, { 'retry-after': '-5' }))).toBeUndefined();
    });
});

describe('categorizeBatch — le comportement de bout en bout', () => {
    // ── LE test discriminant : il ÉCHOUE sans la boucle de réessai. ──
    it('un 429 transitoire est RATTRAPÉ : le chunk finit catégorisé, pas abandonné', async () => {
        mocks.behaviours = [apiError(429), apiError(429), null];   // 2 échecs puis succès
        const out = await categorizeBatch([tx(1)], 'fake-key', [], ['Autre'], undefined, {
            sleep: fakeSleep, chunkPacingMs: 0,
        });
        expect(mocks.calls, 'aucun réessai — le chunk a été abandonné au 1er 429').toBe(3);
        expect(out).toHaveLength(1);
        // Backoff exponentiel effectivement appliqué entre les tentatives.
        expect(waits).toEqual([CATEGORIZE_BASE_BACKOFF_MS, CATEGORIZE_BASE_BACKOFF_MS * 2]);
    });

    it('essais ÉPUISÉS : les transactions reviennent inchangées, et c\'est TRACÉ', async () => {
        mocks.behaviours = [apiError(429), apiError(429), apiError(429), apiError(429)];
        const out = await categorizeBatch([tx(1)], 'fake-key', [], ['Autre'], undefined, {
            sleep: fakeSleep, chunkPacingMs: 0,
        });
        expect(mocks.calls).toBe(4);
        expect(out[0].category, 'une catégorie a été inventée sur un chunk en échec').toBe('Uncategorized');
        const messages = mocks.logError.mock.calls.map((c) => String(c[0]?.message));
        expect(messages.some((m) => /chunk\(s\) en échec/.test(m)), 'échec silencieux').toBe(true);
        // L'erreur BRUTE remonte : c'est elle qui porte le 429.
        const echec = mocks.logError.mock.calls.find((c) => /chunk\(s\) en échec/.test(String(c[0]?.message)));
        expect((echec?.[0] as { error?: { status?: number } })?.error?.status).toBe(429);
    });

    it('une 401 COUPE le batch au lieu d\'enchaîner N appels voués à l\'échec', async () => {
        // 3 chunks de 50 → sans court-circuit, l'ancien code aurait appelé 3 fois (voire 12 avec
        // les réessais). Une clé refusée ne redevient pas valide entre deux chunks.
        const many = Array.from({ length: 120 }, (_, i) => tx(i + 1));
        mocks.behaviours = [apiError(401)];
        const out = await categorizeBatch(many, 'fake-key', [], ['Autre'], undefined, {
            sleep: fakeSleep, chunkPacingMs: 0,
        });
        expect(mocks.calls, 'la clé refusée a quand même été retentée').toBe(1);
        expect(out).toHaveLength(120);
        const messages = mocks.logError.mock.calls.map((c) => String(c[0]?.message));
        expect(messages.some((m) => /clé API refusée/.test(m))).toBe(true);
    });

    it('une 400 abandonne CE chunk mais laisse passer les suivants', async () => {
        // Rejouer le même prompt redonnerait la même 400 ; en revanche le chunk suivant, lui, a
        // toutes ses chances — un défaut de requête n'est pas un défaut de compte.
        const many = Array.from({ length: 100 }, (_, i) => tx(i + 1));
        mocks.behaviours = [apiError(400), null];
        const out = await categorizeBatch(many, 'fake-key', [], ['Autre'], undefined, {
            sleep: fakeSleep, chunkPacingMs: 0,
        });
        expect(mocks.calls, 'la 400 a été réessayée, ou le 2e chunk a été sauté').toBe(2);
        expect(out).toHaveLength(100);
    });

    it('pacing entre chunks : appliqué ENTRE les appels, jamais avant le premier', async () => {
        const many = Array.from({ length: 100 }, (_, i) => tx(i + 1));   // 2 chunks
        mocks.behaviours = [null, null];
        await categorizeBatch(many, 'fake-key', [], ['Autre'], undefined, {
            sleep: fakeSleep, chunkPacingMs: 1_000,
        });
        expect(waits, 'une pause a été posée avant le 1er appel, ou après le dernier').toEqual([1_000]);
    });

    it('le progrès annonce l\'attente : un import qui patiente ne doit pas paraître figé', async () => {
        mocks.behaviours = [apiError(429, { 'retry-after': '3' }), null];
        const messages: string[] = [];
        await categorizeBatch([tx(1)], 'fake-key', [], ['Autre'],
            (_c, _t, msg) => { messages.push(msg); },
            { sleep: fakeSleep, chunkPacingMs: 0 },
        );
        expect(messages.some((m) => /Limite d'API atteinte.*3 s/.test(m)), 'attente silencieuse').toBe(true);
    });
});
