// mcp/tools/_dataAware.ts
//
// Lot 1 — utilitaires partagés par les tools « data-aware » (qui lisent l'état
// réel de l'utilisateur). Centralise : le type du fournisseur d'état, l'enrobage
// de réponse JSON, et la gestion d'erreur (état non configuré / invalide →
// message clair pour Claude au lieu d'un crash du serveur).

import type { AppState } from '../../types';
import { freshnessNotice } from '../state/freshness';

/** Réponse MCP standard (un bloc texte). */
export interface ToolTextResult {
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
    [key: string]: unknown;
}

/**
 * Fournit l'AppState courant. Implémenté côté serveur (fichier local en stdio ;
 * Drive en Lot 3). Peut lever : la fabrique d'erreur ci-dessous la présente
 * proprement à Claude.
 */
export type StateProvider = () => Promise<AppState>;

/** Emballe un objet sérialisable en réponse MCP texte (JSON indenté). */
export function jsonContent(payload: unknown): ToolTextResult {
    return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

/** Réponse d'erreur exploitable (texte + isError) — jamais de throw vers le transport. */
export function errorContent(message: string): ToolTextResult {
    return { content: [{ type: 'text', text: `⚠️ ${message}` }], isError: true };
}

/**
 * Charge l'état via `getState`, applique `fn`, et renvoie le résultat. Toute
 * erreur (source absente, JSON/forme invalide, calcul) est convertie en réponse
 * d'erreur claire — le serveur MCP ne plante pas et Claude reçoit un message
 * actionnable.
 */
export async function withState(
    getState: StateProvider,
    fn: (state: AppState) => ToolTextResult,
): Promise<ToolTextResult> {
    let state: AppState;
    try {
        state = await getState();
    } catch (err) {
        return errorContent(
            `Impossible de charger ton état FinanceAI. ${err instanceof Error ? err.message : String(err)}`,
        );
    }
    try {
        const res = fn(state);
        // [MCP-STALE-FRESHNESS] — appose l'âge des données à CHAQUE réponse (bloc texte ADDITIF,
        // le JSON du 1er bloc reste intact). Si la source n'a pas d'horodatage (fixture, fichier
        // local), pas de note. Claude voit ainsi quand la copie Drive est périmée au lieu de
        // présenter des chiffres morts comme actuels (incident 2026-07-14).
        const notice = freshnessNotice();
        if (notice) res.content.push({ type: 'text', text: notice });
        return res;
    } catch (err) {
        return errorContent(
            `Calcul impossible sur ton état. ${err instanceof Error ? err.message : String(err)}`,
        );
    }
}
