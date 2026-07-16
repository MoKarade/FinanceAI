// mcp/tools/_dataAware.ts
//
// Lot 1 — utilitaires partagés par les tools « data-aware » (qui lisent l'état
// réel de l'utilisateur). Centralise : le type du fournisseur d'état, l'enrobage
// de réponse JSON, et la gestion d'erreur (état non configuré / invalide →
// message clair pour Claude au lieu d'un crash du serveur).

import type { AppState } from '../../types';
import { freshnessNotice } from '../state/freshness';
import { sanitizePromptText } from '../../utils/promptSafety';

// [MCP-PROMPT-SCRUB] Longueur max d'un champ TEXTE exposé à Claude via un tool data-aware.
// Assez large pour un nom d'actif / payee / nom de projet normal (banques : < 60), mais borne
// le flood de contexte par un champ malveillant. Le vrai rempart est le strip des caractères
// d'injection/markup (cf sanitizePromptText) ; la borne n'est qu'une ceinture anti-flood.
export const MCP_TEXT_MAX = 200;

/**
 * [MCP-PROMPT-SCRUB] Neutralise EN PROFONDEUR toute valeur STRING d'un payload de tool
 * data-aware avant de le renvoyer à Claude : nom d'actif (auto-rempli Finnhub), payee/
 * catégorie (extraits d'un relevé/PDF de courtage), nom de projet/dette, nom d'utilisateur,
 * employeur… = champs texte LIBRES potentiellement porteurs d'une injection de prompt indirecte.
 * `sanitizePromptText` retire caractères de contrôle + markup/injection + borne la longueur.
 * Ne touche QUE les strings (nombres/booléens/null/dates ISO inchangés — aucun caractère strippé) ;
 * les clés d'objet (contrôlées par le code) ne sont pas modifiées. Centralisé ici → couvre TOUS
 * les tools data-aware, présents ET futurs, sans risque d'oublier un champ.
 */
export function scrubMcpDeep(value: unknown): unknown {
    if (typeof value === 'string') return sanitizePromptText(value, MCP_TEXT_MAX);
    if (Array.isArray(value)) return value.map(scrubMcpDeep);
    if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = scrubMcpDeep(v);
        return out;
    }
    return value; // number | boolean | null | undefined — inchangés
}

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

/** Emballe un objet sérialisable en réponse MCP texte (JSON indenté).
 *  [MCP-PROMPT-SCRUB] Les champs texte libres sont neutralisés en profondeur (anti-injection). */
export function jsonContent(payload: unknown): ToolTextResult {
    return { content: [{ type: 'text', text: JSON.stringify(scrubMcpDeep(payload), null, 2) }] };
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
