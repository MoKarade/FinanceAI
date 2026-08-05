// services/fintable/syncHealth.ts
//
// [FINTABLE-STALE-ALERT] Santé de l'import bancaire — fonction PURE, `now` injecté (patron
// `computeBackupNagStatus`).
//
// Pourquoi ce module existe (incident RÉEL 2026-08-05) : l'import de Marc a été gelé 5 jours
// (dernière transaction le 2026-07-31) et RIEN ne l'a signalé — ni dans l'app, ni à distance.
// C'est LUI qui a fini par le remarquer. Trois trous se sont combinés :
//   1. aucune surface ne comparait la date de la dernière transaction importée à aujourd'hui ;
//   2. une passe qui « réussit » avec 0 transaction est un VERT TROMPEUR quand le fournisseur
//      a gelé le flux (plan expiré, ré-auth bancaire) — classe PERF-STALE-TAIL-ZERO ;
//   3. `fintableSyncReport` n'était exposé par AUCUN tool MCP → diagnostic à distance impossible.
//
// ⚠️ SOURCE UNIQUE délibérée : l'UI et le MCP consomment CETTE fonction. La leçon
// MCP-NETINCOME-MISLEADING (2026-08-05, même journée) est qu'une seconde implémentation d'un même
// concept finit par diverger et fabriquer de faux diagnostics — ici, une app qui dit « à jour »
// pendant que le connecteur dit « gelé » serait pire que pas d'alerte du tout.

import type { AppState, FintableSyncReport, Transaction } from '../../types';

/** `never` = jamais synchronisé · `error` = la passe a échoué · `stale` = le flux est gelé. */
export type SyncHealthStatus = 'ok' | 'stale' | 'error' | 'never';

export interface SyncHealth {
    status: SyncHealthStatus;
    /** Seuil de gel RETENU pour ce profil (jours) — adaptatif, exposé pour être auditable. */
    staleThresholdDays: number;
    /** Jours entiers depuis la transaction la plus récente ; `null` si aucune transaction. */
    daysSinceLastTransaction: number | null;
    /** Date (YYYY-MM-DD) de la transaction la plus récente ; `null` si aucune. */
    lastTransactionDate: string | null;
    /** Heures depuis la fin de la dernière passe ; `null` si aucune passe connue. */
    hoursSinceLastSync: number | null;
    /** Erreur de la dernière passe, telle quelle (jamais reformulée) ; `null` si succès. */
    lastError: string | null;
    /** Phrase courte orientée CAUSE, affichable en l'état. */
    reason: string;
}

/**
 * Seuil de gel quand la cadence de l'utilisateur est inconnue (trop peu d'historique).
 *
 * ⚠️ Ce défaut ne doit PAS servir de règle générale : au premier jet, un seuil fixe de 7 jours
 * n'aurait PAS détecté l'incident réel (gel constaté par Marc à J+5) — l'alerte serait arrivée
 * APRÈS lui, ce qui la rend inutile. D'où le seuil ADAPTATIF ci-dessous, dérivé de ses propres
 * données plutôt que d'un chiffre choisi au jugé.
 */
export const DEFAULT_STALE_TRANSACTION_DAYS = 7;
/** Plancher : en dessous, un simple week-end calme déclencherait une fausse alerte. */
export const MIN_STALE_TRANSACTION_DAYS = 3;
/** Plafond : au-delà, l'alerte arriverait trop tard quel que soit le profil. */
export const MAX_STALE_TRANSACTION_DAYS = 14;
/** Multiple de l'intervalle habituel au-delà duquel le silence devient anormal. */
const STALE_CADENCE_FACTOR = 3;
/** Fenêtre d'observation de la cadence (jours). */
const CADENCE_WINDOW_DAYS = 90;
/** En deçà, l'échantillon est trop mince pour en tirer une cadence. */
const MIN_ACTIVE_DAYS_FOR_CADENCE = 5;
/** Au-delà, la passe elle-même ne tourne plus (le déclencheur est quotidien : 48 h = 2 tours ratés). */
export const STALE_SYNC_HOURS = 48;

const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;

/** Date d'une transaction en epoch ms, ou `null` si la donnée est inexploitable (jamais 0 : un 0
 *  silencieux daterait tout de 1970 et rendrait l'import éternellement « gelé »). */
function txEpoch(t: Transaction): number | null {
    const ms = Date.parse(`${t.date}T00:00:00Z`);
    return Number.isFinite(ms) ? ms : null;
}

/**
 * Seuil de gel DÉRIVÉ des habitudes réelles de l'utilisateur, pas d'un chiffre choisi au jugé.
 *
 * Méthode : on prend les JOURS d'activité distincts des `CADENCE_WINDOW_DAYS` derniers jours (des
 * jours, pas des transactions — sinon 5 achats le même samedi feraient croire à une cadence de
 * quelques heures), on mesure la MÉDIANE des écarts entre eux (robuste aux vacances, contrairement
 * à la moyenne), et le silence devient anormal à `STALE_CADENCE_FACTOR ×` cet écart.
 *
 * Sur le profil réel de Marc (activité quasi quotidienne → médiane 1 jour), ça donne un seuil de
 * 3 jours : il aurait été prévenu à J+4, soit AVANT de le remarquer lui-même à J+5. Un seuil fixe
 * de 7 jours ne l'aurait alerté qu'à J+8 — trop tard pour servir à quelque chose.
 */
