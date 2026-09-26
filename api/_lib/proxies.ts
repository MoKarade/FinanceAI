// api/_lib/proxies.ts
// [CF-ACCESS] 2026-09-25 — proxys Yahoo (historique, recherche) et Fintable, en fonctions gardées.
//
// AVANT : de simples réécritures vercel.json (`/api/history/yahoo/:symbol` → query1.finance.yahoo.com, etc.) : aucun
// contrôle possible, donc ouvertes à quiconque connaît l'adresse *.vercel.app. MAINTENANT : la réécriture pointe vers une
// fonction (chemin STATIQUE : les attrape-tout ne sont pas routés sur ce projet Vite, cf. api/claude/v1/messages.ts) qui
// applique le MÊME contrôle Cloudflare Access que le relais Claude, plus un débit par IP.
//
// Décision Yahoo (motivée) : GARDÉ par le jeton Access, pas seulement limité en débit. Le navigateur de Marc passe par
// Cloudflare (le cookie Access y devient l'en-tête Cf-Access-Jwt-Assertion) : aucune perte d'usage, et l'API n'est plus un
// proxy Yahoo public utilisable par n'importe qui.
//
// Chaque proxy est une LISTE BLANCHE : hôte amont fixe, paramètres validés un à un, GET seulement, délai borné, aucun cookie.
import { controlerAcces, type OptionsAcces } from './accessJwt.js';
import { essayerDebit, ipClient } from './garde.js';

const DELAI_AMONT_MS = 15_000;
const DEBIT_PROXY_PAR_MIN = 120;
const UA = 'Mozilla/5.0 (compatible; FinanceAI/1.0)';

export interface ProxyOptions {
    env?: (k: string) => string | undefined;
    access?: OptionsAcces | null;
    /** Tests : fetch injectable. */
    fetchImpl?: typeof fetch;
}

function readEnv(name: string): string | undefined {
    const p = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
    return p?.env?.[name] || undefined;
}

