// services/aiTools/writeExecutor.ts
//
// [AITOOLS-D] Exécution d'un tool d'ÉCRITURE côté app — le cœur du contrat « rien ne s'écrit sans
// ton clic » (exigence Marc) :
//   1. diff PUR via applyDocument (aucune mutation — la même fusion que le serveur MCP, ADR-2) ;
//   2. CONFIRMATION visuelle : le diff (avant → après) est montré, on ATTEND le clic ;
//   3. Appliquer → recalcul du diff sur un état FRAIS (anti-course : l'état a pu bouger pendant
//      que l'utilisateur lisait le modal — un prix rafraîchi, un autre onglet), backup IndexedDB
//      AVANT d'écrire, puis setAppState (le push Drive suit via schedulePush, câblage existant) ;
//   4. Annuler → tool_result honnête « refusé par l'utilisateur » (Claude peut reproposer).
//
// ⚠️ apiKeys : le snapshot les EXCLUT (défauts vides) → appliquer nextState TEL QUEL écraserait
// les vraies clés en mémoire. On les retire toujours du patch appliqué.

import type { AnyWriteToolSpec } from '../../mcp/tools/_toolSpec';
import type { ToolTextResult } from '../../mcp/tools/_dataAware';
import { jsonContent } from '../../mcp/tools/_dataAware';
import { applyDocument, type Change } from '../../mcp/ingest/applyDocument';
import { snapshotAppState } from './appStateProvider';
import { useFinanceStore } from '../../store/useFinanceStore';
import { createBackupNow } from '../backupAuto';
import { logError } from '../errorLogger';
import { sanitizePromptText } from '../../utils/promptSafety';
// [MCP-WRITE-SUMMARY-SCRUB] Désinfection du résultat renvoyé au modèle — helper PARTAGÉ avec le
// serveur MCP (runApply) pour éviter la dérive « delta appliqué à une seule copie ». Voir le module.
import { scrubWriteResultForModel } from '../../mcp/tools/scrubWriteResult';
import type { AppState } from '../../types';

/** Aperçu montré dans le modal de confirmation. */
export interface WritePreview {
    toolName: string;
    summary: string;
    changes: Change[];
}

export type WriteDecision = 'apply' | 'cancel';
export type RequestConfirmation = (preview: WritePreview) => Promise<WriteDecision>;

export async function executeWriteTool(
    spec: AnyWriteToolSpec,
    args: Record<string, unknown>,
    requestConfirmation: RequestConfirmation,
): Promise<ToolTextResult> {
    const doc = spec.toDocument(args);

    // 1. Diff PUR sur le snapshot courant — RIEN n'est écrit ici.
    const preview = applyDocument(snapshotAppState(), doc);
    if (preview.changes.length === 0) {
        return jsonContent({ applied: false, summary: sanitizePromptText(preview.summary), changes: [] });
    }

    // 2. CONFIRMATION — on attend le clic (le modal peut rester ouvert longtemps, c'est voulu).
    const decision = await requestConfirmation({
        toolName: spec.name,
        summary: preview.summary,
        changes: preview.changes,
    });
    if (decision === 'cancel') {
        return jsonContent({
            applied: false,
            refusedByUser: true,
            summary: 'Modification REFUSÉE par l\'utilisateur — ne pas réessayer sans une nouvelle demande explicite de sa part.',
        });
    }

    // 3. RECALCUL sur un état FRAIS (anti-course, finding architecte) : si l'état a bougé pendant
    // la confirmation, on applique le doc sur l'état ACTUEL (jamais un nextState périmé qui
    // écraserait silencieusement les changements concurrents).
    const final = applyDocument(snapshotAppState(), doc);

    // Backup AVANT d'écrire (annulable via Réglages → Sauvegarde) — échec du backup = on N'ÉCRIT
    // PAS (le filet est la condition de l'écriture, pas un best-effort).
    const backup = await createBackupNow('auto');
    if (!backup) {
        logError({
            source: 'storage', severity: 'error',
            message: `Chat in-app : backup pré-écriture ÉCHOUÉ — écriture ${spec.name} ANNULÉE (jamais d'écriture sans filet).`,
        });
        return jsonContent({
            applied: false,
            backupFailed: true,
            summary: 'Écriture annulée : la sauvegarde de sécurité a échoué (IndexedDB indisponible ?). NE réessaie PAS automatiquement (l\'échec risque de persister dans cette session) — informe l\'utilisateur et suggère de recharger la page, puis de refaire la demande.',
        });
    }

    // 4. Appliquer — SANS apiKeys (cf. en-tête) et avec un lastUpdate frais.
    const { apiKeys: _ak, ...safePatch } = final.nextState as AppState;
    void _ak;
    useFinanceStore.getState().setAppState({ ...safePatch, lastUpdate: Date.now() });

    const safe = scrubWriteResultForModel(final.summary, final.changes);
    return jsonContent({ applied: true, summary: safe.summary, changes: safe.changes });
}