export function computeStaleThresholdDays(
    transactions: readonly Transaction[] | undefined,
    nowMs: number,
): number {
    const windowStart = nowMs - CADENCE_WINDOW_DAYS * MS_PER_DAY;
    const activeDays = [...new Set(
        (transactions ?? [])
            .map(txEpoch)
            .filter((v): v is number => v !== null && v >= windowStart && v <= nowMs)
            .map((ms) => Math.floor(ms / MS_PER_DAY)),
    )].sort((a, b) => a - b);

    if (activeDays.length < MIN_ACTIVE_DAYS_FOR_CADENCE) return DEFAULT_STALE_TRANSACTION_DAYS;

    const gaps: number[] = [];
    for (let i = 1; i < activeDays.length; i++) gaps.push(activeDays[i] - activeDays[i - 1]);
    gaps.sort((a, b) => a - b);
    const median = gaps.length % 2 === 1
        ? gaps[(gaps.length - 1) / 2]
        : (gaps[gaps.length / 2 - 1] + gaps[gaps.length / 2]) / 2;

    return Math.min(
        MAX_STALE_TRANSACTION_DAYS,
        Math.max(MIN_STALE_TRANSACTION_DAYS, Math.ceil(median * STALE_CADENCE_FACTOR)),
    );
}

/**
 * Évalue la santé de l'import à l'instant `nowMs`.
 *
 * @param transactions Transactions connues (toutes sources confondues : une saisie manuelle
 *   récente prouve autant qu'un import que les données ne sont pas figées).
 * @param report Dernier rapport de passe, ou `undefined` si aucune passe n'a jamais tourné.
 */
export function computeSyncHealth(
    transactions: readonly Transaction[] | undefined,
    report: FintableSyncReport | undefined,
    nowMs: number,
): SyncHealth {
    const epochs = (transactions ?? []).map(txEpoch).filter((v): v is number => v !== null);
    const lastTxMs = epochs.length > 0 ? Math.max(...epochs) : null;
    // Une transaction datée dans le FUTUR (saisie erronée) ne doit pas rajeunir l'import :
    // on borne à 0 jour plutôt que de produire un négatif qui masquerait un vrai gel.
    const daysSinceLastTransaction = lastTxMs === null
        ? null
        : Math.max(0, Math.floor((nowMs - lastTxMs) / MS_PER_DAY));
    const lastTransactionDate = lastTxMs === null
        ? null
        : new Date(lastTxMs).toISOString().slice(0, 10);

    const reportAt = report && Number.isFinite(report.at) ? report.at : null;
    const hoursSinceLastSync = reportAt === null
        ? null
        : Math.max(0, Math.floor((nowMs - reportAt) / MS_PER_HOUR));
    const lastError = report?.error ?? null;

    const staleThresholdDays = computeStaleThresholdDays(transactions, nowMs);
    const base = { staleThresholdDays, daysSinceLastTransaction, lastTransactionDate, hoursSinceLastSync, lastError };

    if (report === undefined) {
        return { ...base, status: 'never', reason: "L'import bancaire n'a jamais été exécuté." };
    }
    if (lastError !== null) {
        // L'erreur BRUTE est conservée : elle porte le code ([AUTH], [HTTP 429]…) qui oriente le
        // diagnostic. La reformuler ferait perdre l'information qui sert vraiment.
        return { ...base, status: 'error', reason: `Dernière synchronisation en échec : ${lastError}` };
    }
    if (hoursSinceLastSync !== null && hoursSinceLastSync > STALE_SYNC_HOURS) {
        return {
            ...base,
            status: 'stale',
            reason: `Aucune synchronisation depuis ${Math.floor(hoursSinceLastSync / 24)} jour(s) — l'import ne tourne plus.`,
        };
    }
    if (daysSinceLastTransaction !== null && daysSinceLastTransaction > staleThresholdDays) {
        // ⚠️ LE cas de l'incident : la passe réussit, sans erreur, mais ne rapporte plus rien —
        // le flux est gelé CHEZ LE FOURNISSEUR. Sans cette branche, le statut resterait « ok ».
        return {
            ...base,
            status: 'stale',
            reason: `Aucune transaction importée depuis ${daysSinceLastTransaction} jours `
                + `(dernière : ${lastTransactionDate} ; ton rythme habituel en produit une tous les `
                + `${Math.max(1, Math.round(staleThresholdDays / 3))} jour(s)), `
                + 'alors que la synchronisation dit réussir : le flux est probablement gelé côté fournisseur '
                + '(abonnement expiré ou lien bancaire à ré-autoriser).',
        };
    }
    if (daysSinceLastTransaction === null) {
        return { ...base, status: 'stale', reason: 'Aucune transaction importée à ce jour.' };
    }
    return { ...base, status: 'ok', reason: `Import à jour (dernière transaction : ${lastTransactionDate}).` };
}

/** Raccourci depuis l'état complet — l'UI et le MCP passent tous deux par ici. */
export function syncHealthFromState(state: Pick<AppState, 'transactions' | 'fintableSyncReport'>, nowMs: number): SyncHealth {
    return computeSyncHealth(state.transactions, state.fintableSyncReport, nowMs);
}