// Forme `{ error: { type, message } }` : celle que lit déjà le client Fintable (errorMessage), donc le motif du refus s'affiche.
function erreur(status: number, message: string, type = 'proxy_error'): Response {
    return new Response(JSON.stringify({ error: { type, message } }), {
        status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
}

/** Garde commune : méthode GET, jeton Access, débit par IP. `null` = tout va bien. */
async function garder(request: Request, opts: ProxyOptions): Promise<Response | null> {
    if (request.method !== 'GET') return erreur(405, 'Méthode non autorisée.');
    const env = opts.env ?? readEnv;
    const acces = opts.access === null
        ? { autorise: true, jetonValide: false }
        : await controlerAcces(request.headers, env, opts.access);
    if (!acces.autorise) return erreur(401, 'Accès refusé : session Cloudflare Access absente ou invalide.', 'access_denied');
    const debit = essayerDebit(`px:${ipClient(request.headers, acces.jetonValide)}`, DEBIT_PROXY_PAR_MIN);
    if (!debit.ok) {
        const r = erreur(429, 'Trop de requêtes.');
        r.headers.set('retry-after', String(debit.retryApresSec));
        return r;
    }
    return null;
}

async function relayer(url: string, headers: Record<string, string>, request: Request, opts: ProxyOptions): Promise<Response> {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(DELAI_AMONT_MS)]);
    let amont: Response;
    try {
        amont = await (opts.fetchImpl ?? fetch)(url, { method: 'GET', headers, signal, redirect: 'error' });
    } catch (e) {
        // Nom d'erreur SEUL : le message brut peut porter l'URL (et donc des paramètres).
        console.error('[proxy] échec amont:', (e as { name?: string })?.name ?? 'Error');
        return erreur(502, 'Service amont injoignable.');
    }
    const h = new Headers({ 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    const ct = amont.headers.get('content-type');
    if (ct) h.set('content-type', ct);
    const ra = amont.headers.get('retry-after');
    if (ra) h.set('retry-after', ra);
    return new Response(amont.body, { status: amont.status, headers: h });
}

// ─── Paramètres : validés un à un ─────────────────────────────────────────────────────────────────────

const SYMBOLE = /^[A-Za-z0-9.^=\-]{1,24}$/;
const RANGE = /^(1d|5d|1mo|3mo|6mo|1y|2y|5y|10y|ytd|max)$/;
const INTERVAL = /^(1m|2m|5m|15m|30m|60m|90m|1h|1d|5d|1wk|1mo|3mo)$/;
const ENTIER = /^\d{1,12}$/;

/**
 * Valeur UNIQUE d'un paramètre : `undefined` si absent, `null` si présent plusieurs fois (ambigu : Vercel fusionne la requête
 * d'origine avec celle de la destination de la réécriture, un appelant pourrait en ajouter un second → refus, jamais de choix).
 */
function unique(u: URL, cle: string): string | undefined | null {
    const v = u.searchParams.getAll(cle);
    return v.length === 0 ? undefined : v.length === 1 ? v[0] : null;
}

function pris(u: URL, cle: string, motif: RegExp): string | null | undefined {
    const v = u.searchParams.get(cle);
    if (v === null) return undefined; // absent : sans effet
    return motif.test(v) ? v : null; // présent mais invalide : refus
}

function symboleDuChemin(pathname: string): string | undefined {
    const m = /^\/api\/history\/yahoo\/([^/]+)$/.exec(pathname);
    if (!m) return undefined;
    try { return decodeURIComponent(m[1]); } catch { return undefined; }
}

function cheminFintableDuChemin(pathname: string): string | undefined {
    const m = /^\/api\/fintable\/(.+)$/.exec(pathname);
    if (!m) return undefined;
    try { return decodeURIComponent(m[1]); } catch { return undefined; }
}

/** GET /api/yahoo/history?symbol=…&range=…&interval=… | &period1=…&period2=… */
export async function proxyYahooHistorique(request: Request, opts: ProxyOptions = {}): Promise<Response> {
    const refus = await garder(request, opts);
    if (refus) return refus;
    const u = new URL(request.url);
    // [À MESURER en prévisualisation] Selon la version du runtime, `request.url` porte l'URL réécrite (`?symbol=`) ou l'URL
    // d'origine (`/api/history/yahoo/<symbole>`) : les deux formes sont lues, la requête d'abord.
    const brut = unique(u, 'symbol') ?? symboleDuChemin(u.pathname);
    const symbole = brut ?? '';
    if (!SYMBOLE.test(symbole) || /^\.+$/.test(symbole)) return erreur(400, 'Symbole invalide.');
    const q = new URLSearchParams();
    for (const [cle, motif] of [['range', RANGE], ['interval', INTERVAL], ['period1', ENTIER], ['period2', ENTIER]] as const) {
        const v = pris(u, cle, motif);
        if (v === null) return erreur(400, `Paramètre invalide : ${cle}.`);
        if (v !== undefined) q.set(cle, v);
    }
    return relayer(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbole)}?${q}`,
        { accept: 'application/json', 'user-agent': UA }, request, opts);
}

/** GET /api/yahoo/search?q=…&quotesCount=…&newsCount=…&listsCount=… */
export async function proxyYahooRecherche(request: Request, opts: ProxyOptions = {}): Promise<Response> {
    const refus = await garder(request, opts);
    if (refus) return refus;
    const u = new URL(request.url);
    const terme = u.searchParams.get('q') ?? '';
    if (!terme || terme.length > 100) return erreur(400, 'Recherche invalide.');
    const q = new URLSearchParams({ q: terme });
    for (const cle of ['quotesCount', 'newsCount', 'listsCount']) {
        const v = pris(u, cle, /^\d{1,2}$/);
        if (v === null) return erreur(400, `Paramètre invalide : ${cle}.`);
        if (v !== undefined) q.set(cle, v);
    }
    return relayer(`https://query1.finance.yahoo.com/v1/finance/search?${q}`,
        { accept: 'application/json', 'user-agent': UA }, request, opts);
}

const CHEMIN_FINTABLE = /^[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*$/;

/**
 * GET /api/proxy/fintable?path=<chemin sous /api/v2>&… : les autres paramètres sont relayés tels quels.
 * L'en-tête `Authorization: Bearer <jeton Fintable>` du navigateur est relayé ; il n'est jamais journalisé.
 */
export async function proxyFintable(request: Request, opts: ProxyOptions = {}): Promise<Response> {
    const refus = await garder(request, opts);
    if (refus) return refus;
    const u = new URL(request.url);
    const chemin = unique(u, 'path') ?? cheminFintableDuChemin(u.pathname) ?? '';
    // Aucun segment « .. » ou « . » : le chemin reste SOUS /api/v2 (pas de remontée vers d'autres routes de l'hôte amont).
    if (!CHEMIN_FINTABLE.test(chemin) || chemin.split('/').some((s) => s === '.' || s === '..')) {
        return erreur(400, 'Chemin invalide.');
    }
    const q = new URLSearchParams();
    for (const [k, v] of u.searchParams) if (k !== 'path') q.append(k, v);
    const auth = request.headers.get('authorization');
    return relayer(`https://fintable.io/api/v2/${chemin}${q.size ? `?${q}` : ''}`,
        { accept: 'application/json', ...(auth ? { authorization: auth } : {}) }, request, opts);
}
