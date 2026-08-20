#!/usr/bin/env node
// mcp/http.ts
//
// [MCP-CLOUDRUN-HTTP] — entrée Streamable HTTP du serveur MCP FinanceAI.
// Lancement : npm run mcp:http (local, 127.0.0.1:8080) ; sur Cloud Run, $PORT
// est défini par la plateforme → écoute 0.0.0.0:$PORT (exigence Cloud Run).
// Le mode stdio (mcp/stdio.ts, npm run mcp:dev) reste inchangé pour le local.
//
// Endpoints :
//   - POST/GET/DELETE /mcp : protocole MCP Streamable HTTP (sessions à ID,
//     réponses JSON directes — enableJsonResponse) ;
//   - GET /health          : 200 {"status":"ok"} (sonde Cloud Run) ;
//   - GET /hub/summary     : [HUB-01] résumé pour le hub perso (contrat
//     @mokarade/hub-contract v1) — actif seulement si FINANCEAI_HUB_TOKEN
//     est défini ; header x-hub-token exigé, 401 sinon, no-store.
//
// ⚠️ SÉCURITÉ (Lot 2 = transport SEULEMENT) : AUCUNE authentification ici —
// l'auth OAuth 2.1 (Claude ↔ serveur) et le token Drive en Secret Manager
// arrivent au Lot 3 (BACKLOG §MCP-CLOUDRUN-A/B). NE PAS exposer publiquement
// ce serveur avant le Lot 3 : en local il n'écoute que 127.0.0.1 (loopback),
// avec protection anti-DNS-rebinding (Host + Origin) ; un hôte non-loopback
// hors Cloud Run est REFUSÉ au démarrage sauf opt-in explicite.

import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { HUB_TOKEN_HEADER, serveSummary } from '@mokarade/hub-contract/endpoint';
import { createServer as createMcpServer } from './server';
import { MCP_SERVER_VERSION, resolveState, type ResolvedState } from './bootstrap';
import { makeOAuthProvider, OAuthError, type OAuthProvider } from './auth/oauthProvider';
import { makeAttemptLimiter } from './auth/rateLimit';
import { buildHubSummary, errorHubSummary } from './hubSummary';
import { runPriceRefresh } from './refreshPrices';
import { runFintableSync } from './runFintableSync';
import { FintableClient } from '../services/fintable/client';
import type { FintableMappingConfig } from '../services/fintable/mapSnapshot';
import { parseRolesJson } from '../services/fintable/rolesConfig';
import { isStateConflictError } from './state/stateErrors';
import { configureMarketDataProvider } from '../services/marketData';

/** Cap du corps de requête : largement suffisant pour du JSON-RPC MCP, borne l'OOM (mesuré : RSS ~7× la taille du corps). */
const MAX_BODY_BYTES = 5 * 1024 * 1024;
/** Délai de grâce de l'arrêt : au-delà, fermeture FORCÉE des connexions (sinon une requête en vol
 *  suspendue bloque `server.close()` à jamais → SIGKILL Cloud Run — prouvé par le panel 2026-07-13). */
const CLOSE_GRACE_MS = 5_000;

interface SessionEntry {
    transport: StreamableHTTPServerTransport;
    lastSeen: number;
}

export interface HttpServerOptions {
    port: number;
    host: string;
    state: ResolvedState;
    /** Protection anti-DNS-rebinding Host+Origin (activer en LOCAL ; inutile derrière le proxy Cloud Run). */
    dnsRebindingProtection?: boolean;
    /** Durée d'inactivité avant fermeture d'une session (défaut 1 h) — injectable pour les tests. */
    sessionIdleMs?: number;
    /** Période du balayage des sessions inactives (défaut 10 min) — injectable pour les tests. */
    sweepIntervalMs?: number;
    /** Garde-fou mémoire : refus (503) au-delà (défaut 32 — app solo, jamais atteint en usage normal). */
    maxSessions?: number;
    /** [MCP-CLOUDRUN-B] fournisseur OAuth 2.1 : si présent, /mcp exige un Bearer valide
     *  et les endpoints /oauth/* + /.well-known/* sont exposés. */
    auth?: OAuthProvider;
    /** [HUB-01] jeton du hub perso : si présent, GET /hub/summary est exposé
     *  (header x-hub-token, 401 sinon, Cache-Control: no-store). Absent = route désactivée. */
    hubToken?: string;
    /** [HUB-REFRESH-CRON] secret du déclencheur planifié : si présent, POST /refresh est exposé
     *  (header Authorization: Bearer, 401 sinon). Absent = route désactivée. */
    refreshSecret?: string;
    /** [HUB-REFRESH-CRON] clé Finnhub (env) : configure le provider marché avant /refresh, pour
     *  rafraîchir aussi les ACTIONS (la crypto CoinGecko marche sans clé). Absente = actions skippées. */
    finnhubKey?: string;
    /** [FINTABLE-3] secret du déclencheur planifié (cron quotidien) : si présent, POST /fintable-sync
     *  est exposé (header Authorization: Bearer, 401 sinon). Absent = route désactivée. */
    fintableSyncSecret?: string;
    /** [FINTABLE-3] jeton Fintable (API V2) + config des rôles de comptes — requis ENSEMBLE avec
     *  `fintableSyncSecret` pour que la route fasse quoi que ce soit d'utile (sans rôles, le mapper
     *  n'a rien à mapper — pas une erreur de démarrage, juste une sync qui ne trouve aucun compte connu). */
    fintableToken?: string;
    fintableRoles?: FintableMappingConfig['roles'];
}

