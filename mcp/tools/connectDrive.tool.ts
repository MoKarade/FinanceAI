// mcp/tools/connectDrive.tool.ts
//
// Lot 3 — autorisation Google Drive DANS la conversation (pour le bundle .mcpb, sans terminal).
// L'utilisateur dit « connecte mes finances » → Claude appelle ce tool → consentement dans le
// navigateur (client OAuth FinanceAI PARTAGÉ) → refresh token stocké localement. Toujours exposé
// (c'est l'amorçage : il configure la source que les autres tools utiliseront après redémarrage).

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { jsonContent, errorContent, type ToolTextResult } from './_dataAware';
import { loadCredentials } from '../drive/tokenStore';
import { resolveSharedClient } from '../drive/sharedClient';
import { runLoopbackAuth } from '../drive/loopbackAuth';

export const registerConnectDrive = (server: McpServer): void => {
    server.tool(
        'connect_drive',
        'Connecte (autorise) le Google Drive de l\'utilisateur pour que tu puisses LIRE ses finances et ' +
        'y RANGER ses documents. Ouvre une page de consentement Google dans son navigateur. À utiliser ' +
        'UNE fois quand l\'utilisateur veut connecter ses finances et que ce n\'est pas encore fait.',
        {},
        async (): Promise<ToolTextResult> => {
            if (await loadCredentials()) {
                return jsonContent({ connected: true, message: 'Déjà connecté à ton Google Drive.' });
            }
            const client = resolveSharedClient();
            if (!client) {
                return errorContent(
                    "Le connecteur n'a pas de client OAuth FinanceAI configuré (connector-client.json absent du bundle).",
                );
            }
            try {
                await runLoopbackAuth(client);
                return jsonContent({
                    connected: true,
                    message:
                        'Google Drive connecté ! Redémarre Claude Desktop, puis pose-moi des questions sur tes ' +
                        'finances ou envoie-moi un document à ranger.',
                });
            } catch (e) {
                return errorContent(`Connexion Drive échouée : ${e instanceof Error ? e.message : String(e)}`);
            }
        },
    );
};
