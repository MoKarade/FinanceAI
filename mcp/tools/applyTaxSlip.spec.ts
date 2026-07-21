// mcp/tools/applyTaxSlip.spec.ts
// [ARCH-AITOOLS-SPLIT] SPEC pur (browser-safe) — schéma + description VERBATIM de l'ancien tool,
// sans SDK MCP. Le spec ne PERSISTE pas : `toDocument` convertit seulement les args validés en
// DocumentPayload (la persistance = runApply côté serveur, applyDocument+confirmation côté app).
//
// Lot 2 — écriture : applique un feuillet fiscal (T4 / RL-1) au profil ciblé.

import { z } from 'zod';
import type { WriteToolSpec } from './_toolSpec';

const inputSchema = {
    userIndex: z.union([z.literal(0), z.literal(1)]).optional()
        .describe('Utilisateur ciblé : 0 = principal (défaut), 1 = conjoint.'),
    userName: z.string().optional().describe('Alternative à userIndex : cibler par nom.'),
    slipType: z.string().optional().describe('Type de feuillet (T4, RL-1…).'),
    employmentIncomeAnnual: z.number().positive().optional()
        .describe("Revenu d'emploi ANNUEL (T4 case 14 / RL-1 case A). Stocké en mensuel."),
    rrspContributedAnnual: z.number().min(0).optional()
        .describe('Cotisations REER de l\'année.'),
};

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

// `satisfies` (pas une annotation) : préserve les types CONCRETS de inputSchema → server.tool
// infère les bons args (une annotation élargirait le shape en ToolInputShape).
export const applyTaxSlipSpec = {
    kind: 'write',
    name: 'apply_tax_slip',
    description:
        "ÉCRIT dans l'état FinanceAI : applique un feuillet fiscal (T4 / RL-1…) que TU as déjà lu — " +
        "revenu d'emploi annuel (→ salaire brut mensuel) et cotisations REER, sur l'utilisateur ciblé. " +
        "Sauvegarde horodatée avant écriture ; renvoie le détail. N'invente rien : seulement ce qui figure sur le feuillet.",
    inputSchema,
    toDocument: (args: Args) => ({ kind: 'tax_slip', ...args }),
} satisfies WriteToolSpec<Args>;