export interface RunningHttpServer {
    server: Server;
    port: number;
    close: () => Promise<void>;
}

class BodyTooLargeError extends Error {
    constructor() { super(`Corps de requête > ${MAX_BODY_BYTES} octets.`); }
}

/** Lit le corps en le PLAFONNANT (413 sinon) et en rejetant si la connexion coupe avant la fin
 *  (sans ça, la Promise resterait pendante à jamais — fuite de handlers, prouvé par le panel). */
function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let total = 0;
        let settled = false;
        const settle = (fn: () => void): void => {
            if (!settled) { settled = true; fn(); }
        };
        req.on('data', (c: Buffer) => {
            // Après dépassement : on continue de LIRE (drain) mais on n'ACCUMULE plus —
            // détruire la socket ferait un RST qui jette le 413 déjà envoyé (ECONNRESET
            // client, vu au test) ; drainer garde la mémoire PLATE et la réponse intacte.
            if (settled) return;
            total += c.length;
            if (total > MAX_BODY_BYTES) {
                settle(() => reject(new BodyTooLargeError()));
                return;
            }
            chunks.push(c);
        });
        req.on('end', () => settle(() => resolve(Buffer.concat(chunks).toString('utf8'))));
        req.on('error', (err) => settle(() => reject(err)));
        // 'close' arrive AUSSI après 'end' (fin normale) → settled le neutralise ; il ne
        // rejette que si la connexion coupe AVANT la fin du corps (client parti/abort).
        req.on('close', () => settle(() => reject(new Error('Connexion fermée avant la fin du corps.'))));
    });
}

function sendJson(
    res: ServerResponse,
    status: number,
    payload: unknown,
    extraHeaders: Record<string, string> = {},
): void {
    res.writeHead(status, { 'Content-Type': 'application/json', ...extraHeaders });
    res.end(JSON.stringify(payload));
}

/** [HUB-01] un summary est un instantané : jamais mis en cache (contrat hub). */
const HUB_NO_STORE = { 'Cache-Control': 'no-store' } as const;

/** [HUB-01] comparaison en temps constant (via digests de longueur fixe — timingSafeEqual
 *  exige des buffers de même taille, un secret de longueur différente ne doit pas fuiter). */
function hubTokensMatch(provided: string, expected: string): boolean {
    const a = createHash('sha256').update(provided).digest();
    const b = createHash('sha256').update(expected).digest();
    return timingSafeEqual(a, b);
}

/** Erreur JSON-RPC (forme attendue par un client MCP, id null = hors requête identifiable). */
function sendRpcError(res: ServerResponse, status: number, code: number, message: string): void {
    sendJson(res, status, { jsonrpc: '2.0', error: { code, message }, id: null });
}

/**
 * Démarre le serveur HTTP MCP. Exporté (au lieu d'un simple main) pour être
 * testable : les tests l'instancient sur un port éphémère avec un état fixture.
 */
