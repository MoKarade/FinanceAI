// mcp/tools/searchTransactions.tool.ts
// Lot 1 — recherche dans les VRAIES transactions de l'utilisateur (filtre pur).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AppState } from '../../types';
import { searchTransactions } from '../../services/transactionsSearch';
import { jsonContent, withState, type StateProvider } from './_dataAware';

const inputSchema = {
    query: z.string().optional()
        .describe('Texte libre (marchand ou catégorie), casse-insensible. Ex: "épicerie", "Hydro".'),
    category: z.string().optional().describe('Filtre par catégorie exacte.'),
    minAmount: z.number().optional().describe('Montant minimum signé (dépenses négatives).'),
    maxAmount: z.number().optional().describe('Montant maximum signé.'),
    fromDate: z.string().optional().describe('Date de début incluse (YYYY-MM-DD).'),
    toDate: z.string().optional().describe('Date de fin incluse (YYYY-MM-DD).'),
    includeTransfers: z.boolean().default(false).describe('Inclure les virements/transferts.'),
    limit: z.number().int().min(1).max(200).default(50).describe('Nombre max de transactions renvoyées.'),
};

export const registerSearchTransactions = (server: McpServer, getState: StateProvider): void => {
    server.tool(
        'search_transactions',
        "Recherche et agrège les VRAIES transactions de l'utilisateur (lues depuis son état). Filtres : " +
        'texte (marchand/catégorie), catégorie exacte, plage de montants, plage de dates. Renvoie les ' +
        'transactions correspondantes (triées récentes d\'abord, bornées par `limit`) ET les agrégats ' +
        '(total dépensé, total reçu, solde net) sur TOUT l\'ensemble filtré.',
        inputSchema,
        async ({ query, category, minAmount, maxAmount, fromDate, toDate, includeTransfers, limit }) =>
            withState(getState, (state: AppState) => {
                const res = searchTransactions(
                    state.transactions ?? [],
                    { query, category, minAmount, maxAmount, fromDate, toDate, includeTransfers },
                    limit,
                );
                return jsonContent({
                    currency: 'CAD',
                    count: res.count,
                    returned: res.matches.length,
                    totalSpent: Math.round(res.totalSpent),
                    totalReceived: Math.round(res.totalReceived),
                    netAmount: Math.round(res.totalAmount),
                    transactions: res.matches.map((t) => ({
                        date: t.date,
                        payee: t.payee,
                        amount: Math.round(t.amount * 100) / 100,
                        category: t.category,
                    })),
                });
            }),
    );
};
