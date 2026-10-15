import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/** [MCP-ACCESS-KEY-MIN] `cleAccesFaible` : la clé d'accès du serveur fait moins de 32 caractères. Seul l'ÉTAT est publié
 *  (ni la clé, ni sa longueur) et `ping` n'est joignable qu'avec un jeton OAuth valide : Marc le voit, pas un scanneur. */
export const CLE_FAIBLE_PING =
  " ⚠️ Clé d'accès faible : régénère FINANCEAI_ACCESS_KEY (64 caractères hex) puis active FINANCEAI_ACCESS_KEY_STRICT=1 (docs/A_FAIRE_MOI.md).";

export const registerPingTool = (server: McpServer, etat: { cleAccesFaible?: boolean } = {}): void => {
  server.tool(
    'ping',
    'Health check du serveur MCP. Renvoie "pong" avec un timestamp ISO. Utile pour verifier la connectivite.',
    {},
    async () => ({
      content: [{
        type: 'text',
        text: `pong ${new Date().toISOString()}${etat.cleAccesFaible ? CLE_FAIBLE_PING : ''}`,
      }],
    }),
  );
};
