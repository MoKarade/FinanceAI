#!/usr/bin/env node
// mcp/http.ts
//
// [MCP-CLOUDRUN-HTTP] — entrée Streamable HTTP du serveur MCP FinanceAI.
// Lancement : npm run mcp:http (local, 127.0.0.1:8080) ; sur Cloud Run, $PORT
// est défini par la plateforme → écoute 0.0.0.0:$PORT (exigence Cloud Run).
// Le mode stdio (mcp/stdio.ts, npm run mcp:dev) reste inchangé pour le local.
//
// [GODFILE-MCPHTTP] Découpé pour l'auditabilité sécurité : la plomberie transport
// (readBody plafonné, réponses JSON, comparaison en temps constant) vit dans
// `http/plomberie.ts`, le flux OAuth 2.1 dans `http/oauth.ts`, les routes
// planifiées (/refresh, /fintable-sync) et /hub/summary dans
// `http/routesPlanifiees.ts`. Ce fichier reste l'ENTRÉE : options, sessions MCP,
// routeur, refus de démarrage (main).
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
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createServer as createMcpServer } from './server';
import { MCP_SERVER_VERSION, resolveState, type ResolvedState } from './bootstrap';
import { makeOAuthProvider, OAuthError, type OAuthProvider } from './auth/oauthProvider';
import { makeAttemptLimiter } from './auth/rateLimit';
import type { FintableMappingConfig } from '../services/fintable/mapSnapshot';
import { parseRolesJson } from '../services/fintable/rolesConfig';
import { BodyTooLargeError, readBody, sendJson, sendRpcError } from './http/plomberie';
import { handleOAuth } from './http/oauth';
import { handleFintableSync, handleHubSummary, handleRefresh } from './http/routesPlanifiees';

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

    const knownEndpoints = [
        '/mcp',
        '/health',
        ...(options.hubToken ? ['/hub/summary'] : []),
        ...(options.refreshSecret ? ['/refresh'] : []),
        ...(options.fintableSyncSecret ? ['/fintable-sync'] : []),
    ];

    const server = createHttpServer((req, res) => {
        const url = (req.url ?? '/').split('?')[0];
        if (url === '/health') {
            sendJson(res, 200, { status: 'ok', version: MCP_SERVER_VERSION });
            return;
        }
        if (url === '/hub/summary' && options.hubToken) {
            handleHubSummary(req, res, state.store, options.hubToken);
            return;
        }
        if (url === '/refresh' && options.refreshSecret) {
            handleRefresh(req, res, state.store, options.refreshSecret, options.finnhubKey);
            return;
        }
        if (url === '/fintable-sync' && options.fintableSyncSecret) {
            handleFintableSync(req, res, state.store, options.fintableSyncSecret, options.fintableToken, options.fintableRoles);
            return;
        }
        if (options.auth && (url.startsWith('/oauth/') || url.startsWith('/.well-known/'))) {
            const auth = options.auth;
            handleOAuth(auth, authorizeLimiter, url, req, res)
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
