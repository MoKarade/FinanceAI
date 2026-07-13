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
//   - GET /health          : 200 {"status":"ok"} (sonde Cloud Run).
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

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
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

    const server = createHttpServer((req, res) => {
        const url = (req.url ?? '/').split('?')[0];
        if (url === '/health') {
            sendJson(res, 200, { status: 'ok', version: MCP_SERVER_VERSION });
            return;
        }
        if (url === '/mcp') {
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
        sendJson(res, 404, { error: 'introuvable', endpoints: ['/mcp', '/health'] });
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

        if (!isLoopback && !cloudPort && process.env.MCP_HTTP_ALLOW_EXPOSED !== '1') {
            console.error(
                `[FinanceAI MCP http] REFUS de démarrer : hôte non-loopback (${host}) SANS authentification ` +
                '(le Lot 3 OAuth n’est pas livré) — tes données financières seraient lisibles ET modifiables ' +
                'par le réseau. Pour forcer en connaissance de cause : MCP_HTTP_ALLOW_EXPOSED=1.',
            );
            process.exit(1);
        }

        const state = await resolveState(process.argv[2]);
        const running = await startHttpServer({ port, host, state, dnsRebindingProtection: isLoopback });

        console.error(`[FinanceAI MCP http] v${MCP_SERVER_VERSION} — écoute http://${host}:${running.port}/mcp (santé : /health)`);
        console.error(`[FinanceAI MCP http] Source d'état : ${state.describe()}`);
        if (isLoopback) {
            console.error('[FinanceAI MCP http] Mode LOCAL : loopback seulement, anti-DNS-rebinding actif. ⚠️ Pas d’auth avant le Lot 3 — ne pas exposer.');
        } else {
            console.error(`[FinanceAI MCP http] ⚠️⚠️ EXPOSÉ sur ${host} SANS AUTHENTIFICATION — données financières accessibles au réseau. Réservé à Cloud Run/tests.`);
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
