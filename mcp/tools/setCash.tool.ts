// mcp/tools/setCash.tool.ts
// [MCP-DIRECT-EDIT] Enregistrement serveur MCP MINCE — schéma/description/toDocument vivent dans le
// .spec (browser-safe) ; la persistance serveur (OCC + backup) reste dans runApply.
// ⚠️ Confirmation à 2 temps (demande Marc « confirmation ») : sans `confirm:true`, runApply renvoie un
// APERÇU (diff avant→après) SANS écrire ; l'IA le montre à l'utilisateur puis rappelle avec confirm:true.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { setCashSpec as spec } from './setCash.spec';
import { runApply } from './_writeHelper';
import type { ToolTextResult } from './_dataAware';
import type { StateStore } from '../state/stateStore';

export const registerSetCash = (server: McpServer, store: StateStore): void => {
    server.tool(spec.name, spec.description, spec.inputSchema, async (args): Promise<ToolTextResult> =>
        runApply(store, spec.toDocument(args), { requireConfirm: true, confirmed: args.confirm === true }));
};
