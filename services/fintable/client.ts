// services/fintable/client.ts
//
// [FINTABLE Lot 1] Client HTTP de l'API Fintable V2 — LECTURE SEULE.
//
// Contrat de l'API (documenté) implémenté ici :
//   - base `https://fintable.io/api/v2`, en-tête `Authorization: Bearer <jeton>`, `Accept: application/json` ;
//   - enveloppe `{data: …}` ; les listes de transactions portent `next_cursor` (opaque, `null` = fin) ;
//   - erreurs `{error: {type, message}}`, une seule forme pour toute l'API ;
//   - 429 avec en-tête `Retry-After` (lecture authentifiée : 300/min par jeton).
//
// ⚠️ Le timeout couvre la LECTURE DU CORPS, pas seulement les en-têtes (leçon SYNC-FETCH-TIMEOUT) :
// `clearTimeout` dès que `await fetch()` résout ne protège que jusqu'aux en-têtes — un `res.json()`
// qui stalle en streaming (typique d'une grosse page de transactions) re-pendrait à l'infini. Le
// corps est donc lu DANS le budget, en partageant le même `AbortSignal`.
//
// ⚠️ Le jeton ne doit apparaître NULLE PART ailleurs que dans l'en-tête : ni dans un message
// d'erreur, ni dans une URL (les URL finissent dans les logs Cloud Run), ni dans un log.

import { FintableError, type FintableErrorCode, type FtErrorBody } from './types';

const FINTABLE_API_BASE = 'https://fintable.io/api/v2';

/** Budget par requête. Généreux : une page de 500 transactions peut être lourde. */
const DEFAULT_TIMEOUT_MS = 30_000;
/** Re-tentatives sur échec TRANSITOIRE uniquement (toutes nos requêtes sont des GET idempotents). */
const MAX_RETRIES = 3;
/** Plafond d'attente sur un `Retry-After` — au-delà, on rend la main au cron plutôt que dormir. */
const MAX_RETRY_WAIT_MS = 60_000;

interface FintableClientOptions {
    token: string;
    baseUrl?: string;
    timeoutMs?: number;
    /** Injectable pour les tests (défaut : `fetch` global). */
    fetchImpl?: typeof fetch;
    /** Injectable pour les tests (défaut : `setTimeout`). Doit résoudre après `ms`. */
    sleepImpl?: (ms: number) => Promise<void>;
}

function statusToCode(status: number): FintableErrorCode {
    if (status === 401) return 'AUTH';
    if (status === 403) return 'FORBIDDEN';
    if (status === 404) return 'NOT_FOUND';
    if (status === 409) return 'CONFLICT';
    if (status === 422) return 'VALIDATION';
    if (status === 429) return 'RATE_LIMIT';
    if (status >= 500) return 'SERVER';
    return 'UNKNOWN';
}

/** `Retry-After` est en SECONDES (entier) ou une date HTTP. On ne gère que la forme secondes. */
function parseRetryAfter(header: string | null): number | undefined {
    if (!header) return undefined;
    const sec = Number(header.trim());
    return Number.isFinite(sec) && sec >= 0 ? sec : undefined;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => { setTimeout(r, ms); });

/**
 * ⚠️ [FINTABLE-BROWSER-RELATIVE-BASE] `new URL(x)` à UN argument exige une URL ABSOLUE : sur une
 * base relative comme `/api/fintable` (le proxy same-origin du chemin navigateur), il lève
 * `TypeError: Invalid URL`. Cette erreur remontait telle quelle jusqu'à l'écran — Marc a collé son
 * jeton et lu « url invalide », un message qui accuse une URL alors qu'il venait de saisir un jeton.
 *
 * On résout donc une base relative contre l'ORIGINE COURANTE (exactement ce que vise le proxy
 * same-origin), et on laisse une base absolue intacte (chemin serveur / Cloud Run, où il n'y a
 * aucune origine). `new URL(absolue, undefined)` ignore le 2ᵉ argument : rien ne change côté cron.
 *
 * Le cas « base relative SANS origine » (Node sans `location`) est une erreur de programmation, pas
 * une panne réseau : elle doit se lire comme telle plutôt que resurgir en « Invalid URL » opaque.
 */
function originForRelativeBase(baseUrl: string): string | undefined {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(baseUrl)) return undefined;
    const origin = (globalThis as { location?: { origin?: string } }).location?.origin;
    if (typeof origin !== 'string' || origin === '' || origin === 'null') {
        throw new FintableError(
            `Base d'API relative (« ${baseUrl} ») sans origine pour la résoudre : ce chemin exige un navigateur.`,
            'UNKNOWN',
        );
    }
    return origin;
}

