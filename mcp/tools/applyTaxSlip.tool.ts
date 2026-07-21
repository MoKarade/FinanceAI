// mcp/tools/applyTaxSlip.tool.ts
// [ARCH-AITOOLS-SPLIT] Enregistrement serveur MCP MINCE — schéma/description/toDocument vivent
// dans le .spec (browser-safe) ; la persistance serveur (OCC + backup) reste dans runApply.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { applyTaxSlipSpec as spec } from './applyTaxSlip.spec';
import { runApply } from './_writeHelper';
import type { ToolTextResult } from './_dataAware';
import type { StateStore } from '../state/stateStore';

export const registerApplyTaxSlip = (server: McpServer, store: StateStore): void => {
    server.tool(spec.name, spec.description, spec.inputSchema, async (args): Promise<ToolTextResult> =>
        runApply(store, spec.toDocument(args)));
};
