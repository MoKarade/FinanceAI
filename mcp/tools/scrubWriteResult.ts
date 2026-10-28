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

// [Finding code-reviewer PR #519 — ÉLEVÉ, mesuré] Le défaut de `sanitizePromptText` (60 car.) est
// calibré pour un LIBELLÉ user (payee, nom de projet), pas pour la PROSE code-auteur des écritures :
// il tronquait en plein mot les avertissements de sécurité (« la courbe d'historique perd… », « le
// patrimoine net MONTE… », « annulable via Réglages ») → le modèle sur claude.ai ne pouvait plus les
// relayer. Le summary/field/note restent SCRUBÉS (les substrings user interpolées y sont neutralisées)
// mais avec une borne adaptée à de la prose — même distinction code-auteur vs user-libre que
// MCP-PROMPT-SCRUB (les notes rédigées par le code ne doivent pas subir un cap conçu pour l'autre).
const WRITE_TEXT_MAX = 400;

/**
 * [MCP-SCRUB-NAN-DEVIENT-NULL] Un nombre NON FINI (`NaN`, `±Infinity`) se sérialise en **`null`**
 * par `JSON.stringify` — le modèle lit donc « pas de valeur précédente » là où la vérité est
 * « valeur précédente CORROMPUE ». Deux faits opposés confondus dans un même symbole, classe
 * `UN-DEFAUT-QUI-RECOUVRE-DEUX-FAITS-OPPOSES-SE-CORRIGE-EN-LES-SEPARANT`. Le canal HUMAIN est déjà
 * honnête (`AiChatConfirmModal` rend « — »), c'est le canal MACHINE qui fabriquait une absence.
 * On rend une chaîne EXPLICITE : elle survit à la sérialisation, et le modèle peut la relayer.
 */
const scrubValue = (v: unknown): unknown => {
    if (typeof v === 'string') return sanitizePromptText(v, WRITE_TEXT_MAX);
    if (typeof v === 'number' && !Number.isFinite(v)) return '— (valeur non exploitable)';
    return v;
};

function scrubChangesForModel(changes: Change[]): Change[] {
    return changes.map((c) => ({
        field: sanitizePromptText(c.field, WRITE_TEXT_MAX),
        before: scrubValue(c.before),
        after: scrubValue(c.after),
        ...(c.note !== undefined ? { note: sanitizePromptText(c.note, WRITE_TEXT_MAX) } : {}),
    }));
}

/** Résultat d'écriture prêt à renvoyer au modèle : summary + changes désinfectés. */
export function scrubWriteResultForModel(summary: string, changes: Change[]): { summary: string; changes: Change[] } {
    return { summary: sanitizePromptText(summary, WRITE_TEXT_MAX), changes: scrubChangesForModel(changes) };
}
