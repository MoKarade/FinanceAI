// services/history/syncDiagnostics.ts
//
// [HIST-MULTI-PROVIDER] Dernier rapport de synchronisation des historiques de cours, exposé à
// l'UI (diagnostic PAR TITRE + correction inline du symbole de cotation dans Investissements).
// Module PUR (pattern viewContext/ARCH-SYNC-SPLIT) : aucun store persisté — le rapport est un
// état de SESSION (recalculé à chaque hydratation), rien à synchroniser ni à migrer.
//
// ⚠️ Vie privée / mode test : le rapport porte les TICKERS RÉELS de l'utilisateur → il n'est
// JAMAIS rendu en mode démo persona (gate côté UI) et il est PURGÉ à l'entrée en mode test
// (clearHistorySyncReport — même classe que PERSONA-PURGE « zéro fuite inter-persona »).

import type { HydrateHistoryResult } from './hydrateAssetHistories';
import type { PriceSkipReason } from '../priceRefresh';
import { logError } from '../errorLogger';

export interface HistorySyncReport {
    /** Epoch ms de la fin de l'hydratation. */
    at: number;
    /** Skips de la dernière passe (raisons + détails actionnables). */
    skipped: HydrateHistoryResult['skipped'];
    /** Nombre de titres patchés (historique mis à jour) par la dernière passe. */
    patchedCount: number;
    /** [PRICE-SYNC-REPORT] Titres dont la QUOTE (currentPrice) n'a pas pu être rafraîchie à la
     *  dernière passe (boot ou bouton) — avant, ces skips n'avaient AUCUNE surface UI (journal
     *  seulement, finding ÉLEVÉ silent-failure #499). Publié via `updateQuoteSkips`. */
    quoteSkips?: Array<{ symbol: string; reason: PriceSkipReason }>;
}

let _report: HistorySyncReport | null = null;
const _listeners = new Set<() => void>();

export function setHistorySyncReport(report: HistorySyncReport): void {
    _report = report;
    for (const l of _listeners) {
        try {
            l();
        } catch (e) {
            // Un listener UI qui jette ne doit pas casser les autres ni l'hydratation (même
            // patron que les callbacks isolés d'agentLoop).
            logError({ source: 'ui', severity: 'warning', message: 'Listener de diagnostic de sync en échec (ignoré).', error: e instanceof Error ? e : new Error(String(e)) });
        }
    }
}

/** [PRICE-SYNC-REPORT] Publie les skips de QUOTES de la dernière passe (boot/bouton) en les
 *  FUSIONNANT dans le rapport courant (créé au besoin — le refresh des quotes peut tourner sans
 *  hydratation d'historique). Toujours appelé, même avec [] : une passe propre EFFACE les skips
 *  périmés de la passe précédente (classe « staleness silencieuse »). */
export function updateQuoteSkips(quoteSkips: Array<{ symbol: string; reason: PriceSkipReason }>): void {
    _report = {
        at: Date.now(),
        skipped: _report?.skipped ?? [],
        patchedCount: _report?.patchedCount ?? 0,
        quoteSkips,
    };
    for (const l of _listeners) {
        try {
            l();
        } catch (e) {
            logError({ source: 'ui', severity: 'warning', message: 'Listener de diagnostic de sync en échec (ignoré).', error: e instanceof Error ? e : new Error(String(e)) });
        }
    }
}

export function clearHistorySyncReport(): void {
    if (_report === null) return;
    _report = null;
    for (const l of _listeners) {
        try {
            l();
        } catch (e) {
            // Même isolation ET même traçabilité que setHistorySyncReport (finding silent-failure
            // #494 : un catch muet ici cachait un bug de listener qui ne se manifeste qu'au clear).
            logError({ source: 'ui', severity: 'warning', message: 'Listener de diagnostic de sync en échec au clear (ignoré).', error: e instanceof Error ? e : new Error(String(e)) });
        }
    }
}

/** Snapshot stable pour useSyncExternalStore (référence inchangée tant que rien n'est publié). */
export function getHistorySyncReport(): HistorySyncReport | null {
    return _report;
}

export function subscribeHistorySyncReport(listener: () => void): () => void {
    _listeners.add(listener);
    return () => { _listeners.delete(listener); };
}

/**
 * [FUTURE-HISTORY-EMPTY-CAUSE] Skips sur lesquels un ÉCRAN a quelque chose à dire, dédupliqués par
 * symbole. Source unique du critère : `HistorySyncDoctor` le portait seul, et l'état vide du graphe
 * « Évolution » allait en faire une deuxième copie — deux copies d'un critère divergent en silence.
 *
 * - `empty` (introuvable / refusé) et `error` (panne) sont ACTIONNABLES ; les raisons nominales
 *   (`fresh`), hors navigateur (`no-provider`) ou déjà détaillées au journal (`currency-mismatch`)
 *   n'appellent aucune action à l'écran.
 * - DÉDUP par symbole (finding code-reviewer #494, mesuré) : le même titre détenu dans deux comptes
 *   produit deux skips — donc deux clés React et deux `id` DOM identiques. Le remède (fixer le
 *   symbole de cotation) s'applique de toute façon à TOUS les actifs de ce symbole.
 */
export function skipsActionnables(report: HistorySyncReport | null): HistorySyncReport['skipped'] {
    if (!report) return [];
    const parSymbole = new Map<string, HistorySyncReport['skipped'][number]>();
    for (const s of report.skipped) {
        if ((s.reason === 'empty' || s.reason === 'error') && !parSymbole.has(s.symbol)) parSymbole.set(s.symbol, s);
    }
    return [...parSymbole.values()];
}
