// tests/mcp/_ecritureMcp.ts
//
// [MCP-CONFIRM-TOKEN] Outillage de test commun pour les outils d'ÉCRITURE du serveur MCP : capture du handler
// enregistré (le SDK reçoit maintenant des annotations : le handler est le DERNIER argument de `server.tool`)
// et déroulé du protocole à deux temps (aperçu → jeton → rappel avec les mêmes arguments + jeton).
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { StateStore } from '../../mcp/state/stateStore';

export interface ToolResult { content: Array<{ type: string; text: string }>; isError?: boolean }
export type Handler = (a: Record<string, unknown>, extra?: { sessionId?: string }) => Promise<ToolResult>;

/** Enregistre l'outil sur un faux serveur et rend son handler (le coffre de jetons vit avec ce handler). */
export function capturer(register: (s: McpServer, st: StateStore) => void, store: StateStore): Handler {
    let cap: Handler | null = null;
    const fake = {
        tool: (..._a: unknown[]) => { cap = _a[_a.length - 1] as Handler; },
    } as unknown as McpServer;
    register(fake, store);
    if (!cap) throw new Error('aucun handler capturé');
    return cap;
}

/** Aperçu → si le serveur émet un jeton, rappel avec les MÊMES arguments + jeton ; sinon renvoie la 1re réponse. */
export async function confirmer(h: Handler, args: Record<string, unknown>, extra?: { sessionId?: string }): Promise<ToolResult> {
    const first = await h(args, extra);
    const parsed = first.isError ? null : (JSON.parse(first.content[0].text) as { confirmToken?: string });
    if (!parsed?.confirmToken) return first;
    return h({ ...args, confirmToken: parsed.confirmToken }, extra);
}
