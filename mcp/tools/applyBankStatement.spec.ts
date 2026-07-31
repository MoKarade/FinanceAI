// mcp/tools/applyBankStatement.spec.ts
// [ARCH-AITOOLS-SPLIT] SPEC pur (browser-safe) — schéma + description VERBATIM de l'ancien tool,
// sans SDK MCP. Le spec ne PERSISTE pas : `toDocument` convertit seulement les args validés en
// DocumentPayload (la persistance = runApply côté serveur, applyDocument+confirmation côté app).
//
// Lot 2 — écriture : ajoute les transactions d'un relevé bancaire (dédup automatique).

import { z } from 'zod';
import type { WriteToolSpec } from './_toolSpec';
import { RULE_CATEGORIES } from '../../services/import/categoryRules';

const inputSchema = {
    accountName: z.string().optional().describe('Nom du compte (ex: « Chèque RBC »).'),
    transactions: z.array(z.object({
        date: z.string().describe('Date ISO (YYYY-MM-DD).'),
        payee: z.string().describe('Marchand / description.'),
        amount: z.number().finite().describe('Montant SIGNÉ : négatif = dépense, positif = entrée.'),
        // [MCP-CATEGORY-ALLOWLIST] Liste DÉRIVÉE de RULE_CATEGORIES (jamais re-codée — un exemple
        // hors canon comme l'ancien « Alimentation » enseignait au modèle une catégorie inventée).
        category: z.string().optional().describe(
            `Catégorie CANONIQUE (une de : ${RULE_CATEGORIES.join(', ')}) ou le nom d'un poste de ` +
            'budget existant. Une catégorie inconnue est re-catégorisée automatiquement par règles ' +
            'sur le marchand.',
        ),
        isTransfer: z.boolean().optional().describe('Vrai si c\'est un virement interne.'),
        // [TX-TRANSFERS] Sans compte par ligne, deux montants opposés ne prouvent pas un virement
        // interne : la détection ne peut alors que le suggérer, jamais le marquer automatiquement.
        accountName: z.string().optional().describe(
            'Compte porteur de CETTE transaction (ex. « Compte courant », « Mastercard »). À fournir '
            + 'quand le relevé couvre plusieurs comptes ; sinon le compte du relevé s\'applique. '
            + 'Ne devine pas : omets-le si le relevé ne le dit pas.',
        ),
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
