// services/fintable/autoSync.ts
//
// [FINTABLE-7 Lot 3] Déclenchement AUTOMATIQUE de la passe Fintable à l'ouverture de l'app,
// throttlé 1×/jour (demande Marc — la carte Réglages n'offrait qu'un bouton manuel).
//
// Règles de déclenchement (toutes doivent passer) :
//   - jeton Fintable présent (hydraté ASYNC depuis le coffre → l'appelant est un effet RÉACTIF au
//     jeton, pas un timer au boot qui lirait un store encore vide) ;
//   - PAS en mode test (jamais de données réelles mêlées à un persona — même garde que la carte) ;
//   - dernière passe RÉUSSIE il y a ≥ 24 h (`fintableSyncReport.at`, `error === null`). Une passe
//     ÉCHOUÉE ne bloque PAS 24 h (sinon un raté réseau au boot gèlerait la sync un jour entier) —
//     c'est le garde-fou de TENTATIVE qui borne les retries ;
//   - dernière TENTATIVE auto il y a ≥ 1 h (horodatage device-local, jamais synchronisé) : sans lui,
//     des reloads rapprochés pendant une panne re-tenteraient à chaque F5 ;
//   - aucune passe déjà en vol (mutex module).
//
// Le service ne TOASTE pas lui-même (pas de dépendance service→UI) : il rend un résultat honnête et
// l'appelant (App) décide quoi montrer. Échec → rapport PERSISTÉ (diagnostics) + logError déjà fait
// par runFintableBrowserSync ; jamais d'état à moitié écrit (`nextState: null` → rien du contenu).

import type { AppState, FintableSyncReport } from '../../types';
import { useFinanceStore } from '../../store/useFinanceStore';
import { importWithRetry } from '../../utils/lazyWithRetry';
import { logError } from '../errorLogger';

/** Une passe réussie par 24 h — la cadence demandée. */
const DAILY_MS = 24 * 3600_000;
/** Plancher entre deux TENTATIVES auto (anti-boucle de reload pendant une panne). */
const ATTEMPT_COOLDOWN_MS = 3600_000;
/** Horodatage device-local de la dernière tentative AUTO (≠ clic manuel, qui reste illimité). */
const ATTEMPT_KEY = 'financeai:fintable:lastAutoAttempt:v1';

// [Finding code-reviewer #545, CRITIQUE] Verrou PARTAGÉ auto ↔ manuel : la carte Réglages appelle
// `runFintableBrowserSync` directement — sans exclusion mutuelle, une passe MANUELLE lancée pendant
// la passe AUTO (fenêtre réseau de plusieurs secondes) calculerait son patch sur une base FIGÉE
// antérieure à l'écriture de l'autre → dernier-écrivain-gagne sur `transactions`/soldes/dettes
// (perte silencieuse de données réelles). Les DEUX chemins acquièrent CE verrou.
let _inFlight = false;

/** Tente de prendre le verrou de sync Fintable (auto OU manuel). `false` = une passe est en vol. */
export function acquireFintableSyncLock(): boolean {
    if (_inFlight) return false;
    _inFlight = true;
    return true;
}

/** Relâche le verrou (TOUJOURS en finally chez l'appelant). */
export function releaseFintableSyncLock(): void {
    _inFlight = false;
}

function readLastAttempt(): number {
    try {
        const raw = localStorage.getItem(ATTEMPT_KEY);
        const n = raw === null ? 0 : Number(raw);
        return Number.isFinite(n) && n > 0 ? n : 0;
    } catch { return 0; }
}

function writeLastAttempt(at: number): void {
    try { localStorage.setItem(ATTEMPT_KEY, String(at)); } catch { /* best-effort */ }
}

export type AutoSyncOutcome =
    | { ran: false; reason: 'no-token' | 'test-mode' | 'fresh' | 'cooldown' | 'in-flight' | 'error' }
    | { ran: true; report: FintableSyncReport };

/** Exporté pour test : la passe réussie d'hier déclenche, celle d'il y a 2 h non. */
export function isDailySyncDue(report: FintableSyncReport | undefined, now: number): boolean {
    if (!report || report.error !== null) return true; // jamais réussi (ou dernier = échec) → dû
    return now - report.at >= DAILY_MS;
}

/** Le mode test est-il actif MAINTENANT (lecture fraîche du store) ? */
function isTestModeNow(): boolean {
    return (useFinanceStore.getState() as { isTestMode?: boolean }).isTestMode === true;
}

