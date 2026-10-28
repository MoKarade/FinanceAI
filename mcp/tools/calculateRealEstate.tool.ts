// mcp/tools/calculateRealEstate.tool.ts
// [ARCH-AITOOLS-SPLIT] Enregistrement serveur MCP MINCE — la logique vit dans le .spec (browser-safe).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { calculateRealEstateSpec as spec } from './calculateRealEstate.spec';
import { NO_STATE } from './_toolSpec';

export const registerCalculateRealEstate = (server: McpServer): void => {
  server.tool(spec.name, spec.description, spec.inputSchema, async (args) =>
    spec.handler(args, NO_STATE));
};