export async function startHttpServer(options: HttpServerOptions): Promise<RunningHttpServer> {
    const { state } = options;
    const sessionIdleMs = options.sessionIdleMs ?? 60 * 60 * 1000;
    const sweepIntervalMs = options.sweepIntervalMs ?? 10 * 60 * 1000;
    const maxSessions = options.maxSessions ?? 32;
    const sessions = new Map<string, SessionEntry>();
    // Port RÉELLEMENT lié — rempli après listen(). Les transports (créés par requête,
    // donc toujours après listen) doivent construire allowedHosts sur CE port, pas sur
    // options.port : avec un port éphémère (0), `127.0.0.1:0` rejetterait TOUT (panel).
    let boundPort = options.port;

    const closeSession = async (id: string): Promise<void> => {
        const entry = sessions.get(id);
        sessions.delete(id);
        if (entry) {
            await entry.transport.close().catch((err: unknown) => {
                // On n'avale JAMAIS en silence : trace stderr (le sink observable de ce process).
                console.error(`[FinanceAI MCP http] Échec de fermeture de la session ${id.slice(0, 8)}… :`, err);
            });
        }
    };

    // Balayage des sessions inactives (unref : ne retient pas le process).
    const sweeper = setInterval(() => {
        const cutoff = Date.now() - sessionIdleMs;
        for (const [id, entry] of sessions) {
            if (entry.lastSeen < cutoff) {
                void closeSession(id);
                // ID TRONQUÉ : le session-id tient lieu d'autorisation tant que le Lot 3
                // (OAuth) n'existe pas — jamais l'UUID complet dans les logs.
                console.error(`[FinanceAI MCP http] Session inactive fermée : ${id.slice(0, 8)}…`);
            }
        }
    }, sweepIntervalMs);
    sweeper.unref();

    const handleMcp = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
        const sessionId = req.headers['mcp-session-id'];
        if (Array.isArray(sessionId)) {
            sendRpcError(res, 400, -32000, 'En-tête mcp-session-id multiple.');
            return;
        }

        // Session existante → router vers SON transport (GET/POST/DELETE gérés par le SDK).
        if (sessionId) {
            const entry = sessions.get(sessionId);
            if (!entry) {
                sendRpcError(res, 404, -32001, 'Session inconnue ou expirée — ré-initialise la connexion.');
                return;
            }
            entry.lastSeen = Date.now();
            const raw = req.method === 'POST' ? await readBody(req) : undefined;
            let parsed: unknown;
            if (raw != null) {
                try {
                    parsed = JSON.parse(raw);
                } catch {
                    sendRpcError(res, 400, -32700, 'Corps JSON invalide.');
                    return;
                }
            }
            await entry.transport.handleRequest(req, res, parsed);
            return;
        }

        // Pas de session : seule une requête POST `initialize` est acceptable.
        if (req.method !== 'POST') {
            sendRpcError(res, 400, -32000, 'Session requise (en-tête mcp-session-id) — envoie `initialize` d’abord.');
            return;
        }
        const raw = await readBody(req);
        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch {
            sendRpcError(res, 400, -32700, 'Corps JSON invalide.');
            return;
        }
        if (!isInitializeRequest(parsed)) {
            sendRpcError(res, 400, -32000, 'Requête sans session : seul `initialize` est accepté.');
            return;
        }
        if (sessions.size >= maxSessions) {
            sendRpcError(res, 503, -32000, 'Trop de sessions actives — réessaie plus tard.');
            return;
        }

        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            enableJsonResponse: true,
            enableDnsRebindingProtection: options.dnsRebindingProtection ?? false,
            // Host ET Origin : Host bloque le DNS-rebinding classique ; Origin bloque le
            // drive-by « page web → fetch localhost » (requête simple sans préflight).
            allowedHosts: options.dnsRebindingProtection
                ? [`127.0.0.1:${boundPort}`, `localhost:${boundPort}`]
                : undefined,
            allowedOrigins: options.dnsRebindingProtection
                ? [`http://127.0.0.1:${boundPort}`, `http://localhost:${boundPort}`]
                : undefined,
            onsessioninitialized: (id: string) => {
                sessions.set(id, { transport, lastSeen: Date.now() });
            },
            onsessionclosed: (id: string) => {
                sessions.delete(id);
            },
        });
        // Sans ce câblage, TOUS les rejets internes du SDK (Host/Origin bloqué,
        // Content-Type, protocole) seraient des no-ops invisibles (panel).
        transport.onerror = (err: Error) => {
            console.error('[FinanceAI MCP http] Erreur transport SDK :', err.message);
        };
        // Un McpServer PAR session (registre de tools léger) ; le STORE d'état est
        // PARTAGÉ (cache unique, mêmes données — app solo, aucune donnée par-session).
        const mcpServer = createMcpServer({ getState: state.store.get, store: state.store });
        try {
            await mcpServer.connect(transport);
            await transport.handleRequest(req, res, parsed);
        } catch (err) {
            // Échec APRÈS une éventuelle inscription (onsessioninitialized) : ne pas
            // laisser une session fantôme que le client ne connaîtra jamais.
            const id = transport.sessionId;
            if (id) sessions.delete(id);
            throw err;
        }
    };

    // ── [MCP-CLOUDRUN-B] endpoints OAuth 2.1 (si auth configurée) ────────────
    // [MCP-CLOUDRUN-AUTH-HARDENING] UN limiteur par serveur (pas par requête) : sa mémoire EST la
    // protection. En construire un à chaque appel remettrait le compteur à zéro à chaque tentative.
    const authorizeLimiter = makeAttemptLimiter();

    const escapeHtml = (s: string): string =>
        s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

    const authorizeFormHtml = (q: Record<string, string>, error?: string): string => `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>FinanceAI — autorisation</title>
<style>body{font-family:system-ui;max-width:26rem;margin:4rem auto;padding:0 1rem;background:#0f1115;color:#e8eaf0}
input,button{font-size:1rem;padding:.6rem;width:100%;box-sizing:border-box;border-radius:.5rem;border:1px solid #333}
button{background:#2563eb;color:#fff;border:0;margin-top:.75rem;cursor:pointer}.err{color:#f87171}</style></head>
<body><h1>FinanceAI MCP</h1>
<p>Claude demande l'accès à tes finances. Entre ta <strong>clé d'accès</strong> pour autoriser.</p>
${error ? `<p class="err">${escapeHtml(error)}</p>` : ''}
<form method="POST" action="/oauth/authorize">
${['client_id', 'redirect_uri', 'state', 'code_challenge', 'code_challenge_method', 'response_type']
    .map((k) => `<input type="hidden" name="${k}" value="${escapeHtml(q[k] ?? '')}">`).join('\n')}
<input type="password" name="access_key" placeholder="Clé d'accès" autofocus autocomplete="current-password">
<button type="submit">Autoriser</button></form></body></html>`;

    const handleOAuth = async (auth: OAuthProvider, url: string, req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
        if (url === '/.well-known/oauth-authorization-server') {
            sendJson(res, 200, auth.authorizationServerMetadata());
            return true;
        }
        if (url === '/.well-known/oauth-protected-resource') {
            sendJson(res, 200, auth.protectedResourceMetadata());
            return true;
        }
        if (url === '/oauth/register' && req.method === 'POST') {
            let body: { redirect_uris?: string[] };
            try {
                body = JSON.parse(await readBody(req)) as { redirect_uris?: string[] };
            } catch {
                throw new OAuthError('invalid_request', 'Corps JSON invalide.');
            }
            sendJson(res, 201, auth.registerClient(body.redirect_uris ?? []));
            return true;
        }
        if (url === '/oauth/authorize' && req.method === 'GET') {
            const q = Object.fromEntries(new URL(req.url ?? '/', 'http://x').searchParams);
            auth.validateAuthorizeRequest(q);
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(authorizeFormHtml(q));
            return true;
        }
        if (url === '/oauth/authorize' && req.method === 'POST') {
            const form = Object.fromEntries(new URLSearchParams(await readBody(req)));
            auth.validateAuthorizeRequest(form);
            // ⚠️ [MCP-CLOUDRUN-AUTH-HARDENING] Plafond AVANT toute comparaison de clé : c'est la
            // seule porte devinable du serveur (voir `mcp/auth/rateLimit.ts` pour le pourquoi du
            // compteur global et de la limite assumée en mémoire).
            if (authorizeLimiter.isBlocked()) {
                const retryAfter = authorizeLimiter.retryAfterSeconds();
                // ⚠️ [finding silent-failure-hunter, PR #566] Un blocage NON TRACÉ rend une attaque
                // invisible — et le runbook de rotation de clé (mcp/README.md) désigne justement
                // « une tentative suspecte dans les logs Cloud Run » comme son déclencheur. Sans
                // cette ligne, la doc décrivait un signal que le code ne produisait pas.
                console.error(
                    `[FinanceAI MCP http] /oauth/authorize BLOQUÉ : quota d'échecs épuisé, `
                    + `réessai dans ${retryAfter} s. Si ce n'est pas toi → runbook de rotation (mcp/README.md).`,
                );
                res.writeHead(429, {
                    'Content-Type': 'text/html; charset=utf-8',
                    'Retry-After': String(retryAfter),
                });
                res.end(authorizeFormHtml(
                    form,
                    `Trop de tentatives échouées. Réessaie dans ${Math.ceil(retryAfter / 60)} minute(s).`,
                ));
                return true;
            }
            let code: string;
            try {
                code = auth.authorize({
                    clientId: form.client_id, redirectUri: form.redirect_uri,
                    codeChallenge: form.code_challenge, accessKey: form.access_key ?? '',
                });
            } catch (err) {
                if (err instanceof OAuthError && err.code === 'access_denied') {
                    authorizeLimiter.recordFailure();
                    // Tracé aussi : un pilonnage se voit à la RÉPÉTITION de cette ligne, pas
                    // seulement au blocage final (qui n'arrive qu'au 8ᵉ échec).
                    console.error('[FinanceAI MCP http] /oauth/authorize : clé d\'accès REFUSÉE.');
                    res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end(authorizeFormHtml(form, 'Clé d’accès invalide — réessaie.'));
                    return true;
                }
                throw err;
            }
            // Succès : l'historique est effacé — l'usage légitime de Marc ne consomme aucun quota.
            authorizeLimiter.reset();
            const target = new URL(form.redirect_uri);
            target.searchParams.set('code', code);
            if (form.state) target.searchParams.set('state', form.state);
            res.writeHead(302, { Location: target.toString() });
            res.end();
            return true;
        }
        if (url === '/oauth/token' && req.method === 'POST') {
            const form = Object.fromEntries(new URLSearchParams(await readBody(req)));
            if (form.grant_type === 'authorization_code') {
                sendJson(res, 200, auth.exchangeCode({
                    code: form.code ?? '', clientId: form.client_id ?? '',
                    clientSecret: form.client_secret, redirectUri: form.redirect_uri ?? '',
                    codeVerifier: form.code_verifier ?? '',
                }));
            } else if (form.grant_type === 'refresh_token') {
                sendJson(res, 200, auth.refreshGrant({
                    refreshToken: form.refresh_token ?? '', clientId: form.client_id ?? '',
                    clientSecret: form.client_secret,
                }));
            } else {
                sendJson(res, 400, { error: 'unsupported_grant_type', error_description: 'authorization_code ou refresh_token.' });
            }
            return true;
        }
        return false;
    };

    const knownEndpoints = [
        '/mcp',
        '/health',
        ...(options.hubToken ? ['/hub/summary'] : []),
        ...(options.refreshSecret ? ['/refresh'] : []),
        ...(options.fintableSyncSecret ? ['/fintable-sync'] : []),
    ];

    // [HUB-REFRESH-CRON] POST /refresh — rafraîchit les prix de marché dans le blob Drive, sans
    // ouvrir l'app. Déclenché par un job planifié EXTERNE (GitHub Actions), authentifié par un
    // secret dédié (Authorization: Bearer). Réponses : 200 { ok:true, saved, refreshed[], skipped[] }
    // au succès ; 200 { ok:false, conflict:true } si l'app a poussé entre-temps (transitoire, le
    // prochain tick réessaie) ; 5xx sur panne RÉELLE (Drive KO, jeton révoqué, coffre chiffré) pour
    // que le cron rougisse au lieu de rester vert sur des prix figés. Ne modifie QUE les cours.
    const handleRefresh = (req: IncomingMessage, res: ServerResponse, refreshSecret: string, finnhubKey?: string): void => {
        if (req.method !== 'POST') {
            sendJson(res, 405, { error: 'POST uniquement.' }, HUB_NO_STORE);
            return;
        }
        const header = req.headers.authorization;
        const provided = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : '';
        if (!provided || !hubTokensMatch(provided, refreshSecret)) {
            sendJson(res, 401, { error: 'Authorization: Bearer absent ou invalide.' }, HUB_NO_STORE);
            return;
        }
        if (finnhubKey) configureMarketDataProvider({ finnhubKey });
        runPriceRefresh(state.store)
            .then((outcome) => sendJson(res, 200, { ok: true, ...outcome }, HUB_NO_STORE))
            .catch((err: unknown) => {
                const reason = err instanceof Error ? err.message : String(err);
                // Conflit OCC (l'app a poussé entre-temps) = TRANSITOIRE, rien d'écrasé → 200 { ok:false,
                // conflict:true } : le prochain tick réessaie, le cron ne doit pas rougir. Toute AUTRE
                // erreur (source non inscriptible, jeton Drive révoqué, coffre chiffré, Drive KO) est une
                // panne RÉELLE → 5xx, pour que le job planifié rougisse et alerte au lieu de rester vert
                // à jamais sur des prix qui ne se rafraîchissent plus (silence = pire que l'erreur).
                if (isStateConflictError(err)) {
                    sendJson(res, 200, { ok: false, conflict: true, error: reason }, HUB_NO_STORE);
                    return;
                }
                console.error('[FinanceAI MCP http] /refresh : échec —', reason);
                sendJson(res, 503, { ok: false, error: reason }, HUB_NO_STORE);
            });
    };

    // [FINTABLE-3] POST /fintable-sync — synchronise transactions/soldes/dettes depuis Fintable dans
    // le blob Drive, sans ouvrir l'app. Déclenché par un cron EXTERNE (Cloud Scheduler), authentifié
    // par un secret DÉDIÉ (distinct de FINANCEAI_REFRESH_SECRET — périmètre différent : celui-ci
    // AUTORISE l'écriture de transactions/soldes réels, pas seulement des cours de marché). Réponses :
    // 200 { ok:true, report } au succès (report = FintableSyncReport, TOUJOURS persisté aussi dans
    // AppState — visible dans l'app sans notification proactive, choix Marc) ; 200 { ok:false,
    // conflict:true } si l'app a poussé entre-temps (transitoire, le prochain tick réessaie) ; 5xx sur
    // panne RÉELLE (Fintable KO/jeton révoqué, Drive KO) pour que le cron rougisse au lieu de rester
    // vert sur une sync qui ne progresse plus.
    const handleFintableSync = (
        req: IncomingMessage, res: ServerResponse, syncSecret: string,
        fintableToken: string | undefined, fintableRoles: FintableMappingConfig['roles'] | undefined,
    ): void => {
        if (req.method !== 'POST') {
            sendJson(res, 405, { error: 'POST uniquement.' }, HUB_NO_STORE);
            return;
        }
        const header = req.headers.authorization;
        const provided = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : '';
        if (!provided || !hubTokensMatch(provided, syncSecret)) {
            sendJson(res, 401, { error: 'Authorization: Bearer absent ou invalide.' }, HUB_NO_STORE);
            return;
        }
        if (!fintableToken) {
            sendJson(res, 503, { ok: false, error: 'FINTABLE_TOKEN absent : sync impossible.' }, HUB_NO_STORE);
            return;
        }
        const client = new FintableClient({ token: fintableToken });
        runFintableSync(state.store, { token: fintableToken, roles: fintableRoles ?? {}, client })
            .then((report) => sendJson(res, 200, { ok: true, report }, HUB_NO_STORE))
            .catch((err: unknown) => {
                const reason = err instanceof Error ? err.message : String(err);
                // Conflit OCC = TRANSITOIRE (cf /refresh) : rien d'écrasé, le prochain tick réessaie.
                if (isStateConflictError(err)) {
                    sendJson(res, 200, { ok: false, conflict: true, error: reason }, HUB_NO_STORE);
                    return;
                }
                console.error('[FinanceAI MCP http] /fintable-sync : échec —', reason);
                sendJson(res, 503, { ok: false, error: reason }, HUB_NO_STORE);
            });
    };

    // [HUB-01] GET /hub/summary — résumé conforme au contrat hub, données réelles.
    //
    // La mécanique (405, jeton comparé en temps constant, `no-store`, validation avant
    // émission) vient de `serveSummary` (`@mokarade/hub-contract/endpoint`), écrite une fois
    // pour toutes les apps. Elle est SANS framework, ce qui est exactement ce qu'il faut
    // ici : ce serveur-ci est un `node:http` nu, pas un route handler Next.
    //
    // ⚠️ DEUX ÉCARTS VOULUS, tous deux préservés :
    //
    // 1. Le 503 « hub désactivé » de `serveSummary` ne peut pas se produire : cette route
    //    n'est CÂBLÉE que si `options.hubToken` existe (voir le routeur plus bas). Sans
    //    jeton, l'URL n'existe pas du tout — 404, et c'est plus discret qu'un 503 qui
    //    confirmerait l'existence du endpoint à qui le sonde.
    // 2. Un échec de lecture d'état renvoie un summary `status: "error"` en **HTTP 200**,
    //    pas un 500 : le widget du hub affiche la panne au lieu de traiter l'app comme
    //    injoignable. `serveSummary` répondrait 500 si son `build` JETAIT — d'où le `catch`
    //    ci-dessous, qui EST le contrat et ne doit pas disparaître.
    const handleHubSummary = (req: IncomingMessage, res: ServerResponse, hubToken: string): void => {
        const jeton = req.headers[HUB_TOKEN_HEADER];
        void serveSummary(
            { method: req.method ?? 'GET', token: typeof jeton === 'string' ? jeton : null },
            {
                expectedToken: hubToken,
                build: () =>
                    state.store
                        .get()
                        .then((appState) => buildHubSummary(appState))
                        .catch((err: unknown) => {
                            const reason = err instanceof Error ? err.message : String(err);
                            console.error('[FinanceAI MCP http] /hub/summary : état indisponible —', reason);
                            return errorHubSummary(reason);
                        }),
            },
        ).then(({ status, headers, body }) => {
            res.writeHead(status, headers);
            res.end(body);
        });
    };

    const server = createHttpServer((req, res) => {
        const url = (req.url ?? '/').split('?')[0];
        if (url === '/health') {
            sendJson(res, 200, { status: 'ok', version: MCP_SERVER_VERSION });
            return;
        }
        if (url === '/hub/summary' && options.hubToken) {
            handleHubSummary(req, res, options.hubToken);
            return;
        }
        if (url === '/refresh' && options.refreshSecret) {
            handleRefresh(req, res, options.refreshSecret, options.finnhubKey);
            return;
        }
        if (url === '/fintable-sync' && options.fintableSyncSecret) {
            handleFintableSync(req, res, options.fintableSyncSecret, options.fintableToken, options.fintableRoles);
            return;
        }
        if (options.auth && (url.startsWith('/oauth/') || url.startsWith('/.well-known/'))) {
            const auth = options.auth;
            handleOAuth(auth, url, req, res)
                .then((handled) => {
                    if (!handled) sendJson(res, 404, { error: 'introuvable' });
                })
                .catch((err: unknown) => {
                    if (err instanceof OAuthError) {
                        sendJson(res, err.status, { error: err.code, error_description: err.message });
                    } else {
                        console.error('[FinanceAI MCP http] Erreur OAuth :', err);
                        if (!res.headersSent) sendJson(res, 500, { error: 'server_error' });
                        else res.end();
                    }
                });
            return;
        }
        if (url === '/mcp') {
            // [MCP-CLOUDRUN-B] garde Bearer AVANT tout traitement (toutes méthodes) ; le
            // WWW-Authenticate pointe la découverte RFC 9728 (flux attendu par claude.ai).
            if (options.auth) {
                try {
                    options.auth.verifyAccessToken(req.headers.authorization);
                } catch (err) {
                    const metaUrl = options.auth.resourceMetadataUrl();
                    res.writeHead(401, {
                        'Content-Type': 'application/json',
                        'WWW-Authenticate': `Bearer resource_metadata="${metaUrl}"`,
                    });
                    res.end(JSON.stringify({
                        jsonrpc: '2.0', id: null,
                        error: { code: -32001, message: err instanceof OAuthError ? err.message : 'Authentification requise.' },
                    }));
                    return;
                }
            }
            handleMcp(req, res).catch((err: unknown) => {
                console.error('[FinanceAI MCP http] Erreur de requête :', err);
                if (!res.headersSent) {
                    if (err instanceof BodyTooLargeError) {
                        sendRpcError(res, 413, -32000, err.message);
                    } else {
                        sendRpcError(res, 500, -32603, 'Erreur interne du serveur MCP.');
                    }
                } else {
                    // Flux déjà entamé : coupure nette assumée — le client MCP traite une fin
                    // de flux comme signal de reconnexion (spec Streamable HTTP).
                    res.end();
                }
            });
            return;
        }
        sendJson(res, 404, { error: 'introuvable', endpoints: knownEndpoints });
    });

    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(options.port, options.host, resolve);
    });
    const address = server.address();
    boundPort = typeof address === 'object' && address ? address.port : options.port;

    const close = async (): Promise<void> => {
        clearInterval(sweeper);
        await Promise.all([...sessions.keys()].map(closeSession));
        server.closeIdleConnections?.();
        // Grâce bornée : une connexion suspendue (requête en vol jamais résolue) bloquerait
        // server.close() À JAMAIS → SIGTERM n'aboutirait pas (SIGKILL Cloud Run). Au-delà du
        // délai, fermeture FORCÉE + log (jamais un blocage silencieux).
        await new Promise<void>((resolve) => {
            const timer = setTimeout(() => {
                console.error(`[FinanceAI MCP http] Arrêt : connexions encore ouvertes après ${CLOSE_GRACE_MS} ms — fermeture forcée.`);
                server.closeAllConnections?.();
            }, CLOSE_GRACE_MS);
            timer.unref();
            server.close(() => {
                clearTimeout(timer);
                resolve();
            });
        });
    };

    return { server, port: boundPort, close };
}

