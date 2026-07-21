// mcp/tools/applyBrokerStatement.spec.ts
// [ARCH-AITOOLS-SPLIT] SPEC pur (browser-safe) — schéma + description VERBATIM de l'ancien tool,
// sans SDK MCP. Le spec ne PERSISTE pas : `toDocument` convertit seulement les args validés en
// DocumentPayload (la persistance = runApply côté serveur, applyDocument+confirmation côté app).
//
// Lot 2 — écriture : met à jour/ajoute les positions d'un relevé de courtage.

import { z } from 'zod';
import type { WriteToolSpec } from './_toolSpec';

const inputSchema = {
    accountType: z.enum(['NON-ENREG', 'CELI', 'REER', 'CELIAPP', 'CRYPTO']).optional()
        .describe('Compte fiscal des positions (défaut: NON-ENREG).'),
    holdings: z.array(z.object({
        symbol: z.string().min(1).max(20).describe('Ticker (ex: AAPL, XEQT.TO, BTC).'),
        quantity: z.number().finite().describe('Nombre de parts/unités détenues.'),
        currentPrice: z.number().finite().optional().describe('Prix actuel par part, si indiqué sur le relevé.'),
        name: z.string().max(120).optional().describe('Nom du titre.'),
        currency: z.enum(['USD', 'CAD', 'EUR']).optional().describe('Devise (défaut: CAD).'),
    })).describe('Positions extraites du relevé de courtage.'),
};

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

// `satisfies` (pas une annotation) : préserve les types CONCRETS de inputSchema → server.tool
// infère les bons args (une annotation élargirait le shape en ToolInputShape).
export const applyBrokerStatementSpec = {
    kind: 'write',
    name: 'apply_broker_statement',
    description:
        "ÉCRIT dans l'état FinanceAI : met à jour les quantités/prix des positions d'un relevé de " +
        'courtage (ajoute celles qui manquent, par symbole + compte). Sauvegarde horodatée avant ' +
        "écriture ; renvoie le nombre mis à jour / ajouté. N'invente rien : seulement ce qui figure sur le relevé.",
    inputSchema,
    toDocument: (args: Args) => ({ kind: 'broker_statement', ...args }),
} satisfies WriteToolSpec<Args>;
