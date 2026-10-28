// mcp/tools/getFinancialOverview.tool.ts
// [ARCH-AITOOLS-SPLIT] Enregistrement serveur MCP MINCE — la logique vit dans le .spec (browser-safe).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getFinancialOverviewSpec as spec } from './getFinancialOverview.spec';
import type { StateProvider } from './_dataAware';

export const registerGetFinancialOverview = (server: McpServer, getState: StateProvider): void => {
    server.tool(spec.name, spec.description, spec.inputSchema, async (args) =>
        spec.handler(args, getState));
};
