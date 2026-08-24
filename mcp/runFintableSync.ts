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
import { FintableClient } from '../services/fintable/client';
import { readFintableSnapshot } from '../services/fintable/readSnapshot';
import { mapFintableSnapshot, type FintableMappingConfig } from '../services/fintable/mapSnapshot';
import { toPersistableBrokerBalances } from '../services/fintable/brokerBalances';
import { decideCutoverDate, applyPayloadsIsolated } from '../services/fintable/syncCore';
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

    // ⚠️ [finding silent-failure-hunter, PR #531] `cutoverDateUsed` vit HORS du `try` (déclaré avant)
    // pour rester disponible à `persistFailureReport` même si la lecture d'état elle-même échoue —
    // mais la lecture (`getWithVersion`) est désormais DANS le `try` (elle en était exclue avant :
    // une panne de lecture initiale — Drive KO, jeton révoqué, coffre chiffré — ne déclenchait AUCUN
    // rapport d'échec, contredisant la garantie documentée « TOUJOURS écrit »). `null` si la lecture
    // échoue avant d'avoir pu dériver quoi que ce soit.
    let cutoverDateUsed: string | null = null;
    const preflightWarnings: string[] = [];

    try {
        const { state, version } = await store.getWithVersion();
        const todayStr = new Date().toISOString().slice(0, 10);
        // Plafonnement de la bascule : logique PARTAGÉE avec le chemin navigateur (`syncCore`) —
        // elle était copiée dans les deux, alors que c'est un correctif de panel qui doit rester
        // identique des deux côtés (finding code-reviewer, PR #535).
        const cutover = decideCutoverDate(state.transactions, todayStr);
        cutoverDateUsed = cutover.cutoverDateUsed;
        preflightWarnings.push(...cutover.warnings);
        const client = opts.client ?? new FintableClient({ token: opts.token });

        const snapshot = await readFintableSnapshot(client, {
            // Filtre grossier côté API (réduit la page) ; la borne EXACTE (stricte) est appliquée
            // par le mapper via `transactionsAfter` — les deux se recoupent, aucun risque à ce que
            // l'API soit inclusive du jour de bascule.
            dateFrom: cutoverDateUsed ?? undefined,
            dateTo: todayStr,
        });

        const { payloads, report: mapReport } = mapFintableSnapshot(snapshot, {
            roles: opts.roles,
            transactionsAfter: cutoverDateUsed,
        });

        /**
         * Applique les payloads sur une base DONNÉE puis écrit sous son jeton de version.
         *
         * ⚠️ [FINTABLE-SYNC-STALE-BASE] Le rapport est reconstruit à CHAQUE tentative, jamais
         * réutilisé : ses compteurs (`transactionsAdded`, `warnings`) décrivent ce qui a réellement
         * été appliqué SUR CETTE BASE. Les recycler après une relecture les rendrait faux — la
         * déduplication de `applyDocument` ne compte pas les mêmes doublons face à un état différent.
         */
        const applyAndSave = async (base: AppState, baseVersion: typeof version): Promise<FintableSyncReport> => {
            // Isolation PAR PAYLOAD : logique PARTAGÉE (`syncCore`) — voir son en-tête pour les deux
            // findings de panel qu'elle porte (rejet légitime qui avortait toute la passe ; ordre des
            // payloads qui EST le contrat de `applyCashBalance`).
            const applied = applyPayloadsIsolated(base, payloads);
            const { transactionsAdded, cashUpdated, cashAnchorDelta, debtsUpdated, warnings: applyWarnings } = applied;

            const report: FintableSyncReport = {
                at: Date.now(),
                cutoverDateUsed,
                accountsSeen: snapshot.accounts.length,
                accountsWithoutRole: mapReport.accountsWithoutRole.length,
                transactionsAdded,
                transfersDetected: mapReport.transferPairs.length,
                cashUpdated,
                cashAnchorDelta,
                debtsUpdated,
                investmentReferenceCount: mapReport.investmentBalances.length,
                warnings: [...preflightWarnings, ...mapReport.warnings, ...applyWarnings],
                error: null,
            };
            // [FINTABLE-6] Les soldes courtier étaient CALCULÉS par le mapper puis JETÉS (seul un
            // compteur survivait dans le rapport) — une donnée produite sans consommateur, exactement
            // la classe [[TX-DUPLICATES]] « une machinerie sans alimentation », à l'envers. On les
            // persiste maintenant : ils font autorité sur le total des comptes de placement (choix
            // Marc). Écrits même si la liste est VIDE : une liste vide signifie « le courtier n'a
            // rien dit d'exploitable cette passe », ce qui doit EFFACER une valeur d'hier devenue
            // fausse plutôt que la laisser traîner (une autorité périmée est pire qu'une absence).
            await store.save({
                ...applied.nextState,
                fintableSyncReport: report,
                fintableBrokerBalances: toPersistableBrokerBalances(mapReport.investmentBalances, report.at),
            }, baseVersion);
            return report;
        };

        try {
            return await applyAndSave(state, version);
        } catch (saveErr) {
            if (!isStateConflictError(saveErr)) throw saveErr;
            // ⚠️ [FINTABLE-SYNC-STALE-BASE] L'app a poussé pendant notre fenêtre réseau. Rien n'a été
            // écrasé (c'est tout l'intérêt de l'OCC), mais la passe ENTIÈRE était jetée : sur un cron
            // quotidien, ça coûte une journée de fraîcheur — exactement le symptôme que Marc a vécu
            // (« aucune update depuis 5 jours »). Une seule re-tentative suffit : on RE-APPLIQUE les
            // mêmes payloads sur l'état FRAIS (donc en tenant compte de ce que l'app vient d'écrire,
            // la déduplication et `computeStartingCash` voyant la nouvelle base) au lieu de rejouer
            // tout le réseau. Une 2ᵉ collision de suite reste transitoire → laissée au prochain tick,
            // plutôt qu'une boucle qui pourrait pilonner le Drive.
            const retryBase = await store.getWithVersion();
            try {
                return await applyAndSave(retryBase.state, retryBase.version);
            } catch (retryErr) {
                // ⚠️ [finding silent-failure-hunter, PR #566] Deux collisions D'AFFILÉE ne se
                // distinguaient pas d'une collision isolée : dans les deux cas l'erreur remontait
                // sans une ligne de trace. Or « une collision par jour » (deux crons mal
                // désynchronisés, un onglet qui écrit en boucle) est un problème SYSTÉMIQUE que
                // seule la répétition révèle — et que [FINTABLE-STALE-ALERT] ne diagnostiquerait
                // qu'indirectement, par péremption du vieux rapport. On trace sans changer le
                // comportement : toujours pas de rapport d'échec écrit (ce n'est pas une panne).
                if (isStateConflictError(retryErr)) {
                    logError({
                        source: 'storage', severity: 'warning',
                        message: '[FINTABLE-3] DEUX conflits OCC consécutifs — collision récurrente ?'
                            + ' La passe est abandonnée, le prochain tick réessaiera.',
                        error: retryErr instanceof Error ? retryErr : new Error(String(retryErr)),
                    });
                }
                throw retryErr;
            }
        }
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