/**
 * [FINTABLE-SYNC-XTAB-MUTEX] Verrou CROSS-ONGLET, quand le navigateur sait le faire.
 *
 * ⚠️ Ce que le cooldown ne fait PAS. `_inFlight` est une variable de MODULE : elle ne protège que
 * l'onglet courant. Le cooldown, lui, vit dans `localStorage` (partagé), mais sa lecture et son
 * écriture sont DEUX opérations : deux onglets peuvent lire le même vieil horodatage, passer tous
 * les deux la garde, puis écrire chacun le leur. La fenêtre est étroite en usage normal — et large
 * exactement quand elle compte : un navigateur qui restaure deux onglets épinglés les démarre au
 * même instant.
 *
 * L'API Web Locks donne le mutex réel que `localStorage` ne peut pas offrir (il n'a pas de
 * compare-and-swap). `ifAvailable: true` = on n'attend PAS : si un autre onglet tient le verrou, on
 * rend `null` et l'appelant répond « in-flight », exactement comme pour un doublon intra-onglet.
 *
 * ⚠️ Repli EXPLICITE quand l'API est absente (jsdom, navigateurs anciens, contexte non sécurisé) :
 * on exécute quand même, avec les gardes d'avant. Sans ce repli la sync ne tournerait JAMAIS là où
 * l'API manque — un verrou qui bloque tout est pire que le défaut qu'il corrige. C'est aussi ce
 * chemin-là que les tests empruntent, donc il est couvert par construction.
 */
type LockManagerLike = {
    request: <T>(
        name: string,
        options: { ifAvailable?: boolean },
        cb: (lock: unknown) => Promise<T>,
    ) => Promise<T>;
};

function lockManager(): LockManagerLike | null {
    const nav = (globalThis as { navigator?: { locks?: LockManagerLike } }).navigator;
    return typeof nav?.locks?.request === 'function' ? nav.locks : null;
}

const XTAB_LOCK_NAME = 'financeai:fintable-sync';

// Générique : partagé par la passe auto (`maybeRunDailyFintableSync`) ET le bouton manuel
// (`FintableSyncCard`) — même nom de verrou, donc les deux s'excluent aussi ENTRE ONGLETS.
export async function withCrossTabLock<T>(
    run: () => Promise<T>,
    onBusy: () => T,
): Promise<T> {
    const locks = lockManager();
    if (!locks) return run();
    try {
        // ⚠️ [finding code-reviewer, CRITIQUE] Spec Web Locks : sous `ifAvailable`, le rappel est
        // TOUJOURS invoqué — avec `lock === null` quand le verrou est déjà pris ailleurs, il n'est
        // PAS sauté. Se fier au retour de `request()` (ex. `outcome ?? onBusy()`) est un piège : un
        // `run()` qui résout légitimement `undefined` (le cas de `handleSync`, `Promise<void>`)
        // aurait été pris pour « occupé » à CHAQUE passe réussie. La vérité est le paramètre reçu
        // PAR le rappel, jamais la valeur rendue par `request()`.
        return await locks.request<T>(
            XTAB_LOCK_NAME,
            { ifAvailable: true },
            async (lock) => (lock === null ? onBusy() : run()),
        );
    } catch (err) {
        // [finding silent-failure-hunter, ÉLEVÉ] Sans ce filet, un rejet de `locks.request` (échec
        // d'infra Web Locks, ou une exception qui échapperait au `run()` de l'appelant) remontait
        // NON journalisé — et pour la carte manuelle, `void handleSync(...)` au clic ne capte rien.
        logError({
            source: 'ui', severity: 'error',
            message: '[FINTABLE-SYNC-XTAB] Verrou cross-onglet : rejet inattendu.',
            error: err instanceof Error ? err : new Error(String(err)),
        });
        throw err;
    }
}

/**
 * Tente la passe quotidienne. Ne LÈVE jamais. Idempotent à l'échelle d'une session (mutex +
 * cooldown) et, quand le navigateur expose l'API Web Locks, à l'échelle de TOUS LES ONGLETS.
 * Appelable sans crainte depuis un effet React qui re-tire.
 */
export async function maybeRunDailyFintableSync(
    opts: { now?: () => number } = {},
): Promise<AutoSyncOutcome> {
    // ⚠️ Le verrou enveloppe TOUTES les gardes, cooldown compris : le protéger seulement autour du
    // réseau laisserait la course là où elle est — entre la LECTURE et l'ÉCRITURE du cooldown.
    return withCrossTabLock(
        () => runDailyFintableSyncGuarded(opts),
        () => ({ ran: false, reason: 'in-flight' }),
    );
}