export class FintableClient {
    private readonly token: string;
    private readonly baseUrl: string;
    private readonly timeoutMs: number;
    private readonly fetchImpl: typeof fetch;
    private readonly sleepImpl: (ms: number) => Promise<void>;

    constructor(opts: FintableClientOptions) {
        if (!opts.token || typeof opts.token !== 'string') {
            throw new FintableError('Jeton Fintable manquant (lecture seule attendue).', 'AUTH');
        }
        this.token = opts.token;
        this.baseUrl = (opts.baseUrl ?? FINTABLE_API_BASE).replace(/\/+$/, '');
        this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        // ⚠️ [FINTABLE-BROWSER-FETCH-RECEIVER] JAMAIS `?? fetch` NU ici. Stocker `fetch` dans une
        // propriété puis l'appeler par `this.fetchImpl(...)` change son RÉCEPTEUR : `this` devient
        // l'instance du client au lieu de `window`, et le binding WebIDL du navigateur REJETTE ça —
        // MESURÉ dans un vrai Chromium : `TypeError: Failed to execute 'fetch' on 'Window': Illegal
        // invocation`. C'est ce que Marc a vu (« [NETWORK] … échec réseau (TypeError) »).
        // Le wrapper corrige le récepteur ET garde la résolution du global au moment de l'APPEL
        // (donc un `vi.stubGlobal('fetch', …)` posé après la construction reste intercepté).
        // ⚠️ jsdom/undici ne reproduisent PAS ce rejet : seul un vrai navigateur l'expose.
        this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
        this.sleepImpl = opts.sleepImpl ?? defaultSleep;
    }

    /**
     * GET brut avec enveloppe déballée. Rend l'objet COMPLET (`data` + `next_cursor` +
     * `snapshot_date`) : le `snapshot_date` des holdings vit sur l'enveloppe, pas dans `data`.
     */
    async get<T = unknown>(
        path: string,
        query?: Record<string, string | number | boolean | undefined>,
    ): Promise<{ data: T; nextCursor: string | null; snapshotDate: string | null }> {
        const url = this.buildUrl(path, query);
        let lastTransient: FintableError | null = null;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            let body: unknown;
            let status: number;
            let retryAfterSec: number | undefined;
            try {
                ({ body, status, retryAfterSec } = await this.fetchWithinBudget(url));
            } catch (err) {
                // Réseau/timeout → transitoire. On retente avec un back-off simple.
                lastTransient = new FintableError(
                    `Appel Fintable ${path} : échec réseau (${err instanceof Error ? err.name : 'inconnu'}).`,
                    'NETWORK',
                );
                if (attempt < MAX_RETRIES) {
                    await this.sleepImpl(Math.min(2_000 * (attempt + 1), MAX_RETRY_WAIT_MS));
                    continue;
                }
                throw lastTransient;
            }

            if (status >= 200 && status < 300) {
                if (body === null || typeof body !== 'object' || Array.isArray(body)) {
                    throw new FintableError(
                        `Appel Fintable ${path} : enveloppe {data:…} attendue.`,
                        'MALFORMED',
                    );
                }
                const env = body as Record<string, unknown>;
                if (!('data' in env)) {
                    throw new FintableError(
                        `Appel Fintable ${path} : champ « data » absent de l'enveloppe.`,
                        'MALFORMED',
                    );
                }
                return {
                    data: env.data as T,
                    nextCursor: typeof env.next_cursor === 'string' ? env.next_cursor : null,
                    snapshotDate: typeof env.snapshot_date === 'string' ? env.snapshot_date : null,
                };
            }

            const code = statusToCode(status);
            const err = new FintableError(this.errorMessage(path, status, body), code, retryAfterSec);
            if (!err.isTransient || attempt >= MAX_RETRIES) throw err;

            // 429 / 5xx : on honore Retry-After quand il est là et raisonnable.
            lastTransient = err;
            const waitMs = retryAfterSec !== undefined
                ? Math.min(retryAfterSec * 1000, MAX_RETRY_WAIT_MS)
                : Math.min(2_000 * (attempt + 1), MAX_RETRY_WAIT_MS);
            await this.sleepImpl(waitMs);
        }

