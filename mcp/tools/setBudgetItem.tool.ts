// mcp/tools/setBudgetItem.tool.ts
// [MCP-CONFIRM-TOKEN] Enregistrement serveur MCP MINCE : schema/description/toDocument vivent dans le .spec
// (browser-safe) ; confirmation a deux temps liee cote serveur + persistance (OCC + sauvegarde) dans
// registerWriteTool -> runApply. Ne JAMAIS rappeler runApply directement ici (garde de test).
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { setBudgetItemSpec as spec } from './setBudgetItem.spec';
import { registerWriteTool } from './_writeTool';
import type { ConfirmVault } from './confirmVault';
import type { StateStore } from '../state/stateStore';

export const registerSetBudgetItem = (server: McpServer, store: StateStore, vault?: ConfirmVault): void =>
    registerWriteTool(server, store, spec, vault);
