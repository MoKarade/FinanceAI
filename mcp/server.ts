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
import { registerApplyPayslip } from './tools/applyPayslip.tool';
import { registerApplyBankStatement } from './tools/applyBankStatement.tool';
import { registerApplyBrokerStatement } from './tools/applyBrokerStatement.tool';
import { registerApplyTaxSlip } from './tools/applyTaxSlip.tool';
import type { StateProvider } from './tools/_dataAware';
import type { StateStore } from './state/stateStore';

export interface CreateServerOptions {
    /**
     * Fournit l'AppState reel de l'utilisateur aux tools data-aware. Optionnel :
     * absent => les tools data-aware repondent une erreur claire (« configure ta
     * source d'etat »), les tools sans etat restent utilisables.
     */
    getState?: StateProvider;
    /**
     * Magasin d'etat INSCRIPTIBLE (Lot 2). Si fourni, expose les tools d'ECRITURE
     * (apply_payslip, …) qui modifient l'etat reel (avec sauvegarde horodatee).
     * Absent => aucun tool d'ecriture (le connecteur reste en lecture seule).
     */
    store?: StateStore;
}

export const createServer = (options: CreateServerOptions = {}): McpServer => {
    const server = new McpServer({
        name: 'financeai-mcp',
        version: '0.4.0',
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

    // Tools d'ECRITURE (Lot 2) — uniquement si un magasin inscriptible est fourni.
    // Le tool verifie lui-meme canWrite et renvoie une erreur claire si lecture seule.
    if (options.store) {
        registerApplyPayslip(server, options.store);
        registerApplyBankStatement(server, options.store);
        registerApplyBrokerStatement(server, options.store);
        registerApplyTaxSlip(server, options.store);
    }

    return server;
};
