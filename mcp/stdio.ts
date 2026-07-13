#!/usr/bin/env node
// Entree stdio pour developpement local.
// Lancement : npm run mcp:dev (ou directement via tsx mcp/stdio.ts)
//
// La source d'etat est resolue dans cet ordre :
//   1. Google Drive (auto-sync) si le connecteur a ete autorise (npm run mcp:auth) — meme blob que l'app,
//   2. sinon un FICHIER local : 1er argument CLI, sinon $FINANCEAI_STATE_FILE.
// Absente => les tools data-aware/d'ecriture repondent une erreur claire ; les tools sans etat marchent.
//
// stdout est reserve au protocole MCP. Tous les logs doivent passer par stderr
// (console.error) sinon le client MCP n'arrive plus a parser les messages.

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server';
import { STATE_FILE_ENV } from './state/loadAppState';
import { MCP_SERVER_VERSION, resolveState } from './bootstrap';

const main = async (): Promise<void> => {
    // [MCP-CLOUDRUN-HTTP] résolution de la source PARTAGÉE avec l'entrée HTTP (mcp/bootstrap.ts).
    const { source, store, isDrive, describe } = await resolveState(process.argv[2]);

    const server = createServer({ getState: store.get, store });
    const transport = new StdioServerTransport();
    await server.connect(transport);

    if (isDrive) {
        console.error(
            `[FinanceAI MCP] Source : ${describe()}. ` +
            'Lecture + ecriture (apply_*) sur le meme blob que l\'app.',
        );
    } else if (source) {
        console.error(`[FinanceAI MCP] Etat charge depuis : ${source.description}`);
        console.error(
            store.canWrite
                ? '[FinanceAI MCP] Ecriture activee (tools apply_* — sauvegarde horodatee avant chaque ecriture).'
                : '[FinanceAI MCP] Source en lecture seule — tools d\'ecriture indisponibles.',
        );
        console.error('[FinanceAI MCP] (Astuce : npm run mcp:auth pour la synchro AUTO avec Drive.)');
    } else {
        console.error(
            `[FinanceAI MCP] Aucune source d'etat ($${STATE_FILE_ENV} non defini, ni autorisation Drive) — ` +
            'lance npm run mcp:auth (Drive) ou fournis un export JSON.',
        );
    }
    console.error(`[FinanceAI MCP] Server connected via stdio (v${MCP_SERVER_VERSION})`);
};

main().catch((err) => {
    console.error('[FinanceAI MCP] Fatal error:', err);
    process.exit(1);
});
