// mcp/tools/_writeHelper.ts
//
// Lot 2 — logique COMMUNE aux tools d'écriture apply_* : charge l'état, applique le document (fusion
// pure), et si quelque chose change, persiste (sauvegarde horodatée) puis renvoie le détail. Garantit
// le même comportement pour tous les types de documents : rien d'écrit si aucun changement, erreurs
// converties en réponses claires (jamais de throw vers le transport).

import { applyDocument, type DocumentPayload } from '../ingest/applyDocument';
import { jsonContent, errorContent, type ToolTextResult } from './_dataAware';
import type { StateStore } from '../state/stateStore';

export async function runApply(store: StateStore, doc: DocumentPayload): Promise<ToolTextResult> {
    if (!store.canWrite) {
        return errorContent(
            'État en lecture seule : configure une source inscriptible (fichier $FINANCEAI_STATE_FILE, ou Drive via npm run mcp:auth).',
        );
    }
    let state, version;
    try {
        // [MCP-WRITE-VERSION-TOKEN] lire l'état AVEC son jeton de version → le passer au save pour l'OCC.
        ({ state, version } = await store.getWithVersion());
    } catch (err) {
        return errorContent(`Impossible de charger l'état avant écriture. ${err instanceof Error ? err.message : String(err)}`);
    }
    try {
        const { nextState, changes, summary } = applyDocument(state, doc);
        if (changes.length === 0) return jsonContent({ applied: false, summary, changes: [] });
        const { backupPath } = await store.save(nextState, version);
        return jsonContent({ applied: true, summary, changes, backupPath });
    } catch (err) {
        return errorContent(`Écriture impossible. ${err instanceof Error ? err.message : String(err)}`);
    }
}
