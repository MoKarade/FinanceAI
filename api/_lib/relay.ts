// api/_lib/relay.ts
// [P0-PROXY] Relais BYOK vers l'API Anthropic (décision Marc 2026-07-06 : app SOLO + relais BYOK).
//
// Modèle : l'appelant fournit SA clé Anthropic (Authorization: Bearer — le SDK client passe en
// `authToken`) ; le relais la re-mappe en `x-api-key` vers api.anthropic.com. AUCUNE clé serveur :
// personne ne peut consommer le budget d'autrui via ce endpoint (anti-abus par construction).
// Le jeton `x-financeai-proxy` (env PROXY_ACCESS_TOKEN) ne fait que dissuader le scraping anonyme
// de l'infra Vercel — il est extractible du bundle (VITE_*), c'est un frein documenté, pas une barrière.
//
// Exigences sécurité (modèle de menaces 2026-07-06, agents security-privacy + ai-reviewer) :
//   - URL amont CONSTANTE (aucune entrée requête ne dérive l'URL → zéro SSRF) ;
//   - une seule route autorisée (POST /v1/messages) — tout le reste 404 ;
//   - ZÉRO log de corps/headers (les prompts contiennent des données financières) ;
//   - erreurs au format ENVELOPPE ANTHROPIC natif (le SDK client mappe dessus) ;
//   - `Cache-Control: no-store` (jamais de réponse IA en cache edge/CDN) ;
//   - annulation chaînée : request.signal → fetch amont (un « Annuler » coupe la facturation réelle) ;
//   - allowlist stricte des modèles de l'app + clamp serveur de max_tokens.
//
// [IA-LOCALE] (décision Marc 2026-09-23 : « faire passer un max par Ollama ») Routage optionnel vers la
// passerelle IA LOCALE de l'Atelier (Ollama sur le PC de Marc, exposée par tunnel Cloudflare) :
//   - activé seulement si l'env SERVEUR porte IA_LOCALE_URL + IA_LOCALE_CLE (jamais VITE_* → hors bundle) ;
//   - éligible : modèle dans IA_LOCALE_MODELES (défaut Haiku + Sonnet ; Opus = choix explicite du
//     meilleur modèle → reste Claude), contenu TEXTE/outils seulement (image, PDF, outils serveur ou
//     tool_choice forcé → Claude : gpt-oss n'a pas la vision et ne sait pas forcer un outil) ;
//   - la clé BYOK n'est JAMAIS envoyée à la passerelle (clé dédiée IA_LOCALE_CLE) ;
//   - passerelle éteinte/en erreur/trop lente → bascule transparente sur Anthropic avec la clé BYOK
//     (sonde /sante 1,5 s mémorisée 30 s : PC éteint = +0 s sur les appels suivants) ;
//   - la réponse locale porte `model: gpt-oss-atelier` (services/aiChat/models.ts LOCAL_MODEL_ID) →
//     le chat ne la facture pas.

// `.js` obligatoire : chargé en ESM natif par le runtime Node de Vercel (cf api/claude/v1/messages.ts).
import { MODEL_IDS, LOCAL_MODEL_ID } from '../../services/aiChat/models.js';

const ANTHROPIC_BASE = 'https://api.anthropic.com';
const ALLOWED_PATH = '/v1/messages';
// Les modèles offerts par l'app — source unique services/aiChat/models.ts (Opus inclus : sans lui, le
// chat « Opus » échouait en 400 dès l'allumage du relais).
const ALLOWED_MODELS: ReadonlySet<string> = new Set(Object.values(MODEL_IDS));
// Plafond serveur (le max observé côté app : analyzeBankStatement = 16000).
const MAX_TOKENS_CAP = 16_000;
const DEFAULT_MAX_TOKENS = 1_024;

