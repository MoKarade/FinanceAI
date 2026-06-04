// mcp/tools/applyTaxSlip.tool.ts
// Lot 2 — écriture : applique un feuillet fiscal (T4 / RL-1) au profil ciblé.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runApply } from './_writeHelper';
import type { ToolTextResult } from './_dataAware';
import type { StateStore } from '../state/stateStore';

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

export const registerApplyTaxSlip = (server: McpServer, store: StateStore): void => {
    server.tool(
        'apply_tax_slip',
        "ÉCRIT dans l'état FinanceAI : applique un feuillet fiscal (T4 / RL-1…) que TU as déjà lu — " +
        "revenu d'emploi annuel (→ salaire brut mensuel) et cotisations REER, sur l'utilisateur ciblé. " +
        "Sauvegarde horodatée avant écriture ; renvoie le détail. N'invente rien : seulement ce qui figure sur le feuillet.",
        inputSchema,
        async (args): Promise<ToolTextResult> => runApply(store, { kind: 'tax_slip', ...args }),
    );
};
