// mcp/tools/applyBankStatement.tool.ts
// Lot 2 — écriture : ajoute les transactions d'un relevé bancaire (dédup automatique).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runApply } from './_writeHelper';
import type { ToolTextResult } from './_dataAware';
import type { StateStore } from '../state/stateStore';

const inputSchema = {
    accountName: z.string().optional().describe('Nom du compte (ex: « Chèque RBC »).'),
    transactions: z.array(z.object({
        date: z.string().describe('Date ISO (YYYY-MM-DD).'),
        payee: z.string().describe('Marchand / description.'),
        amount: z.number().describe('Montant SIGNÉ : négatif = dépense, positif = entrée.'),
        category: z.string().optional().describe('Catégorie (ex: Alimentation, Transport).'),
        isTransfer: z.boolean().optional().describe('Vrai si c\'est un virement interne.'),
    })).describe('Transactions extraites du relevé.'),
};

export const registerApplyBankStatement = (server: McpServer, store: StateStore): void => {
    server.tool(
        'apply_bank_statement',
        "ÉCRIT dans l'état FinanceAI : ajoute les transactions d'un relevé bancaire que TU as déjà " +
        'extrait. DÉDUP automatique : une transaction identique (date + montant + marchand) n\'est pas ' +
        'ré-ajoutée. Montants SIGNÉS (négatif = dépense). Sauvegarde horodatée avant écriture ; renvoie ' +
        "le nombre ajouté / ignoré. N'invente rien : seulement ce qui figure sur le relevé.",
        inputSchema,
        async (args): Promise<ToolTextResult> => runApply(store, { kind: 'bank_statement', ...args }),
    );
};
