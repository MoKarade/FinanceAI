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
    /** Écart habituel OBSERVÉ entre deux jours d'activité (p90, NON clampé) ; `null` si inconnu.
     *  Séparé du seuil : le re-dériver depuis un seuil borné fabriquait un chiffre faux (panel #561). */
    observedGapDays: number | null;
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
/**
 * Plancher EFFECTIF (jours). ⚠️ Panel #561 : la version précédente valait 3 et ne protégeait de
 * RIEN — les écarts entre JOURS distincts sont ≥ 1 par construction, donc le seuil brut
 * (`ceil(médiane × 3)`) ne pouvait déjà jamais descendre sous 3. Résultat mesuré : un profil
 * « actif en semaine seulement » (très courant) obtenait 3 jours, et un long week-end férié
 * québécois de 4 jours sans dépense déclenchait une FAUSSE alerte « flux gelé côté fournisseur ».
 * Une alerte qui crie au loup s'apprend à s'ignorer — c'est pire que pas d'alerte.
 */
export const MIN_STALE_TRANSACTION_DAYS = 4;
/** Plafond : au-delà, l'alerte arriverait trop tard quel que soit le profil. */
export const MAX_STALE_TRANSACTION_DAYS = 14;
/**
 * Multiple appliqué au 90e PERCENTILE des écarts (pas à la médiane — panel #561). La médiane
 * écrase les creux légitimes : sur un profil semaine-seulement elle vaut 1 alors que les coupures
 * de week-end valent 3. Le p90 capte ces creux normaux et les absorbe au lieu de les signaler.
 */
const STALE_CADENCE_FACTOR = 2;
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
/** Écart p90 entre jours d'activité sur la fenêtre, ou `null` si l'échantillon est trop mince. */
export function observedGapDays(
    transactions: readonly Transaction[] | undefined,
    nowMs: number,
): number | null {
    const windowStart = nowMs - CADENCE_WINDOW_DAYS * MS_PER_DAY;
    const activeDays = [...new Set(
        (transactions ?? [])
            .map(txEpoch)
            .filter((v): v is number => v !== null && v >= windowStart && v <= nowMs)
            .map((ms) => Math.floor(ms / MS_PER_DAY)),
    )].sort((a, b) => a - b);

    if (activeDays.length < MIN_ACTIVE_DAYS_FOR_CADENCE) return null;

    const gaps: number[] = [];
    for (let i = 1; i < activeDays.length; i++) gaps.push(activeDays[i] - activeDays[i - 1]);
    gaps.sort((a, b) => a - b);
    // p90 (index plafonné) : absorbe les creux LÉGITIMES récurrents (week-ends, fériés) que la
    // médiane ignorait — c'est la source des fausses alertes mesurées au panel #561.
    return gaps[Math.min(gaps.length - 1, Math.ceil(gaps.length * 0.9) - 1)];
}

/**
 * Seuil de gel DÉRIVÉ des habitudes réelles, pas d'un chiffre choisi au jugé.
 *
 * `p90 des écarts entre jours d'activité × 2`, borné [MIN, MAX]. Le p90 plutôt que la médiane, et
 * un plancher RÉELLEMENT au-dessus du minimum atteignable : sinon un profil semaine-seulement (ou
 * un long week-end férié) déclenchait une fausse alerte — mesuré au panel #561.
 *
 * Sur le profil réel de Marc (activité quasi quotidienne, quelques coupures) : seuil de 4-6 jours,
 * soit une alerte à J+5 au plus tard. Il avait constaté le gel à J+5 par lui-même ; on l'égale sans
 * jamais crier au loup, ce qui vaut mieux qu'un jour gagné payé en fausses alertes. Un seuil FIXE
 * de 7 jours, lui, n'aurait rien dit avant J+8.
 */
export function computeStaleThresholdDays(
    transactions: readonly Transaction[] | undefined,
    nowMs: number,
): number {
    const gap = observedGapDays(transactions, nowMs);
    if (gap === null) return DEFAULT_STALE_TRANSACTION_DAYS;
    return Math.min(
        MAX_STALE_TRANSACTION_DAYS,
        Math.max(MIN_STALE_TRANSACTION_DAYS, Math.ceil(gap * STALE_CADENCE_FACTOR)),
    );
}

/**
 * Évalue la santé de l'import à l'instant `nowMs`.
 *
 * @param transactions Transactions connues, TOUTES SOURCES CONFONDUES.
 *   ⚠️ **LIMITE CONNUE** (finding #1 panel #561, ticket `[FINTABLE-SOURCE-TAG]`) : faute d'un champ
 *   de provenance sur `Transaction`, un import CSV manuel récent rend l'import Fintable « frais »
 *   alors qu'il peut être mort — le même vert trompeur que l'incident, par une autre porte. Ce
 *   n'est PAS un compromis tranché, c'est un angle mort assumé en attendant le tag de source.
 * @param report Dernier rapport de passe, ou `undefined` si aucune passe n'a jamais tourné.
 */
export function computeSyncHealth(
    transactions: readonly Transaction[] | undefined,
    report: FintableSyncReport | undefined,
    nowMs: number,
): SyncHealth {
    // ⚠️ `Math.max(...epochs)` passe par Function.prototype.apply et JETTE un RangeError au-delà
    // de ~125 000 arguments (MESURÉ, panel #561) — et comme ce calcul tourne dans le `useMemo` de la
    // bannière d'Accueil, l'exception ferait tomber TOUT l'onglet via l'ErrorBoundary, pas juste la
    // bannière. Un `reduce` n'a aucune limite d'arité. L'app vise le long terme (planification
    // retraite) : 100 k+ transactions n'est pas exotique sur plusieurs années et 6 comptes.
    let lastTxMs: number | null = null;
    for (const t of transactions ?? []) {
        const ms = txEpoch(t);
        if (ms !== null && (lastTxMs === null || ms > lastTxMs)) lastTxMs = ms;
    }
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
    const gapDays = observedGapDays(transactions, nowMs);
    const base = { staleThresholdDays, observedGapDays: gapDays, daysSinceLastTransaction, lastTransactionDate, hoursSinceLastSync, lastError };

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
            // ⚠️ La cadence citée est la cadence OBSERVÉE, jamais re-dérivée du seuil : quand le
            // seuil est clampé au plafond, la reconstruction affichait un chiffre FAUX présenté
            // comme un fait (panel #561, contraire au no-fake-data). Inconnue → on n'invente rien.
            reason: `Aucune transaction importée depuis ${daysSinceLastTransaction} jours `
                + `(dernière : ${lastTransactionDate}${gapDays === null ? ''
                    : ` ; ton rythme habituel en produit une tous les ${gapDays} jour(s)`}), `
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
