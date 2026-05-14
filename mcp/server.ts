// Registry des tools MCP exposes par FinanceAI.
// Construit a partir des services purs (services/tax, services/realEstate, etc.).
// Aucune dependance React, importable depuis stdio (Node local) ou HTTP (Netlify).

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPingTool } from './tools/ping.tool';
import { registerGetTaxRoom } from './tools/getTaxRoom.tool';
import { registerCalculateRealEstate } from './tools/calculateRealEstate.tool';
import { registerRunProjection } from './tools/runProjection.tool';

export const createServer = (): McpServer => {
  const server = new McpServer({
    name: 'financeai-mcp',
    version: '0.1.0',
  });

  registerPingTool(server);
  registerGetTaxRoom(server);
  registerCalculateRealEstate(server);
  registerRunProjection(server);

  return server;
};
