// Registry des tools MCP exposes par FinanceAI.
// Construit a partir des services purs (services/tax, services/realEstate, etc.)
// et de l'adaptateur pur AppState -> SimulationParams (Lot 0).
// Aucune dependance React, importable depuis stdio (Node local) ou HTTP (Netlify).
//
// Deux familles de tools :
//   - SANS ETAT (calculatrice) : ping, get_tax_room, calculate_real_estate,
//     run_projection — prennent tous leurs parametres en entree.
//   - DATA-AWARE (Lot 1) : get_financial_overview, get_projection,
//     get_tax_situation, get_retirement_outlook, get_next_best_actions,
//     search_transactions — lisent l'AppState REEL de l'utilisateur via un
//     StateProvider injecte (fichier local en stdio ; Drive en Lot 3).

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPingTool } from './tools/ping.tool';
import { registerGetTaxRoom } from './tools/getTaxRoom.tool';
import { registerCalculateRealEstate } from './tools/calculateRealEstate.tool';
import { registerRunProjection } from './tools/runProjection.tool';
import { registerGetFinancialOverview } from './tools/getFinancialOverview.tool';
import { registerGetProjection } from './tools/getProjection.tool';
import { registerGetTaxSituation } from './tools/getTaxSituation.tool';
import { registerGetRetirementOutlook } from './tools/getRetirementOutlook.tool';
import { registerGetNextBestActions } from './tools/getNextBestActions.tool';
import { registerSearchTransactions } from './tools/searchTransactions.tool';
import type { StateProvider } from './tools/_dataAware';

export interface CreateServerOptions {
    /**
     * Fournit l'AppState reel de l'utilisateur aux tools data-aware. Optionnel :
     * absent => les tools data-aware repondent une erreur claire (« configure ta
     * source d'etat »), les tools sans etat restent utilisables.
     */
    getState?: StateProvider;
}

export const createServer = (options: CreateServerOptions = {}): McpServer => {
    const server = new McpServer({
        name: 'financeai-mcp',
        version: '0.2.0',
    });

    // Tools sans etat (calculatrice conversationnelle) — conserves tels quels.
    registerPingTool(server);
    registerGetTaxRoom(server);
    registerCalculateRealEstate(server);
    registerRunProjection(server);

    // Tools data-aware (Lot 1) — branches sur l'etat reel via getState. Si aucun
    // provider n'est fourni, on installe un provider qui explique comment en
    // configurer un (plutot que d'omettre les tools, pour qu'ils soient visibles).
    const getState: StateProvider = options.getState ?? (async () => {
        throw new Error(
            "Aucune source d'etat configuree. Lance le serveur avec $FINANCEAI_STATE_FILE pointant " +
            "vers un export JSON de ton etat FinanceAI.",
        );
    });
    registerGetFinancialOverview(server, getState);
    registerGetProjection(server, getState);
    registerGetTaxSituation(server, getState);
    registerGetRetirementOutlook(server, getState);
    registerGetNextBestActions(server, getState);
    registerSearchTransactions(server, getState);

    return server;
};
