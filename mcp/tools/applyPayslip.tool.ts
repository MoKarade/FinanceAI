// mcp/tools/applyPayslip.tool.ts
//
// Lot 2 — tool d'ÉCRITURE : applique une fiche de paie (déjà analysée par Claude)
// à l'état réel. Garde « écriture directe + sauvegarde » : sauvegarde horodatée
// avant d'écrire, puis renvoie le détail des changements (avant → après) + le
// chemin de la sauvegarde (annulable). Claude fournit les valeurs ANNUELLES.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { applyDocument } from '../ingest/applyDocument';
import { jsonContent, errorContent, type ToolTextResult } from './_dataAware';
import type { StateStore } from '../state/stateStore';

const inputSchema = {
    userIndex: z.union([z.literal(0), z.literal(1)]).optional()
        .describe('Utilisateur ciblé : 0 = principal (défaut), 1 = conjoint.'),
    userName: z.string().optional()
        .describe('Alternative à userIndex : cibler l\'utilisateur par son nom.'),
    grossAnnual: z.number().positive().optional()
        .describe('Salaire BRUT annuel (période × fréquence). Stocké en mensuel.'),
    netAnnual: z.number().positive().optional()
        .describe('Salaire NET annuel. Stocké en mensuel.'),
    rrspContributedAnnual: z.number().min(0).optional()
        .describe('Cotisations REER de l\'année (annuel).'),
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
        async (args): Promise<ToolTextResult> => {
            if (!store.canWrite) {
                return errorContent(
                    "État en lecture seule : $FINANCEAI_STATE_FILE doit pointer vers un fichier accessible en écriture.",
                );
            }
            let state;
            try {
                state = await store.get();
            } catch (err) {
                return errorContent(`Impossible de charger l'état avant écriture. ${err instanceof Error ? err.message : String(err)}`);
            }
            try {
                const { nextState, changes, summary } = applyDocument(state, { kind: 'payslip', ...args });
                if (changes.length === 0) {
                    return jsonContent({ applied: false, summary, changes: [] });
                }
                const { backupPath } = await store.save(nextState);
                return jsonContent({ applied: true, summary, changes, backupPath });
            } catch (err) {
                return errorContent(`Écriture impossible. ${err instanceof Error ? err.message : String(err)}`);
            }
        },
    );
};