export function anthropicError(status: number, type: string, message: string): Response {
    return new Response(JSON.stringify({ type: 'error', error: { type, message } }), {
        status,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
}

function readEnv(name: string): string | undefined {
    // `process` absent de certains runtimes web — garde sans dépendre des types Node.
    const p = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
    return p?.env?.[name] || undefined;
}

function configuredToken(): string | undefined {
    return readEnv('PROXY_ACCESS_TOKEN');
}

// ─── [IA-LOCALE] Passerelle IA locale ─────────────────────────────────────────────────────────────

export interface IaLocaleConfig {
    /** Origine HTTPS de la passerelle (chemins CONSTANTS ajoutés ici : /sante, /v1/messages). */
    url: string;
    cle: string;
    modeles: ReadonlySet<string>;
    reflexion: 'low' | 'medium' | 'high';
}

export interface RelayOptions {
    accessToken?: string;
    /** Injecté par les tests et le middleware dev ; `undefined` = lu dans l'env serveur ; `null` = coupé. */
    iaLocale?: IaLocaleConfig | null;
}

/** Config IA locale depuis l'env serveur, ou `null` (routage coupé) si incomplète/invalide. */
export function iaLocaleDepuisEnv(get: (k: string) => string | undefined = readEnv): IaLocaleConfig | null {
    const brute = get('IA_LOCALE_URL');
    const cle = get('IA_LOCALE_CLE');
    if (!brute || !cle) return null;
    let base: URL;
    try {
        base = new URL(brute);
    } catch {
        return null;
    }
    // HTTPS obligatoire hors machine locale : la clé de passerelle ne voyage jamais en clair.
    const local = base.hostname === 'localhost' || base.hostname === '127.0.0.1';
    if (base.protocol !== 'https:' && !(local && base.protocol === 'http:')) return null;
    const liste = get('IA_LOCALE_MODELES') ?? `${MODEL_IDS.haiku},${MODEL_IDS.sonnet}`;
    const modeles = new Set(liste.split(',').map((s) => s.trim()).filter((s) => ALLOWED_MODELS.has(s)));
    const r = get('IA_LOCALE_REFLEXION');
    return { url: base.origin, cle, modeles, reflexion: r === 'medium' || r === 'high' ? r : 'low' };
}

// Blocs que gpt-oss ne sait pas traiter (pas de vision, pas de PDF) : présence → Claude.
const BLOCS_NON_TEXTE = new Set(['image', 'document', 'search_result', 'container_upload']);

function contientBlocNonTexte(v: unknown, profondeur = 0): boolean {
    if (profondeur > 6 || v === null || typeof v !== 'object') return false;
    if (Array.isArray(v)) return v.some((x) => contientBlocNonTexte(x, profondeur + 1));
    const o = v as Record<string, unknown>;
    if (typeof o.type === 'string' && BLOCS_NON_TEXTE.has(o.type)) return true;
    return contientBlocNonTexte(o.content, profondeur + 1);
}

/** Vrai si CET appel peut être servi par l'IA locale (règles en tête de fichier). */
export function eligibleIaLocale(body: Record<string, unknown>, cfg: IaLocaleConfig | null): boolean {
    if (!cfg || typeof body.model !== 'string' || !cfg.modeles.has(body.model)) return false;
    const choix = body.tool_choice as { type?: unknown } | undefined;
    if (choix && choix.type !== 'auto' && choix.type !== 'none') return false;
    if (Array.isArray(body.tools) && body.tools.some((t) => {
        const type = (t as { type?: unknown } | null)?.type;
        return type !== undefined && type !== 'custom';
    })) return false;
    return !contientBlocNonTexte(body.messages) && !contientBlocNonTexte(body.system);
}

const SANTE_DELAI_MS = 1_500;
const SANTE_TTL_MS = 30_000;
// Flux : délai jusqu'aux en-têtes (le GPU peut être occupé) ; non-flux : réponse complète, sous les
// 125 s du proxy Cloudflare (au-delà, 524 → de toute façon la bascule Anthropic prend le relais).
const DELAI_LOCAL_FLUX_MS = 20_000;
const DELAI_LOCAL_SIMPLE_MS = 100_000;
let santeCache: { ok: boolean; expire: number } | null = null;

/** Tests uniquement : oublie l'état mémorisé de la passerelle. */
export function reinitialiserSanteIaLocale(): void {
    santeCache = null;
}

function marquerPasserelle(ok: boolean): void {
    santeCache = { ok, expire: Date.now() + SANTE_TTL_MS };
}

async function passerelleEnLigne(cfg: IaLocaleConfig): Promise<boolean> {
    if (santeCache && santeCache.expire > Date.now()) return santeCache.ok;
    let ok = false;
    try {
        const r = await fetch(cfg.url + '/sante', { signal: AbortSignal.timeout(SANTE_DELAI_MS) });
        ok = r.ok;
    } catch {
        ok = false;
    }
    marquerPasserelle(ok);
    return ok;
}

/**
 * Appel à la passerelle locale. Rend la Response à renvoyer au client, ou `null` pour basculer sur
 * Anthropic. Une annulation CLIENT est relancée telle quelle (le relais la traite comme aujourd'hui).
 */
async function appelIaLocale(body: Record<string, unknown>, cfg: IaLocaleConfig, signal: AbortSignal): Promise<Response | null> {
    const flux = body.stream === true;
    const ctrl = new AbortController();
    const surAnnulation = () => ctrl.abort();
    signal.addEventListener('abort', surAnnulation, { once: true });
    const minuteur = setTimeout(() => ctrl.abort(), flux ? DELAI_LOCAL_FLUX_MS : DELAI_LOCAL_SIMPLE_MS);
    try {
        const r = await fetch(cfg.url + ALLOWED_PATH, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': cfg.cle,
                'x-atelier-reflexion': cfg.reflexion,
            },
            body: JSON.stringify({ ...body, model: LOCAL_MODEL_ID }),
            signal: ctrl.signal,
        });
        if (!r.ok) {
            await r.body?.cancel().catch(() => undefined);
            marquerPasserelle(false);
            return null;
        }
        const headers = new Headers({ 'cache-control': 'no-store', 'x-financeai-ia': 'locale' });
        const ct = r.headers.get('content-type');
        if (ct) headers.set('content-type', ct);
        if (flux) {
            clearTimeout(minuteur);   // flux entamé : sa durée est bornée côté passerelle
            return new Response(r.body, { status: r.status, headers });
        }
        // Non-flux : corps lu ICI (petit JSON) → une coupure en cours de lecture bascule encore sur Claude.
        const texte = await r.text();
        return new Response(texte, { status: r.status, headers });
    } catch (e) {
        if (signal.aborted) throw e;
        console.warn('[relay] IA locale indisponible, bascule Anthropic :', (e as { name?: string })?.name ?? 'Error');
        marquerPasserelle(false);
        return null;
    } finally {
        clearTimeout(minuteur);
        if (!flux) signal.removeEventListener('abort', surAnnulation);
    }
}

