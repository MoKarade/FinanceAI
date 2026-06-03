#!/usr/bin/env node
// Entree stdio pour developpement local.
// Lancement : npm run mcp:dev (ou directement via tsx mcp/stdio.ts)
//
// La source d'etat (tools data-aware, Lot 1) est resolue depuis :
//   1. le 1er argument CLI (chemin de fichier), sinon
//   2. la variable d'environnement FINANCEAI_STATE_FILE.
// Absente => les tools data-aware repondent une erreur claire ; les tools sans
// etat (ping, get_tax_room, calculate_real_estate, run_projection) marchent quand meme.
//
// stdout est reserve au protocole MCP. Tous les logs doivent passer par stderr
// (console.error) sinon le client MCP n'arrive plus a parser les messages.

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server';
import { resolveDefaultStateSource, STATE_FILE_ENV } from './state/loadAppState';
import { makeStateProvider } from './state/stateProvider';

const main = async (): Promise<void> => {
    const explicitPath = process.argv[2];
    const source = resolveDefaultStateSource(explicitPath);
    const getState = makeStateProvider(source);

    const server = createServer({ getState });
    const transport = new StdioServerTransport();
    await server.connect(transport);

    if (source) {
        console.error(`[FinanceAI MCP] Etat charge depuis : ${source.description}`);
    } else {
        console.error(
            `[FinanceAI MCP] Aucune source d'etat ($${STATE_FILE_ENV} non defini) — ` +
            'tools data-aware indisponibles tant qu\'un export JSON n\'est pas fourni.',
        );
    }
    console.error('[FinanceAI MCP] Server connected via stdio (v0.2.0)');
};

main().catch((err) => {
    console.error('[FinanceAI MCP] Fatal error:', err);
    process.exit(1);
});
