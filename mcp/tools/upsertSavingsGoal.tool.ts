// mcp/tools/upsertSavingsGoal.tool.ts
// [MCP-DIRECT-EDIT Lot 3] Enregistrement serveur MCP MINCE — schéma/description/toDocument vivent dans
// le .spec (browser-safe) ; la persistance serveur (OCC + backup) reste dans runApply.
// Confirmation à 2 temps : sans `confirm:true`, runApply renvoie un APERÇU sans écrire.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { upsertSavingsGoalSpec as spec } from './upsertSavingsGoal.spec';
import { runApply } from './_writeHelper';
import type { ToolTextResult } from './_dataAware';
import type { StateStore } from '../state/stateStore';

export const registerUpsertSavingsGoal = (server: McpServer, store: StateStore): void => {
    server.tool(spec.name, spec.description, spec.inputSchema, async (args): Promise<ToolTextResult> =>
        runApply(store, spec.toDocument(args), { requireConfirm: true, confirmed: args.confirm === true }));
};