/** Cœur du relais — pur Web-standard (Request→Response) : même code en fonction Vercel et en dev Vite. */
export async function relayClaude(request: Request, opts?: RelayOptions): Promise<Response> {
    const url = new URL(request.url);
    const upstreamPath = url.pathname.replace(/^\/api\/claude/, '') || '/';
    if (request.method !== 'POST' || upstreamPath !== ALLOWED_PATH) {
        return anthropicError(404, 'not_found_error', 'Route non prise en charge par le relais.');
    }

    const expected = opts?.accessToken ?? configuredToken();
    if (!expected) {
        return anthropicError(503, 'api_error', 'Relais non configuré (PROXY_ACCESS_TOKEN absent).');
    }
    if (request.headers.get('x-financeai-proxy') !== expected) {
        return anthropicError(401, 'authentication_error', 'Jeton de relais invalide.');
    }

    // Clé BYOK de l'appelant — jamais loggée, jamais stockée, transite tel quel vers Anthropic.
    const auth = request.headers.get('authorization') ?? '';
    const apiKey = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
    if (!apiKey) {
        return anthropicError(401, 'authentication_error', 'Clé Anthropic absente (Authorization: Bearer requis).');
    }

    let body: Record<string, unknown>;
    try {
        const parsed: unknown = await request.json();
        // `null`/tableau/scalaire sont du JSON VALIDE mais pas un corps de requête Anthropic —
        // sans ce garde, `body.model` sur `null` lèverait une TypeError hors enveloppe.
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('non-objet');
        body = parsed as Record<string, unknown>;
    } catch {
        return anthropicError(400, 'invalid_request_error', 'Corps JSON invalide.');
    }
    if (typeof body.model !== 'string' || !ALLOWED_MODELS.has(body.model)) {
        return anthropicError(400, 'invalid_request_error', 'Modèle hors allowlist du relais.');
    }
    const requested = Number(body.max_tokens);
    body.max_tokens = Number.isFinite(requested) && requested > 0
        ? Math.min(Math.floor(requested), MAX_TOKENS_CAP)
        : DEFAULT_MAX_TOKENS;

    // [IA-LOCALE] Essai sur la passerelle locale si l'appel est éligible et qu'elle répond ; sinon
    // (ou en cas d'échec) on continue vers Anthropic exactement comme avant.
    const iaLocale = opts?.iaLocale !== undefined ? opts.iaLocale : iaLocaleDepuisEnv();
    if (iaLocale && eligibleIaLocale(body, iaLocale) && await passerelleEnLigne(iaLocale)) {
        try {
            const locale = await appelIaLocale(body, iaLocale, request.signal);
            if (locale) return locale;
        } catch {
            return anthropicError(499, 'api_error', 'Requête annulée par le client.');
        }
    }

    // Headers MINIMAUX vers l'amont (ni cookie, ni UA, ni jeton de relais, ni IP client).
    let upstream: Response;
    try {
        upstream = await fetch(ANTHROPIC_BASE + ALLOWED_PATH, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'anthropic-version': request.headers.get('anthropic-version') ?? '2023-06-01',
                'x-api-key': apiKey,
            },
            body: JSON.stringify(body),
            // Annulation chaînée : si le client (AbortController UI) coupe, on coupe la génération amont.
            signal: request.signal,
        });
    } catch (e) {
        // JAMAIS de rejet nu (le SDK client recevrait une réponse plateforme non-Anthropic, opaque).
        const name = (e as { name?: string })?.name ?? 'Error';
        if (name === 'AbortError') {
            // Client parti (annulation) : réponse best-effort, l'important est de ne pas crasher.
            return anthropicError(499, 'api_error', 'Requête annulée par le client.');
        }
        // Panne réseau/DNS/TLS : trace MINIMALE (nom d'erreur SEUL — jamais le message brut,
        // qui peut porter des détails de requête) + enveloppe native pour le SDK.
        console.error('[relay] échec amont Anthropic:', name);
        return anthropicError(502, 'api_error', 'API Anthropic injoignable via le relais.');
    }

    // Passthrough : statut + corps STREAMÉ tels quels (SSE inclus) → l'enveloppe d'erreur Anthropic
    // native est préservée et le parsing `client.messages.stream()` du SDK reste intact.
    const headers = new Headers();
    const ct = upstream.headers.get('content-type');
    if (ct) headers.set('content-type', ct);
    headers.set('cache-control', 'no-store');
    return new Response(upstream.body, { status: upstream.status, headers });
}
