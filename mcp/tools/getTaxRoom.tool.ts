// mcp/tools/getTaxRoom.tool.ts
// [ARCH-AITOOLS-SPLIT] Enregistrement serveur MCP MINCE — la logique vit dans le .spec (browser-safe).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getTaxRoomSpec as spec } from './getTaxRoom.spec';
import { NO_STATE } from './_toolSpec';

export const registerGetTaxRoom = (server: McpServer): void => {
  server.tool(spec.name, spec.description, spec.inputSchema, async (args) =>
    spec.handler(args, NO_STATE));
};
