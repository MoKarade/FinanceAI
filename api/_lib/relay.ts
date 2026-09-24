// api/_lib/relay.ts
// [P0-PROXY] Relais BYOK vers l'API Anthropic (décision Marc 2026-07-06 : app SOLO + relais BYOK).
//
// Modèle : l'appelant fournit SA clé Anthropic (Authorization: Bearer — le SDK client passe en
// `authToken`) ; le relais la re-mappe en `x-api-key` vers api.anthropic.com. AUCUNE clé serveur :
// personne ne peut consommer le budget d'autrui via ce endpoint (anti-abus par construction).
// [DURCISSEMENT-RELAIS] 2026-09-25 : le jeton `x-financeai-proxy` (PROXY_ACCESS_TOKEN / VITE_PROXY_ACCESS_TOKEN)
// est SUPPRIMÉ. Il était livré dans le bundle public (VITE_*) : n'importe qui le lisait, il n'a jamais protégé rien.
// Un secret qu'on livre au navigateur n'est pas un secret. À la place, des freins HONNÊTES (cf. api/_lib/garde.ts) :
// Origin (falsifiable hors navigateur), débit par IP et par empreinte de clé, plafond de corps, et — pour la
// passerelle locale — la clé Anthropic VÉRIFIÉE. Un test (tests/api/jetonAbsentDuBundle.test.ts) échoue si une
// valeur posée dans VITE_PROXY_ACCESS_TOKEN se retrouve dans le bundle construit.
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
//   - [S5-RELAIS-CLE] (audit S5, 24/09/2026) la clé BYOK est VÉRIFIÉE auprès d'Anthropic avant tout
//     appel local (count_tokens : gratuit, aucun contenu envoyé ; résultat mémorisé 10 min par empreinte
//     SHA-256 de la clé, jamais la clé elle-même). Sans ça, l'invariant « aucune clé serveur » tombait :
//     le jeton x-financeai-proxy est public (bundle) et N'IMPORTE QUELLE chaîne « Bearer » ouvrait la
//     passerelle — donc le GPU du PC de Marc — à qui lisait le bundle. Clé refusée ou vérification
//     impossible → pas de local (échec FERMÉ) ; la suite est inchangée (Anthropic avec la clé fournie).

// `.js` obligatoire : chargé en ESM natif par le runtime Node de Vercel (cf api/claude/v1/messages.ts).
import { MODEL_IDS, LOCAL_MODEL_ID } from '../../services/aiChat/models.js';
import {
    CorpsTropGros, LIMITES_PAR_DEFAUT, essayerDebit, ipClient, lireCorpsBorne, origineAutorisee,
    type Limites,
} from './garde.js';

const ANTHROPIC_BASE = 'https://api.anthropic.com';
const ALLOWED_PATH = '/v1/messages';
// Les modèles offerts par l'app — source unique services/aiChat/models.ts (Opus inclus : sans lui, le
// chat « Opus » échouait en 400 dès l'allumage du relais).
const ALLOWED_MODELS: ReadonlySet<string> = new Set(Object.values(MODEL_IDS));
// Plafond serveur (le max observé côté app : analyzeBankStatement = 16000).
const MAX_TOKENS_CAP = 16_000;
const DEFAULT_MAX_TOKENS = 1_024;
// Plafond local par défaut : au-delà, l'appel reste possible mais part chez Anthropic (cf. eligibleIaLocale).
const MAX_TOKENS_LOCAL_DEFAUT = 8_192;

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

// ─── [IA-LOCALE] Passerelle IA locale ─────────────────────────────────────────────────────────────

export interface IaLocaleConfig {
    /** Origine HTTPS de la passerelle (chemins CONSTANTS ajoutés ici : /sante, /v1/messages). */
    url: string;
    cle: string;
    modeles: ReadonlySet<string>;
    reflexion: 'low' | 'medium' | 'high';
    /** Plafond de max_tokens pour un appel servi LOCALEMENT (le GPU de Marc n'est pas un puits sans fond). */
    maxTokens: number;
}

