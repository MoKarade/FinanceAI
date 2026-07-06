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
//   - allowlist stricte des 2 modèles de l'app + clamp serveur de max_tokens.

const ANTHROPIC_BASE = 'https://api.anthropic.com';
const ALLOWED_PATH = '/v1/messages';
// Les 2 seuls modèles utilisés par l'app (services/claude.ts MODEL_SONNET / MODEL_HAIKU).
const ALLOWED_MODELS = new Set(['claude-sonnet-4-6', 'claude-haiku-4-5-20251001']);
// Plafond serveur (le max observé côté app : analyzeBankStatement = 16000).
const MAX_TOKENS_CAP = 16_000;
const DEFAULT_MAX_TOKENS = 1_024;

export function anthropicError(status: number, type: string, message: string): Response {
    return new Response(JSON.stringify({ type: 'error', error: { type, message } }), {
        status,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
}

function configuredToken(): string | undefined {
    // `process` absent de certains runtimes web — garde sans dépendre des types Node.
    const p = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
    return p?.env?.PROXY_ACCESS_TOKEN || undefined;
}

/** Cœur du relais — pur Web-standard (Request→Response) : même code en Edge Vercel et en dev Vite. */
export async function relayClaude(request: Request, opts?: { accessToken?: string }): Promise<Response> {
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
