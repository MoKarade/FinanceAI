// mcp/tools/_writeTool.ts
//
// [MCP-CONFIRM-TOKEN] UNIQUE point d'enregistrement des outils d'ÉCRITURE du serveur MCP. Les huit
// `*.tool.ts` d'écriture (apply_*, set_cash, set_budget_item, delete_item) l'appellent : impossible d'en
// oublier un (garde : tests/mcp/confirmationEcritureMcp.test.ts interdit `runApply` hors de ce fichier).
//
// Ce que fait le wrapper, pour TOUS les outils d'écriture :
//  - ajoute au schéma un `confirmToken` optionnel et RETIRE le `confirm` booléen (fourni par le modèle,
//    donc sans valeur de preuve) ;
//  - dérive l'identité de la session (`extra.sessionId`, « local » en stdio) et l'empreinte des arguments ;
//  - délègue à `runApply` avec le garde à deux temps (aperçu + jeton à usage unique lié) ;
//  - publie des annotations MCP : ce n'est jamais une lecture (readOnlyHint:false → claude.ai demande
//    l'approbation de CHAQUE appel), `destructiveHint` vrai pour delete_item, openWorldHint:false.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AnyWriteToolSpec } from './_toolSpec';
import type { ToolTextResult } from './_dataAware';
import type { StateStore } from '../state/stateStore';
import { runApply, auditWrite, MAX_CHANGES_PER_CALL } from './_writeHelper';
import { createConfirmVault, digest, type ConfirmVault } from './confirmVault';
import { errorContent } from './_dataAware';

/** Plafond d'éléments d'entrée (lignes de relevé, positions…) par appel, avant tout calcul. */
export const MAX_INPUT_ITEMS_PER_CALL = MAX_CHANGES_PER_CALL;

export const PROTOCOLE_ECRITURE =
    " ⚠️ PROTOCOLE D'ÉCRITURE À DEUX TEMPS (imposé par le serveur) : le 1er appel renvoie un APERÇU et un " +
    "confirmToken à usage unique (5 min, lié à ces arguments exacts) — RIEN n'est écrit. Montre l'aperçu à " +
    "l'utilisateur ; après son accord EXPLICITE, rappelle ce tool avec les MÊMES arguments + confirmToken. " +
    "Un paramètre `confirm` est ignoré. N'écris jamais de ta propre initiative.";

const CONFIRM_TOKEN_DOC =
    "Laisse VIDE au 1er appel. Après l'accord explicite de l'utilisateur sur l'aperçu, rappelle avec les " +
    "MÊMES arguments et le confirmToken reçu dans l'aperçu (usage unique, 5 min).";

export interface WriteToolOptions {
    /** Geste destructif (suppression) : annotation MCP destructiveHint. */
    destructive?: boolean;
}

const countItems = (args: Record<string, unknown>): number =>
    Object.values(args).reduce<number>((n, v) => n + (Array.isArray(v) ? v.length : 0), 0);

export function registerWriteTool(
    server: McpServer,
    store: StateStore,
    spec: AnyWriteToolSpec,
    vault: ConfirmVault = createConfirmVault(),
    options: WriteToolOptions = {},
): void {
    // `confirm` (booléen du modèle) est retiré du schéma publié ; `confirmToken` le remplace.
    const { confirm: _ignore, ...shape } = spec.inputSchema as Record<string, z.ZodTypeAny>;
    void _ignore;
    const inputSchema = { ...shape, confirmToken: z.string().min(1).max(200).optional().describe(CONFIRM_TOKEN_DOC) };

    server.tool(
        spec.name,
        spec.description + PROTOCOLE_ECRITURE,
        inputSchema,
        {
            readOnlyHint: false,
            destructiveHint: options.destructive === true,
            idempotentHint: false,
            openWorldHint: false,
        },
        async (rawArgs, extra): Promise<ToolTextResult> => {
            const { confirmToken, ...args } = rawArgs as Record<string, unknown> & { confirmToken?: string };
            const doc = spec.toDocument(args);
            if (countItems(args) > MAX_INPUT_ITEMS_PER_CALL) {
                auditWrite(doc.kind, 'refus', countItems(args), 'plafond_entree');
                return errorContent(
                    `Trop d'éléments en un appel (max ${MAX_INPUT_ITEMS_PER_CALL}). Rien n'a été écrit. Découpe le document en plusieurs appels.`,
                );
            }
            const scope = (extra as { sessionId?: string } | undefined)?.sessionId ?? 'local';
            return runApply(store, doc, {
                guard: { vault, scope, tool: spec.name, argsHash: digest(args), token: confirmToken },
            });
        },
    );
}
