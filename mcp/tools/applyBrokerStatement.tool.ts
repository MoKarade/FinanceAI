// mcp/tools/applyBrokerStatement.tool.ts
// Lot 2 — écriture : met à jour/ajoute les positions d'un relevé de courtage.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runApply } from './_writeHelper';
import type { ToolTextResult } from './_dataAware';
import type { StateStore } from '../state/stateStore';

const inputSchema = {
    accountType: z.enum(['NON-ENREG', 'CELI', 'REER', 'CELIAPP', 'CRYPTO']).optional()
        .describe('Compte fiscal des positions (défaut: NON-ENREG).'),
    holdings: z.array(z.object({
        symbol: z.string().describe('Ticker (ex: AAPL, XEQT.TO, BTC).'),
        quantity: z.number().describe('Nombre de parts/unités détenues.'),
        currentPrice: z.number().optional().describe('Prix actuel par part, si indiqué sur le relevé.'),
        name: z.string().optional().describe('Nom du titre.'),
        currency: z.enum(['USD', 'CAD', 'EUR']).optional().describe('Devise (défaut: CAD).'),
    })).describe('Positions extraites du relevé de courtage.'),
};

export const registerApplyBrokerStatement = (server: McpServer, store: StateStore): void => {
    server.tool(
        'apply_broker_statement',
        "ÉCRIT dans l'état FinanceAI : met à jour les quantités/prix des positions d'un relevé de " +
        'courtage (ajoute celles qui manquent, par symbole + compte). Sauvegarde horodatée avant ' +
        "écriture ; renvoie le nombre mis à jour / ajouté. N'invente rien : seulement ce qui figure sur le relevé.",
        inputSchema,
        async (args): Promise<ToolTextResult> => runApply(store, { kind: 'broker_statement', ...args }),
    );
};