        // Inatteignable en pratique (la boucle jette avant), mais TypeScript veut une sortie.
        throw lastTransient ?? new FintableError(`Appel Fintable ${path} : échec inconnu.`, 'UNKNOWN');
    }

    /**
     * Parcourt une liste paginée par CURSEUR jusqu'à `next_cursor === null`.
     * Le curseur est opaque et LIÉ à son ordre de tri : ne jamais rejouer un curseur d'un
     * `order=date` contre un `order=updated` (l'API répond 400 invalid_cursor).
     * `maxPages` est un garde-fou anti-boucle : un serveur qui rendrait toujours le même curseur
     * ferait sinon tourner un cron à l'infini.
     */
    async getAllPages<T>(
        path: string,
        query: Record<string, string | number | boolean | undefined>,
        maxPages = 200,
    ): Promise<T[]> {
        const out: T[] = [];
        let cursor: string | null = null;
        const seen = new Set<string>();

        for (let page = 0; page < maxPages; page++) {
            const res: { data: T[]; nextCursor: string | null } = await this.get<T[]>(
                path,
                cursor ? { ...query, cursor } : query,
            );
            if (!Array.isArray(res.data)) {
                throw new FintableError(`Appel Fintable ${path} : liste attendue dans « data ».`, 'MALFORMED');
            }
            out.push(...res.data);
            if (!res.nextCursor) return out;
            if (seen.has(res.nextCursor)) {
                throw new FintableError(
                    `Appel Fintable ${path} : curseur répété — pagination interrompue pour éviter une boucle.`,
                    'MALFORMED',
                );
            }
            seen.add(res.nextCursor);
            cursor = res.nextCursor;
        }
        throw new FintableError(
            `Appel Fintable ${path} : plus de ${maxPages} pages — arrêt de sécurité.`,
            'MALFORMED',
        );
    }

    private buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>): string {
        const url = new URL(
            `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`,
            originForRelativeBase(this.baseUrl),
        );
        for (const [k, v] of Object.entries(query ?? {})) {
            if (v === undefined) continue;
            // ⚠️ [FINTABLE-BOOL-QUERY] Un booléen JS devient la chaîne "true"/"false" via String(v) —
            // mais la validation `boolean` par défaut de Laravel (le framework derrière l'API,
            // déduit du message d'erreur exact « The pending field must be true or false ») accepte
            // seulement 0/1/"0"/"1"/true/false RÉELS, PAS les chaînes "true"/"false" transmises par
            // une query string. Encoder en "1"/"0" plutôt qu'en toute confiance sur String().
            url.searchParams.set(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
        }
        return url.toString();
    }

    /** Lit statut + corps DANS le budget de temps (le corps est la partie qui stalle). */
    private async fetchWithinBudget(
        url: string,
    ): Promise<{ body: unknown; status: number; retryAfterSec: number | undefined }> {
        const controller = new AbortController();
        const timer = setTimeout(() => { controller.abort(); }, this.timeoutMs);
        try {
            const res = await this.fetchImpl(url, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    Accept: 'application/json',
                },
                signal: controller.signal,
            });
            const retryAfterSec = parseRetryAfter(res.headers?.get?.('Retry-After') ?? null);
            // ⚠️ DANS le budget : en abortant, le signal partagé fait REJETER un json() en cours.
            const text = await res.text();
            let body: unknown = null;
            if (text) {
                try {
                    body = JSON.parse(text);
                } catch {
                    // Un corps non-JSON sur un 2xx est une violation de contrat ; sur un 5xx c'est
                    // une page d'erreur d'infra. Dans les deux cas on garde `body = null` et le
                    // statut décide — jamais de crash brut de parsing remonté à l'appelant.
                    body = null;
                }
            }
            return { body, status: res.status, retryAfterSec };
        } finally {
            clearTimeout(timer);
        }
    }

    /** Message d'erreur exploitable, SANS jamais inclure le jeton ni l'URL complète. */
    private errorMessage(path: string, status: number, body: unknown): string {
        const parsed = (body ?? {}) as FtErrorBody;
        const type = parsed.error?.type;
        const message = parsed.error?.message;
        const detail = [type, message].filter(Boolean).join(' — ');
        const base = `Appel Fintable ${path} : HTTP ${status}`;
        const hint = status === 401
            ? ' (jeton absent, expiré ou révoqué — les jetons Fintable durent 1 an)'
            : status === 403
                ? ' (jeton valide mais action interdite pour ce plan)'
                : '';
        return detail ? `${base}${hint} — ${detail}` : `${base}${hint}.`;
    }
}