async function runDailyFintableSyncGuarded(
    opts: { now?: () => number } = {},
): Promise<AutoSyncOutcome> {
    const now = opts.now ?? (() => Date.now());
    const state = useFinanceStore.getState() as unknown as AppState;
    const token = state.apiKeys?.fintable ?? '';

    if (typeof token !== 'string' || token.trim() === '') return { ran: false, reason: 'no-token' };
    if (isTestModeNow()) return { ran: false, reason: 'test-mode' };
    if (!isDailySyncDue(state.fintableSyncReport, now())) return { ran: false, reason: 'fresh' };
    if (now() - readLastAttempt() < ATTEMPT_COOLDOWN_MS) return { ran: false, reason: 'cooldown' };
    if (!acquireFintableSyncLock()) return { ran: false, reason: 'in-flight' };

    writeLastAttempt(now());
    try {
        // [Finding silent-failure #545] TOUT le corps est sous UN catch : `importWithRetry` PEUT
        // lever (erreur non chunk-load, ou reload anti-boucle déjà consommé) et
        // `runFintableBrowserSync` ne lève pas par contrat mais le catch le couvre quand même
        // (ceinture). Sans lui, « ne LÈVE jamais » était faux : la rejection traversait le
        // `void (async…)` de l'effet App jusqu'au handler générique `unhandledrejection`
        // (source 'unknown', signal dilué). Outcome honnête + trace ciblée à la place.
        const { runFintableBrowserSync } = await importWithRetry(
            () => import('./browserSync'), 'fintable-sync',
        );
        // [Finding code-reviewer #545 §4] Gardes RE-vérifiées à l'état FRAIS après l'await : le
        // jeton peut avoir été effacé et le mode démo activé pendant le chargement du chunk.
        const current = useFinanceStore.getState() as unknown as AppState;
        const freshToken = current.apiKeys?.fintable ?? '';
        if (typeof freshToken !== 'string' || freshToken.trim() === '') return { ran: false, reason: 'no-token' };
        if (isTestModeNow()) return { ran: false, reason: 'test-mode' };

        // ⚠️ [FINTABLE-SYNC-STALE-BASE] `current` est la base PRÉ-fetch ; `getFreshState` relit le
        // store juste avant l'application pour qu'une saisie manuelle faite pendant le réseau ne
        // soit pas écrasée (le verrou de sync ne protège que contre une autre PASSE).
        const { report, statePatch } = await runFintableBrowserSync(current, freshToken, {
            getFreshState: () => useFinanceStore.getState() as unknown as AppState,
        });

        // ⚠️ [Finding security-privacy #545, ÉLEVÉ, PROUVÉ par sonde] Re-vérifier le mode démo
        // APRÈS le réseau, AVANT toute écriture : basculer en persona PENDANT le fetch (plusieurs
        // secondes) faisait écrire de VRAIES transactions/soldes dans la session de DÉMONSTRATION
        // affichée à un tiers — l'inverse exact de PERSONA-PURGE. Abandon honnête : rien n'est
        // écrit (pas même le rapport), le travail réseau est perdu, la prochaine ouverture hors
        // démo re-synchronisera.
        if (isTestModeNow()) return { ran: false, reason: 'test-mode' };

        const setAppState = (useFinanceStore.getState() as unknown as {
            setAppState: (p: Partial<AppState>) => void;
        }).setAppState;
        if (statePatch === null) {
            // Échec : SEUL le rapport est écrit (diagnostics honnêtes), aucun contenu.
            setAppState({ fintableSyncReport: report });
            return { ran: true, report };
        }
        setAppState(statePatch);
        return { ran: true, report };
    } catch (err) {
        logError({
            source: 'ui', severity: 'error',
            message: '[FINTABLE-7] Sync auto : passe interrompue par une exception (chunk périmé ?).',
            error: err instanceof Error ? err : new Error(String(err)),
        });
        // [Finding code-reviewer #545 §2] « Rapport toujours écrit » vaut AUSSI pour ce chemin :
        // sans lui, la carte Réglages ne montrait RIEN de cette tentative. Gaté mode démo (jamais
        // d'écriture pendant un persona, même un rapport).
        if (!isTestModeNow()) {
            const setAppState = (useFinanceStore.getState() as unknown as {
                setAppState: (p: Partial<AppState>) => void;
            }).setAppState;
            setAppState({
                fintableSyncReport: {
                    at: now(), cutoverDateUsed: null, accountsSeen: 0, accountsWithoutRole: 0,
                    transactionsAdded: 0, transfersDetected: 0, cashUpdated: false, debtsUpdated: [],
                    investmentReferenceCount: 0, warnings: [],
                    error: err instanceof Error ? err.message : String(err),
                },
            });
        }
        return { ran: false, reason: 'error' };
    } finally {
        releaseFintableSyncLock();
    }
}

/** Réservé aux tests. */
export function _resetAutoSyncForTests(): void {
    _inFlight = false;
    try { localStorage.removeItem(ATTEMPT_KEY); } catch { /* */ }
}
