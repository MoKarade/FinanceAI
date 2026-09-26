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
import { sanitizePromptText } from '../../utils/promptSafety';
import { digest, type ConfirmVault, type ConfirmVerdict } from './confirmVault';

/** Plafond d'éléments (changements calculés) par appel d'écriture : un document piégé ne peut pas
 *  réécrire des centaines de lignes en un seul aller-retour. Au-delà : refus, à découper. */
export const MAX_CHANGES_PER_CALL = 500;

/** [MCP-CONFIRM-TOKEN] Garde de confirmation À DEUX TEMPS liée côté serveur (voir confirmVault.ts).
 *  Sans `token` : APERÇU + jeton à usage unique, RIEN n'est écrit. Avec `token` : il est vérifié (lié à
 *  la session, à l'outil, aux arguments exacts et aux changements) puis brûlé, et seulement alors on écrit.
 *  Un `confirm:true` du modèle n'existe plus : il n'a aucun effet. In-app, la confirmation passe par le
 *  modal `writeExecutor` (qui n'appelle PAS runApply) : chaque surface garde sa confirmation native. */
export interface WriteGuard {
    vault: ConfirmVault;
    scope: string;
    tool: string;
    argsHash: string;
    token?: string;
}

interface RunApplyOptions {
    guard?: WriteGuard;
}

/** Journal d'audit : outil, phase, nombre d'éléments, code de résultat. JAMAIS de montant ni de nom. */
export function auditWrite(tool: string, phase: 'apercu' | 'ecriture' | 'refus', elements: number, code = 'ok'): void {
    console.error(`[mcp:audit] outil=${tool} phase=${phase} elements=${elements} resultat=${code}`);
}

const REFUS: Record<Exclude<ConfirmVerdict, 'ok'>, string> = {
    invalide: "confirmToken invalide. Rien n'a été écrit. Appelle le tool SANS confirmToken pour obtenir un aperçu et un jeton.",
    inconnu_ou_rejoue: "confirmToken inconnu, déjà utilisé ou perdu (redémarrage du serveur). Rien n'a été écrit. Refais un aperçu (appel SANS confirmToken).",
    expire: "confirmToken expiré. Rien n'a été écrit. Refais un aperçu (appel SANS confirmToken).",
    different: "confirmToken refusé : arguments, session ou état différents de l'aperçu. Rien n'a été écrit. Refais un aperçu (appel SANS confirmToken) et montre-le à l'utilisateur.",
};

export async function runApply(store: StateStore, doc: DocumentPayload, opts?: RunApplyOptions): Promise<ToolTextResult> {
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
        return errorContent(`Impossible de charger l'état avant écriture. ${sanitizePromptText(err instanceof Error ? err.message : String(err), 300)}`);
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
        // [MCP-CONFIRM-TOKEN] Garde à deux temps liée côté serveur (tous les outils d'écriture passent ici).
        if (opts?.guard) {
            const g = opts.guard;
            if (changes.length > MAX_CHANGES_PER_CALL) {
                auditWrite(g.tool, 'refus', changes.length, 'plafond');
                return errorContent(`Trop de changements en un appel (${changes.length} > ${MAX_CHANGES_PER_CALL}). Rien n'a été écrit. Découpe le document en plusieurs appels.`);
            }
            const binding = { scope: g.scope, tool: g.tool, argsHash: g.argsHash, changesHash: digest(changes) };
            if (g.token === undefined) {
                const safe = scrubWriteResultForModel(summary, changes);
                const { token, expiresInSec } = g.vault.issue(binding);
                auditWrite(g.tool, 'apercu', changes.length);
                return jsonContent({
                    applied: false, preview: true, summary: safe.summary, changes: safe.changes,
                    confirmToken: token, expiresInSec,
                    note: "APERÇU — rien n'a été écrit. Montre ce changement à l'utilisateur ; s'il confirme EXPLICITEMENT, "
                        + "rappelle ce tool avec les MÊMES arguments et ce confirmToken (à usage unique, valable "
                        + Math.floor(expiresInSec / 60) + " min). Un paramètre confirm est ignoré.",
                });
            }
            const verdict = g.vault.consume(g.token, binding);
            if (verdict !== 'ok') {
                auditWrite(g.tool, 'refus', changes.length, verdict);
                return errorContent(REFUS[verdict]);
            }
        }
        const { backupPath } = await store.save(nextState, version);
        if (opts?.guard) auditWrite(opts.guard.tool, 'ecriture', changes.length);
        const safe = scrubWriteResultForModel(summary, changes);
        return jsonContent({ applied: true, summary: safe.summary, changes: safe.changes, backupPath });
    } catch (err) {
        // [MCP-TOOLS-SILENT-CATCH] échec d'application/persistance (OCC, Drive, fusion) journalisé.
        logError({
            source: 'storage', severity: 'error',
            message: `MCP runApply(${doc.kind}) : application/écriture du document ÉCHOUÉE.`,
            error: err instanceof Error ? err : new Error(String(err)),
        });
        // [Finding code-reviewer #519] err.message peut interpoler le `name` FOURNI PAR LE MODÈLE (throws
        // d'applyDocument) — les erreurs ne passaient par AUCUN scrub, contrairement au chemin succès.
        return errorContent(`Écriture impossible. ${sanitizePromptText(err instanceof Error ? err.message : String(err), 300)}`);
    }
}
