import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export const registerPingTool = (server: McpServer): void => {
  server.tool(
    'ping',
    'Health check du serveur MCP. Renvoie "pong" avec un timestamp ISO. Utile pour verifier la connectivite.',
    {},
    async () => ({
      content: [{
        type: 'text',
        text: `pong ${new Date().toISOString()}`,
      }],
    }),
  );
};
