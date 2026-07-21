// mcp/tools/applyPayslip.spec.ts
// [ARCH-AITOOLS-SPLIT] SPEC pur (browser-safe) — schéma + description VERBATIM de l'ancien tool,
// sans SDK MCP. Le spec ne PERSISTE pas : `toDocument` convertit seulement les args validés en
// DocumentPayload (la persistance = runApply côté serveur, applyDocument+confirmation côté app).
//
// Lot 2 — tool d'ÉCRITURE : applique une fiche de paie (déjà analysée par Claude)
// à l'état réel. Garde « écriture directe + sauvegarde » : sauvegarde horodatée
// avant d'écrire, puis renvoie le détail des changements (avant → après) + le
// chemin de la sauvegarde (annulable). Claude fournit les valeurs ANNUELLES.

import { z } from 'zod';
import type { WriteToolSpec } from './_toolSpec';

const inputSchema = {
    userIndex: z.union([z.literal(0), z.literal(1)]).optional()
        .describe('Utilisateur ciblé : 0 = principal (défaut), 1 = conjoint.'),
    userName: z.string().optional()
        .describe('Alternative à userIndex : cibler l\'utilisateur par son nom.'),
    grossAnnual: z.number().positive().finite().optional()
        .describe('Salaire BRUT annuel (période × fréquence). Stocké en mensuel.'),
    netAnnual: z.number().positive().finite().optional()
        .describe('Salaire NET annuel. Stocké en mensuel.'),
    rrspContributedAnnual: z.number().min(0).finite().optional()
        .describe('Cotisations REER de l\'année (annuel).'),
    employer: z.string().max(120).optional()
        .describe("Employeur/étiquette de la paie — affiché comme SOURCE du revenu (provenance)."),
};

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

// `satisfies` (pas une annotation) : préserve les types CONCRETS de inputSchema → server.tool
// infère les bons args (une annotation élargirait le shape en ToolInputShape).
export const applyPayslipSpec = {
    kind: 'write',
    name: 'apply_payslip',
    description:
        "ÉCRIT dans l'état FinanceAI : applique une fiche de paie que TU as déjà analysée. " +
        'Fournis le brut et/ou le net ANNUELS (montant par période × nombre de périodes) et ' +
        "l'utilisateur ciblé. Une sauvegarde horodatée est créée AVANT l'écriture (annulable). " +
        'Renvoie le détail des changements (avant → après) et le chemin de la sauvegarde. ' +
        "N'invente jamais de chiffres : ne renseigne que ce qui figure sur le document.",
    inputSchema,
    // [Finding panel 2026-07-21] apply_payslip était le SEUL apply_* à INLINER le bloc
    // canWrite→getWithVersion→applyDocument→save (drift déjà constaté : son message read-only
    // omettait l'option Drive/mcp:auth) → routé sur runApply comme les 4 autres. Les logError
    // [MCP-TOOLS-SILENT-CATCH] vivent en UN endroit (_writeHelper), couvert par mcpBoundaryLog.
    toDocument: (args: Args) => ({ kind: 'payslip', ...args }),
} satisfies WriteToolSpec<Args>;
