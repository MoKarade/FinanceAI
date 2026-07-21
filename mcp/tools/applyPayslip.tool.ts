// mcp/tools/applyPayslip.tool.ts
//
// Lot 2 — tool d'ÉCRITURE : applique une fiche de paie (déjà analysée par Claude)
// à l'état réel. Garde « écriture directe + sauvegarde » : sauvegarde horodatée
// avant d'écrire, puis renvoie le détail des changements (avant → après) + le
// chemin de la sauvegarde (annulable). Claude fournit les valeurs ANNUELLES.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolTextResult } from './_dataAware';
import { runApply } from './_writeHelper';
import type { StateStore } from '../state/stateStore';

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

export const registerApplyPayslip = (server: McpServer, store: StateStore): void => {
    server.tool(
        'apply_payslip',
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
        async (args): Promise<ToolTextResult> => runApply(store, { kind: 'payslip', ...args }),
    );
};
