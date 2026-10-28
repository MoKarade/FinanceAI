// mcp/tools/runProjection.tool.ts
// [ARCH-AITOOLS-SPLIT] Enregistrement serveur MCP MINCE — la logique vit dans le .spec (browser-safe).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { runProjectionSpec as spec } from './runProjection.spec';
import { NO_STATE } from './_toolSpec';

export const registerRunProjection = (server: McpServer): void => {
  server.tool(spec.name, spec.description, spec.inputSchema, async (args) =>
    spec.handler(args, NO_STATE));
};
