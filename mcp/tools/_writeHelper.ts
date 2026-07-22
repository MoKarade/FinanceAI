// mcp/tools/_writeHelper.ts
//
// Lot 2 — logique COMMUNE aux tools d'écriture apply_* : charge l'état, applique le document (fusion
// pure), et si quelque chose change, persiste (sauvegarde horodatée) puis renvoie le détail. Garantit
// le même comportement pour tous les types de documents : rien d'écrit si aucun changement, erreurs
// converties en réponses claires (jamais de throw vers le transport).

import { applyDocument, type DocumentPayload } from '../ingest/applyDocument';
import { jsonContent, errorContent, type ToolTextResult } from './_dataAware';
import { scrubWriteResultForModel } from './scrubWriteResult';
import type { StateStore } from '../state/stateStore';
import { logError } from '../../services/errorLogger';

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
        // [MCP-TOOLS-SILENT-CATCH] trace serveur en plus de la réponse d'erreur à Claude.
        logError({
            source: 'storage', severity: 'error',
            message: `MCP runApply(${doc.kind}) : chargement de l'état avant écriture ÉCHOUÉ.`,
            error: err instanceof Error ? err : new Error(String(err)),
        });
        return errorContent(`Impossible de charger l'état avant écriture. ${err instanceof Error ? err.message : String(err)}`);
    }
    try {
        const { nextState, changes, summary } = applyDocument(state, doc);
        // [MCP-WRITE-SUMMARY-SCRUB, audit SEC] Désinfecter summary/changes AVANT de les renvoyer au
        // modèle (claude.ai) — un nom/employeur/ticker piégé (extrait d'un document joint) reviendrait
        // sinon VERBATIM dans le contexte du tour suivant. Même helper que le chat in-app (parité).
        if (changes.length === 0) {
            const safe = scrubWriteResultForModel(summary, []);
            return jsonContent({ applied: false, summary: safe.summary, changes: [] });
        }
        const { backupPath } = await store.save(nextState, version);
        const safe = scrubWriteResultForModel(summary, changes);
        return jsonContent({ applied: true, summary: safe.summary, changes: safe.changes, backupPath });
    } catch (err) {
        // [MCP-TOOLS-SILENT-CATCH] échec d'application/persistance (OCC, Drive, fusion) journalisé.
        logError({
            source: 'storage', severity: 'error',
            message: `MCP runApply(${doc.kind}) : application/écriture du document ÉCHOUÉE.`,
            error: err instanceof Error ? err : new Error(String(err)),
        });
        return errorContent(`Écriture impossible. ${err instanceof Error ? err.message : String(err)}`);
    }
}
