// mcp/runFintableSync.ts
//
// [FINTABLE-3] Passe de synchronisation AUTONOME (Cloud Run, cron quotidien), sur le patron de
// `refreshPrices.ts` (HUB-REFRESH-CRON) : lit l'état Drive avec son jeton de version, applique les
// documents produits par le mapper (Lot 2), et RÉÉCRIT en une seule fois avec la garde OCC
// (`store.save(next, version)` — refuse si l'app a poussé entre-temps ; le prochain tick réessaie).
//
// ⚠️ ÉCRITURE SANS SUPERVISION HUMAINE (choix Marc, 2026-07-29 : « écriture réelle dès le départ »,
// pas de dry-run préalable) — ce qui protège cette passe :
//   1. Date de bascule DÉRIVÉE (`deriveCutoverDate`) : aucune valeur figée à laisser dériver.
//   2. Mapper PUR déjà exhaustivement testé (rôles explicites, tout-ou-rien sur le cash, dette en
//      solde seulement, virements internes détectés) — voir `mapSnapshot.ts`/`detectTransfers.ts`.
//   3. OCC + sauvegarde horodatée AUTOMATIQUE (`store.save`, comme tout autre écrivain du serveur).
//   4. Un rapport est TOUJOURS écrit (succès ou échec) dans `AppState.fintableSyncReport` — visible
//      dans l'app sans notification proactive (choix Marc : « visible dans l'app seulement »).
//
// Ce module NE lit ni n'écrit JAMAIS le jeton Fintable ou le JSON de rôles depuis le disque : ils
// sont injectés par l'appelant (env/Secret Manager côté `mcp/http.ts`), comme `finnhubKey` pour
// `/refresh`. Aucune donnée SAISIE par Marc (dettes hors solde, budgets, objectifs) n'est jamais
// touchée : seuls les 3 payloads du mapper (`bank_statement`/`cash_balance`/`debt`) sont appliqués.

import type { AppState, FintableSyncReport } from '../types';
import type { StateStore } from './state/stateStore';
import { applyDocument } from './ingest/applyDocument';
import { FintableClient } from '../services/fintable/client';
import { readFintableSnapshot } from '../services/fintable/readSnapshot';
import { mapFintableSnapshot, type FintableMappingConfig } from '../services/fintable/mapSnapshot';
import { deriveCutoverDate } from '../services/fintable/deriveCutoverDate';
import { FintableError } from '../services/fintable/types';
import { isStateConflictError } from './state/stateErrors';
import { logError } from '../services/errorLogger';

export interface FintableSyncOptions {
    token: string;
    roles: FintableMappingConfig['roles'];
    /** Injectable pour les tests (défaut : nouveau `FintableClient`). */
    client?: FintableClient;
}

function emptyReport(cutoverDateUsed: string | null, error: string | null): FintableSyncReport {
    return {
        at: Date.now(), cutoverDateUsed, accountsSeen: 0, accountsWithoutRole: 0,
        transactionsAdded: 0, transfersDetected: 0, cashUpdated: false, debtsUpdated: [],
        investmentReferenceCount: 0, warnings: [], error,
    };
}

function describeError(err: unknown): string {
    if (err instanceof FintableError) return `[${err.code}] ${err.message}`;
    return err instanceof Error ? err.message : String(err);
}

/**
 * Best-effort : persiste un rapport d'ÉCHEC pour que la panne soit visible dans l'app. Échoue en
 * silence (juste tracé) si même CETTE écriture échoue — on ne masque jamais l'erreur d'ORIGINE, qui
 * reste celle relancée par l'appelant.
 */
async function persistFailureReport(store: StateStore, cutoverDateUsed: string | null, err: unknown): Promise<void> {
    try {
        const { state, version } = await store.getWithVersion();
        const report = emptyReport(cutoverDateUsed, describeError(err));
        await store.save({ ...state, fintableSyncReport: report }, version);
    } catch (writeErr) {
        logError({
            source: 'storage', severity: 'warning',
            message: '[FINTABLE-3] Échec de la PERSISTANCE du rapport d\'échec (l\'échec d\'origine reste prioritaire).',
            error: writeErr instanceof Error ? writeErr : new Error(String(writeErr)),
        });
    }
}

/**
 * Exécute une passe complète : lecture Fintable → mapping → application → écriture ATOMIQUE.
 * @throws l'erreur d'ORIGINE (réseau Fintable, décodage, conflit OCC…) — l'appelant HTTP décide du
 *         code de statut (409/503 vs transitoire), comme `runPriceRefresh`.
 */
export async function runFintableSync(store: StateStore, opts: FintableSyncOptions): Promise<FintableSyncReport> {
    if (!store.canWrite) {
        throw new Error('Source d\'état non inscriptible : sync Fintable impossible.');
    }

    const { state, version } = await store.getWithVersion();
    const cutoverDateUsed = deriveCutoverDate(state.transactions);
    const client = opts.client ?? new FintableClient({ token: opts.token });

    try {
        const today = new Date();
        const snapshot = await readFintableSnapshot(client, {
            // Filtre grossier côté API (réduit la page) ; la borne EXACTE (stricte) est appliquée
            // par le mapper via `transactionsAfter` — les deux se recoupent, aucun risque à ce que
            // l'API soit inclusive du jour de bascule.
            dateFrom: cutoverDateUsed ?? undefined,
            dateTo: today.toISOString().slice(0, 10),
        });

        const { payloads, report: mapReport } = mapFintableSnapshot(snapshot, {
            roles: opts.roles,
            transactionsAfter: cutoverDateUsed,
        });

        let nextState: AppState = state;
        for (const doc of payloads) {
            nextState = applyDocument(nextState, doc).nextState;
        }

        const report: FintableSyncReport = {
            at: Date.now(),
            cutoverDateUsed,
            accountsSeen: snapshot.accounts.length,
            accountsWithoutRole: mapReport.accountsWithoutRole.length,
            transactionsAdded: mapReport.transactions.mapped,
            transfersDetected: mapReport.transferPairs.length,
            cashUpdated: mapReport.cashTargetCad !== null,
            debtsUpdated: mapReport.debts.map((d) => d.name),
            investmentReferenceCount: mapReport.investmentBalances.length,
            warnings: mapReport.warnings,
            error: null,
        };
        nextState = { ...nextState, fintableSyncReport: report };

        await store.save(nextState, version);
        return report;
    } catch (err) {
        if (isStateConflictError(err)) {
            // Transitoire (l'app a poussé entre-temps) : rien d'écrasé, le prochain tick réessaie.
            // Ne PAS écrire de rapport d'échec ici — ce n'est pas une panne, juste une course perdue.
            throw err;
        }
        logError({
            source: 'storage', severity: 'error',
            message: '[FINTABLE-3] Passe de sync ÉCHOUÉE.',
            error: err instanceof Error ? err : new Error(String(err)),
        });
        await persistFailureReport(store, cutoverDateUsed, err);
        throw err;
    }
}
