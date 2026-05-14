#!/usr/bin/env node
// Entree stdio pour developpement local.
// Lancement : npm run mcp:dev (ou directement via tsx mcp/stdio.ts)
//
// stdout est reserve au protocole MCP. Tous les logs doivent passer par stderr
// (console.error) sinon le client MCP n'arrive plus a parser les messages.

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server';

const main = async (): Promise<void> => {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[FinanceAI MCP] Server connected via stdio (v0.1.0)');
};

main().catch((err) => {
  console.error('[FinanceAI MCP] Fatal error:', err);
  process.exit(1);
});
