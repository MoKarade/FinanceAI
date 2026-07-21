// mcp/tools/getHoldings.tool.ts
// [ARCH-AITOOLS-SPLIT] Enregistrement serveur MCP MINCE — la logique vit dans le .spec (browser-safe).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getHoldingsSpec as spec } from './getHoldings.spec';
import type { StateProvider } from './_dataAware';

export const registerGetHoldings = (server: McpServer, getState: StateProvider): void => {
    server.tool(spec.name, spec.description, spec.inputSchema, async (args) =>
        spec.handler(args, getState));
};
