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
        cutoverDateUsed = deriveCutoverDate(state.transactions);
        // ⚠️ [finding financial-integrity A3, PR #531] Une transaction datée dans le FUTUR (typo,
        // saisie pré-datée) pousserait la bascule EN AVANT de la date réelle → le mapper filtrerait
        // TOUTES les transactions Fintable comme « avant la bascule » (`transactionsAfter`), CHAQUE
        // JOUR, sans aucun signal (`ok:true, transactionsAdded:0` indéfiniment). Plafonné à
        // AUJOURD'HUI, et le plafonnement est TRACÉ (no silent caps) plutôt que simplement appliqué.
        if (cutoverDateUsed !== null && cutoverDateUsed > todayStr) {
            preflightWarnings.push(
                `Bascule dérivée (${cutoverDateUsed}) dans le FUTUR — une transaction existante est ` +
                `mal datée. Plafonnée à aujourd'hui (${todayStr}) pour ne pas bloquer la sync ; corrige la date en cause.`,
            );
            cutoverDateUsed = todayStr;
        }
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

        // ⚠️ [finding financial-integrity, PR #531, MESURÉ] Isolation PAR PAYLOAD : `applyDocument`
        // REJETTE volontairement un payload aberrant (solde de dette 0/négatif, dette introuvable,
        // cible de cash non finie…) — un rejet LÉGITIME côté validation, mais SANS isolation ici, il
        // avortait TOUTE la passe avant `store.save` : aucun payload valide n'était écrit, CHAQUE JOUR,
        // tant que la condition persistait (ex. une carte de crédit remboursée à 0 $ ce mois-ci). Les
        // compteurs du rapport reflètent maintenant ce qui a RÉELLEMENT été appliqué (pas ce que le
        // mapper a seulement PROPOSÉ) — un payload rejeté devient un avertissement, jamais un silence.
        // ⚠️ [finding financial-integrity A4, PR #531] Applique les payloads dans l'ORDRE fourni par
        // `mapFintableSnapshot` (bank_statement → cash_balance → debt) — ceci EST le contrat : `applyCashBalance`
        // calcule sa cible via `computeStartingCash(state)` À L'INSTANT de son application, donc appliquer
        // le `bank_statement` D'ABORD garantit que le cash tient compte des nouvelles transactions. Inverser
        // l'ordre déplacerait le cash de la valeur des transactions du jour — ne JAMAIS trier/réordonner `payloads`.
        let nextState: AppState = state;
        const applyWarnings: string[] = [];
        let transactionsAdded = 0;
        let cashUpdated = false;
        const debtsUpdated: string[] = [];
        for (const doc of payloads) {
            try {
                nextState = applyDocument(nextState, doc).nextState;
                if (doc.kind === 'bank_statement') transactionsAdded += doc.transactions.length;
                else if (doc.kind === 'cash_balance') cashUpdated = true;
                else if (doc.kind === 'debt') debtsUpdated.push(doc.name);
            } catch (payloadErr) {
                const reason = payloadErr instanceof Error ? payloadErr.message : String(payloadErr);
                applyWarnings.push(`Payload « ${doc.kind} » NON appliqué : ${reason}`);
            }
        }

        const report: FintableSyncReport = {
            at: Date.now(),
            cutoverDateUsed,
            accountsSeen: snapshot.accounts.length,
            accountsWithoutRole: mapReport.accountsWithoutRole.length,
            transactionsAdded,
            transfersDetected: mapReport.transferPairs.length,
            cashUpdated,
            debtsUpdated,
            investmentReferenceCount: mapReport.investmentBalances.length,
            warnings: [...preflightWarnings, ...mapReport.warnings, ...applyWarnings],
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
