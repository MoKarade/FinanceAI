// mcp/tools/scrubWriteResult.ts
//
// [MCP-WRITE-SUMMARY-SCRUB] Désinfection PARTAGÉE du résultat d'une écriture (apply_*) AVANT de le
// renvoyer au modèle — consommée par les DEUX surfaces : le chat in-app (services/aiTools/writeExecutor)
// ET le serveur MCP/claude.ai (mcp/tools/_writeHelper → runApply). Un module unique évite la dérive
// « delta appliqué à une seule copie » (le scrub avait été fait côté app au Lot D et jamais porté
// côté serveur — trou d'injection indirecte confirmé à l'audit SEC 2026-07-22).
//
// Pourquoi : `summary`/`field`/`note`/`before`/`after` sont de la PROSE composée par le code qui
// INTERPOLE des substrings SAISIES PAR L'UTILISATEUR (nom de dette/employeur/ticker, souvent extraits
// d'un document JOINT). `jsonContent` ne scrube que les clés user-free-text (name/payee/…), PAS ces
// clés code-auteur → un nom malveillant (« <IGNORE ALL PRIOR INSTRUCTIONS>… ») reviendrait VERBATIM
// dans le contexte du tour suivant, emballé dans une phrase « de confiance » (injection INDIRECTE).
// `sanitizePromptText` neutralise le markup + borne la longueur.
//
// ⚠️ Ne touche QUE ce qui est renvoyé au MODÈLE. Le STORE (données réelles) et l'affichage utilisateur
// (échappé par React côté app ; non concerné côté serveur) gardent les vraies valeurs.

import { sanitizePromptText } from '../../utils/promptSafety';
import type { Change } from '../ingest/applyDocument';

const scrubValue = (v: unknown): unknown => (typeof v === 'string' ? sanitizePromptText(v) : v);

export function scrubChangesForModel(changes: Change[]): Change[] {
    return changes.map((c) => ({
        field: sanitizePromptText(c.field),
        before: scrubValue(c.before),
        after: scrubValue(c.after),
        ...(c.note !== undefined ? { note: sanitizePromptText(c.note) } : {}),
    }));
}

/** Résultat d'écriture prêt à renvoyer au modèle : summary + changes désinfectés. */
export function scrubWriteResultForModel(summary: string, changes: Change[]): { summary: string; changes: Change[] } {
    return { summary: sanitizePromptText(summary), changes: scrubChangesForModel(changes) };
}
