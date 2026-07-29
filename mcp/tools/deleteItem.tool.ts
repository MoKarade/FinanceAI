// mcp/tools/deleteItem.tool.ts
// [MCP-DIRECT-EDIT Lots 4-5] Enregistrement serveur MCP MINCE — schéma/description/toDocument vivent
// dans le .spec (browser-safe) ; la persistance serveur (OCC + backup) reste dans runApply.
// Confirmation à 2 temps STRICTE (geste destructif) : sans `confirm:true`, APERÇU sans suppression.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { deleteItemSpec as spec } from './deleteItem.spec';
import { runApply } from './_writeHelper';
import type { ToolTextResult } from './_dataAware';
import type { StateStore } from '../state/stateStore';

export const registerDeleteItem = (server: McpServer, store: StateStore): void => {
    server.tool(spec.name, spec.description, spec.inputSchema, async (args): Promise<ToolTextResult> =>
        runApply(store, spec.toDocument(args), { requireConfirm: true, confirmed: args.confirm === true }));
};