const isDirectRun = process.argv[1]?.endsWith('http.ts') || process.argv[1]?.endsWith('http.js');

if (isDirectRun) {
    const main = async (): Promise<void> => {
        // Cloud Run définit $PORT et exige 0.0.0.0 ; en local, loopback par défaut
        // (ne PAS s'exposer au LAN avant l'auth du Lot 3) + anti-DNS-rebinding.
        const cloudPort = process.env.PORT;
        const port = Number(cloudPort ?? process.env.MCP_HTTP_PORT ?? 8080);
        const host = process.env.MCP_HTTP_HOST ?? (cloudPort ? '0.0.0.0' : '127.0.0.1');
        // La réalité de l'exposition se juge sur le HOST RÉEL, jamais sur $PORT seul
        // (MCP_HTTP_HOST=0.0.0.0 sans $PORT afficherait sinon un « loopback » mensonger — panel).
        const isLoopback = host === '127.0.0.1' || host === 'localhost' || host === '::1';

        // [MCP-CLOUDRUN-B] OAuth 2.1 activé quand les 3 variables sont là (Cloud Run les
        // reçoit de Secret Manager au Lot 4 ; en local elles sont optionnelles — loopback).
        const signingKey = process.env.FINANCEAI_OAUTH_SIGNING_KEY;
        const accessKey = process.env.FINANCEAI_ACCESS_KEY;
        const publicUrl = process.env.FINANCEAI_PUBLIC_URL?.replace(/\/$/, '');
        let auth: OAuthProvider | undefined;
        if (signingKey && accessKey) {
            auth = makeOAuthProvider({
                signingKey, accessKey,
                issuer: publicUrl ?? `http://127.0.0.1:${port}`,
            });
        } else if (signingKey || accessKey) {
            console.error('[FinanceAI MCP http] REFUS de démarrer : FINANCEAI_OAUTH_SIGNING_KEY et FINANCEAI_ACCESS_KEY vont ENSEMBLE (l’un sans l’autre = config incohérente).');
            process.exit(1);
        }
        // Auth active sur un hôte exposé SANS URL publique → les endpoints OAuth annonceraient
        // un issuer loopback que claude.ai ne peut pas atteindre (panne silencieuse — code-reviewer).
        if (auth && !isLoopback && !publicUrl) {
            console.error('[FinanceAI MCP http] REFUS de démarrer : FINANCEAI_PUBLIC_URL requis quand l’auth est active sur un hôte exposé (sinon les URLs OAuth pointent vers le loopback, injoignable par claude.ai).');
            process.exit(1);
        }

        // [HUB-01] jeton du hub perso : optionnel (route désactivée sans lui), mais
        // jamais faible — un jeton court se brute-force, autant refuser de démarrer.
        const hubToken = process.env.FINANCEAI_HUB_TOKEN;
        if (hubToken !== undefined && hubToken.length < 16) {
            console.error('[FinanceAI MCP http] REFUS de démarrer : FINANCEAI_HUB_TOKEN trop court (< 16 caractères).');
            process.exit(1);
        }

        // [HUB-REFRESH-CRON] secret du déclencheur planifié (POST /refresh) : optionnel (route
        // désactivée sans lui), mais jamais faible — il autorise une ÉCRITURE Drive, autant refuser
        // de démarrer plutôt que d'exposer un secret brute-forçable.
        const refreshSecret = process.env.FINANCEAI_REFRESH_SECRET;
        if (refreshSecret !== undefined && refreshSecret.length < 16) {
            console.error('[FinanceAI MCP http] REFUS de démarrer : FINANCEAI_REFRESH_SECRET trop court (< 16 caractères).');
            process.exit(1);
        }
        // Clé Finnhub (env/Secret Manager) : sans elle, /refresh ne rafraîchit que la crypto.
        const finnhubKey = process.env.FINANCEAI_FINNHUB_KEY;

        // [FINTABLE-3] secret du cron Fintable (POST /fintable-sync) : optionnel (route désactivée
        // sans lui), mais jamais faible — il autorise une ÉCRITURE de transactions/soldes réels.
        // DISTINCT de FINANCEAI_REFRESH_SECRET (périmètres différents, rotation indépendante).
        const fintableSyncSecret = process.env.FINANCEAI_FINTABLE_SYNC_SECRET;
        if (fintableSyncSecret !== undefined && fintableSyncSecret.length < 16) {
            console.error('[FinanceAI MCP http] REFUS de démarrer : FINANCEAI_FINTABLE_SYNC_SECRET trop court (< 16 caractères).');
            process.exit(1);
        }
        const fintableToken = process.env.FINTABLE_TOKEN;
        let fintableRoles: FintableMappingConfig['roles'] | undefined;
        if (fintableSyncSecret) {
            const rawRoles = process.env.FINTABLE_ROLES_JSON;
            if (rawRoles) {
                try {
                    fintableRoles = parseRolesJson(rawRoles);
                } catch (err) {
                    console.error(
                        '[FinanceAI MCP http] REFUS de démarrer : FINTABLE_ROLES_JSON invalide —',
                        err instanceof Error ? err.message : String(err),
                    );
                    process.exit(1);
                }
            }
        }

        if (!isLoopback && !auth && process.env.MCP_HTTP_ALLOW_EXPOSED !== '1') {
            console.error(
                `[FinanceAI MCP http] REFUS de démarrer : hôte non-loopback (${host}) SANS authentification — ` +
                'tes données financières seraient lisibles ET modifiables par le réseau. Configure l’OAuth ' +
                '(FINANCEAI_OAUTH_SIGNING_KEY + FINANCEAI_ACCESS_KEY + FINANCEAI_PUBLIC_URL) ou, pour un test ' +
                'en connaissance de cause : MCP_HTTP_ALLOW_EXPOSED=1.',
            );
            process.exit(1);
        }

        const state = await resolveState(process.argv[2]);
        const running = await startHttpServer({
            port, host, state, dnsRebindingProtection: isLoopback, auth, hubToken, refreshSecret, finnhubKey,
            fintableSyncSecret, fintableToken, fintableRoles,
        });

        console.error(`[FinanceAI MCP http] v${MCP_SERVER_VERSION} — écoute http://${host}:${running.port}/mcp (santé : /health)`);
        console.error(`[FinanceAI MCP http] Source d'état : ${state.describe()}`);
        console.error(auth
            ? `[FinanceAI MCP http] Auth OAuth 2.1 ACTIVE (issuer : ${publicUrl ?? 'loopback'}) — /mcp exige un Bearer.`
            : '[FinanceAI MCP http] Auth DÉSACTIVÉE (variables OAuth absentes).');
        console.error(hubToken
            ? '[FinanceAI MCP http] Hub : GET /hub/summary ACTIF (header x-hub-token exigé).'
            : '[FinanceAI MCP http] Hub : /hub/summary désactivé (FINANCEAI_HUB_TOKEN absent).');
        console.error(refreshSecret
            ? `[FinanceAI MCP http] Refresh planifié : POST /refresh ACTIF (Bearer exigé)${finnhubKey ? '' : ' — SANS clé Finnhub : seule la crypto sera rafraîchie'}.`
            : '[FinanceAI MCP http] Refresh planifié : /refresh désactivé (FINANCEAI_REFRESH_SECRET absent).');
        console.error(fintableSyncSecret
            ? `[FinanceAI MCP http] Sync Fintable planifiée : POST /fintable-sync ACTIF (Bearer exigé)${fintableToken ? '' : ' — SANS FINTABLE_TOKEN : chaque appel échouera 503'}${fintableRoles ? '' : ' — SANS rôles de comptes (FINTABLE_ROLES_JSON absent) : aucun compte ne sera reconnu'}.`
            : '[FinanceAI MCP http] Sync Fintable planifiée : /fintable-sync désactivé (FINANCEAI_FINTABLE_SYNC_SECRET absent).');
        if (isLoopback) {
            console.error('[FinanceAI MCP http] Mode LOCAL : loopback seulement, anti-DNS-rebinding actif.');
        } else if (!auth) {
            console.error(`[FinanceAI MCP http] ⚠️⚠️ EXPOSÉ sur ${host} SANS AUTHENTIFICATION — données financières accessibles au réseau. Réservé aux tests.`);
        }

        const shutdown = (signal: string): void => {
            console.error(`[FinanceAI MCP http] ${signal} reçu — arrêt propre…`);
            running.close().then(() => process.exit(0)).catch(() => process.exit(1));
        };
        process.on('SIGTERM', () => shutdown('SIGTERM')); // Cloud Run
        process.on('SIGINT', () => shutdown('SIGINT'));
    };

    main().catch((err) => {
        console.error('[FinanceAI MCP http] Erreur fatale :', err);
        process.exit(1);
    });
}