export interface RelayOptions {
    /** Env serveur injectable (tests, dev Vite) ; défaut = process.env. */
    env?: (k: string) => string | undefined;
    /** Plafonds de débit par minute (tests) ; défaut = LIMITES_PAR_DEFAUT. */
    limites?: Limites;
    /** Injecté par les tests et le middleware dev ; `undefined` = lu dans l'env serveur ; `null` = coupé. */
    iaLocale?: IaLocaleConfig | null;
    /** [S5-RELAIS-CLE] Injecté par les tests ; `undefined` = vérification réelle (count_tokens). */
    verifierCle?: (cle: string, modele: string, signal: AbortSignal) => Promise<boolean>;
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
    const mt = Number(get('IA_LOCALE_MAX_TOKENS'));
    const maxTokens = Number.isFinite(mt) && mt > 0 ? Math.min(Math.floor(mt), MAX_TOKENS_CAP) : MAX_TOKENS_LOCAL_DEFAUT;
    return { url: base.origin, cle, modeles, reflexion: r === 'medium' || r === 'high' ? r : 'low', maxTokens };
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
    // Plafond local : une demande plus longue que ce que la passerelle accepte va chez Claude (jamais tronquée).
    if (typeof body.max_tokens === 'number' && body.max_tokens > cfg.maxTokens) return false;
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

// ─── [S5-RELAIS-CLE] Vérification de la clé BYOK avant la passerelle locale ──────────────────────────
// [DURCISSEMENT-RELAIS] Mémo : positif 10 min ; NÉGATIF court (un refus d'Anthropic 60 s, une panne 15 s : on ne
// re-martèle pas count_tokens avec la même clé) ; borné à 200 entrées, éviction PAR ANCIENNETÉ (avant : vidage
// total à 50 entrées, ce qui rendait la vérification rejouable à volonté) ; empreinte SALÉE (sel = env serveur
// RELAIS_SEL_EMPREINTE, sinon aléatoire par instance) : la table en mémoire ne se rejoue pas hors de ce processus.
const CLE_VALIDE_TTL_MS = 10 * 60_000;
const CLE_REFUSEE_TTL_MS = 60_000;
const CLE_PANNE_TTL_MS = 15_000;
const CLE_VERIF_DELAI_MS = 3_000;
const CLES_MEMO_MAX = 200;
const clesVerifiees = new Map<string, { ok: boolean; expire: number }>(); // empreinte salée → verdict (jamais la clé)
const selInstance = (() => {
    const o = new Uint8Array(16);
    crypto.getRandomValues(o);
    return Array.from(o, (x) => x.toString(16).padStart(2, '0')).join('');
})();

/** Tests uniquement : oublie les clés déjà vérifiées. */
export function reinitialiserClesValidees(): void {
    clesVerifiees.clear();
}

/** Taille du mémo (tests : borne). */
export function tailleMemoCles(): number {
    return clesVerifiees.size;
}

export async function empreinteCle(cle: string): Promise<string> {
    const sel = readEnv('RELAIS_SEL_EMPREINTE') ?? selInstance;
    const octets = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${sel}\0${cle}`)));
    return Array.from(octets, (o) => o.toString(16).padStart(2, '0')).join('');
}

function memoriserVerdict(h: string, ok: boolean, ttl: number): void {
    const maintenant = Date.now();
    clesVerifiees.delete(h);
    if (clesVerifiees.size >= CLES_MEMO_MAX) {
        for (const [k, v] of clesVerifiees) if (v.expire <= maintenant) clesVerifiees.delete(k);
        while (clesVerifiees.size >= CLES_MEMO_MAX) {
            const plusAncien = clesVerifiees.keys().next().value;
            if (plusAncien === undefined) break;
            clesVerifiees.delete(plusAncien);
        }
    }
    clesVerifiees.set(h, { ok, expire: maintenant + ttl });
}

/** Verdict déjà mémorisé (et non expiré) pour cette clé, sinon `undefined` (une vérification réseau serait nécessaire). */
export async function verdictEnMemoire(cle: string): Promise<boolean | undefined> {
    const v = clesVerifiees.get(await empreinteCle(cle));
    return v && v.expire > Date.now() ? v.ok : undefined;
}

/** Vrai si Anthropic accepte la clé (count_tokens : gratuit, contenu factice). Échec fermé. */
export async function cleAnthropicValide(cle: string, modele: string, signal: AbortSignal): Promise<boolean> {
    const h = await empreinteCle(cle);
    const m = clesVerifiees.get(h);
    if (m && m.expire > Date.now()) return m.ok;
    try {
        const r = await fetch(ANTHROPIC_BASE + '/v1/messages/count_tokens', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': cle },
            body: JSON.stringify({ model: modele, messages: [{ role: 'user', content: '.' }] }),
            signal: AbortSignal.any([signal, AbortSignal.timeout(CLE_VERIF_DELAI_MS)]),
        });
        await r.body?.cancel().catch(() => undefined);
        if (r.ok) { memoriserVerdict(h, true, CLE_VALIDE_TTL_MS); return true; }
        // 4xx = refus net d'Anthropic ; 5xx/429 = panne ou quota côté Anthropic (verdict plus court).
        memoriserVerdict(h, false, r.status >= 400 && r.status < 500 && r.status !== 429 ? CLE_REFUSEE_TTL_MS : CLE_PANNE_TTL_MS);
        return false;
    } catch {
        if (!signal.aborted) memoriserVerdict(h, false, CLE_PANNE_TTL_MS);
        return false;
    }
}

/** Cœur du relais — pur Web-standard (Request→Response) : même code en fonction Vercel et en dev Vite. */
export async function relayClaude(request: Request, opts?: RelayOptions): Promise<Response> {
    const url = new URL(request.url);
    const upstreamPath = url.pathname.replace(/^\/api\/claude/, '') || '/';
    if (request.method !== 'POST' || upstreamPath !== ALLOWED_PATH) {
        return anthropicError(404, 'not_found_error', 'Route non prise en charge par le relais.');
    }

    const env = opts?.env ?? readEnv;
    const limites = opts?.limites ?? LIMITES_PAR_DEFAUT;

    // [DURCISSEMENT-RELAIS] Origin : frein contre l'usage depuis une page tierce (falsifiable hors navigateur).
    if (!origineAutorisee(request.headers.get('origin'), env)) {
        return anthropicError(403, 'permission_error', 'Origine non autorisée.');
    }
    const ip = ipClient(request.headers);
    const trop = (r: { ok: false; retryApresSec: number }) => {
        // Journal SANS contenu : ni IP, ni clé, ni corps — seulement qu'un plafond a joué.
        console.warn('[relay] limite de débit atteinte');
        const rep = anthropicError(429, 'rate_limit_error', 'Trop de requêtes : réessaie dans un instant.');
        rep.headers.set('retry-after', String(r.retryApresSec));
        return rep;
    };
    const debitIp = essayerDebit(`ip:${ip}`, limites.parIp);
    if (!debitIp.ok) return trop(debitIp);

    // Clé BYOK de l'appelant — jamais loggée, jamais stockée, transite tel quel vers Anthropic.
    const auth = request.headers.get('authorization') ?? '';
    const apiKey = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
    if (!apiKey) {
        return anthropicError(401, 'authentication_error', 'Clé Anthropic absente (Authorization: Bearer requis).');
    }
    const debitCle = essayerDebit(`cle:${await empreinteCle(apiKey)}`, limites.parCle);
    if (!debitCle.ok) return trop(debitCle);

    let body: Record<string, unknown>;
    try {
        const parsed: unknown = JSON.parse(await lireCorpsBorne(request));
        // `null`/tableau/scalaire sont du JSON VALIDE mais pas un corps de requête Anthropic —
        // sans ce garde, `body.model` sur `null` lèverait une TypeError hors enveloppe.
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('non-objet');
        body = parsed as Record<string, unknown>;
    } catch (e) {
        if (e instanceof CorpsTropGros) {
            return anthropicError(413, 'request_too_large', 'Corps de requête trop volumineux pour le relais.');
        }
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
    const iaLocale = opts?.iaLocale !== undefined ? opts.iaLocale : iaLocaleDepuisEnv(env);
    const verifierCle = opts?.verifierCle ?? cleAnthropicValide;
    if (iaLocale && eligibleIaLocale(body, iaLocale)
        && await cleAutoriseeLocalement(apiKey, body.model, ip, limites, verifierCle, request.signal, opts?.verifierCle !== undefined)
        && await passerelleEnLigne(iaLocale)) {
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
                'anthropic-version': versionAnthropic(request.headers.get('anthropic-version')),
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

/** `anthropic-version` : forme AAAA-MM-JJ seulement (jamais une valeur libre recopiée vers l'amont). */
function versionAnthropic(v: string | null): string {
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '2023-06-01';
}

/**
 * La clé est-elle vérifiée pour servir l'appel en local ? Une clé DÉJÀ vue (verdict en mémoire) ne coûte rien.
 * Une clé INCONNUE coûte un appel count_tokens : plafonné par IP (`verifParIp`) — au-delà, pas de local
 * (l'appel continue chez Anthropic avec la clé fournie, qui refusera une clé fausse). `injecte` = vérificateur
 * de test : on ne touche ni au mémo ni au budget.
 */
async function cleAutoriseeLocalement(
    cle: string, modele: string, ip: string, limites: Limites,
    verifier: (cle: string, modele: string, signal: AbortSignal) => Promise<boolean>,
    signal: AbortSignal, injecte: boolean,
): Promise<boolean> {
    if (!injecte) {
        const connu = await verdictEnMemoire(cle);
        if (connu !== undefined) return connu;
        if (!essayerDebit(`verif:${ip}`, limites.verifParIp).ok) {
            console.warn('[relay] budget de vérification de clé épuisé');
            return false;
        }
    }
    return verifier(cle, modele, signal);
}
