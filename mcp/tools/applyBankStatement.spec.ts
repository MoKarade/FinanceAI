// mcp/tools/applyBankStatement.spec.ts
// [ARCH-AITOOLS-SPLIT] SPEC pur (browser-safe) — schéma + description VERBATIM de l'ancien tool,
// sans SDK MCP. Le spec ne PERSISTE pas : `toDocument` convertit seulement les args validés en
// DocumentPayload (la persistance = runApply côté serveur, applyDocument+confirmation côté app).
//
// Lot 2 — écriture : ajoute les transactions d'un relevé bancaire (dédup automatique).

import { z } from 'zod';
import type { WriteToolSpec } from './_toolSpec';

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

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

// `satisfies` (pas une annotation) : préserve les types CONCRETS de inputSchema → server.tool
// infère les bons args (une annotation élargirait le shape en ToolInputShape).
export const applyBankStatementSpec = {
    kind: 'write',
    name: 'apply_bank_statement',
    description:
        "ÉCRIT dans l'état FinanceAI : ajoute les transactions d'un relevé bancaire que TU as déjà " +
        'extrait. DÉDUP automatique : une transaction identique (date + montant + marchand) n\'est pas ' +
        'ré-ajoutée. Montants SIGNÉS (négatif = dépense). Sauvegarde horodatée avant écriture ; renvoie ' +
        "le nombre ajouté / ignoré. N'invente rien : seulement ce qui figure sur le relevé.",
    inputSchema,
    toDocument: (args: Args) => ({ kind: 'bank_statement', ...args }),
} satisfies WriteToolSpec<Args>;
