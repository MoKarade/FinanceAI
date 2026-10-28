// mcp/http/plomberie.ts
// [GODFILE-MCPHTTP] Plomberie transport du serveur HTTP MCP — lecture de corps PLAFONNÉE,
// réponses JSON, erreurs JSON-RPC, comparaison de jetons en temps constant. Extraite telle
// quelle de `mcp/http.ts` ; c'est la couche que l'audit sécurité relit en premier.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';

/** Cap du corps de requête : largement suffisant pour du JSON-RPC MCP, borne l'OOM (mesuré : RSS ~7× la taille du corps). */
const MAX_BODY_BYTES = 5 * 1024 * 1024;

export class BodyTooLargeError extends Error {
    constructor() { super(`Corps de requête > ${MAX_BODY_BYTES} octets.`); }
}

/** Lit le corps en le PLAFONNANT (413 sinon) et en rejetant si la connexion coupe avant la fin
 *  (sans ça, la Promise resterait pendante à jamais — fuite de handlers, prouvé par le panel). */
export function readBody(req: IncomingMessage): Promise<string> {
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

export function sendJson(
    res: ServerResponse,
    status: number,
    payload: unknown,
    extraHeaders: Record<string, string> = {},
): void {
    res.writeHead(status, { 'Content-Type': 'application/json', ...extraHeaders });
    res.end(JSON.stringify(payload));
}

/** [HUB-01] un summary est un instantané : jamais mis en cache (contrat hub). */
export const HUB_NO_STORE = { 'Cache-Control': 'no-store' } as const;

/** [HUB-01] comparaison en temps constant (via digests de longueur fixe — timingSafeEqual
 *  exige des buffers de même taille, un secret de longueur différente ne doit pas fuiter). */
export function hubTokensMatch(provided: string, expected: string): boolean {
    const a = createHash('sha256').update(provided).digest();
    const b = createHash('sha256').update(expected).digest();
    return timingSafeEqual(a, b);
}

/** Erreur JSON-RPC (forme attendue par un client MCP, id null = hors requête identifiable). */
export function sendRpcError(res: ServerResponse, status: number, code: number, message: string): void {
    sendJson(res, status, { jsonrpc: '2.0', error: { code, message }, id: null });
}
