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
import { referenceDeltaPatch } from './applyStatePatch';

/** Une passe réussie par 24 h — la cadence demandée. */
const DAILY_MS = 24 * 3600_000;
/** Plancher entre deux TENTATIVES auto (anti-boucle de reload pendant une panne). */
const ATTEMPT_COOLDOWN_MS = 3600_000;
/** Horodatage device-local de la dernière tentative AUTO (≠ clic manuel, qui reste illimité). */
const ATTEMPT_KEY = 'financeai:fintable:lastAutoAttempt:v1';

let _inFlight = false;

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
    | { ran: false; reason: 'no-token' | 'test-mode' | 'fresh' | 'cooldown' | 'in-flight' }
    | { ran: true; report: FintableSyncReport };

/** Exporté pour test : la passe réussie d'hier déclenche, celle d'il y a 2 h non. */
export function isDailySyncDue(report: FintableSyncReport | undefined, now: number): boolean {
    if (!report || report.error !== null) return true; // jamais réussi (ou dernier = échec) → dû
    return now - report.at >= DAILY_MS;
}

/**
 * Tente la passe quotidienne. Ne LÈVE jamais. Idempotent à l'échelle d'une session (mutex +
 * cooldown) — appelable sans crainte depuis un effet React qui re-tire.
 */
export async function maybeRunDailyFintableSync(
    opts: { now?: () => number } = {},
): Promise<AutoSyncOutcome> {
    const now = opts.now ?? (() => Date.now());
    const state = useFinanceStore.getState() as unknown as AppState;
    const token = state.apiKeys?.fintable ?? '';

    if (typeof token !== 'string' || token.trim() === '') return { ran: false, reason: 'no-token' };
    if ((state as { isTestMode?: boolean }).isTestMode === true) return { ran: false, reason: 'test-mode' };
    if (!isDailySyncDue(state.fintableSyncReport, now())) return { ran: false, reason: 'fresh' };
    if (now() - readLastAttempt() < ATTEMPT_COOLDOWN_MS) return { ran: false, reason: 'cooldown' };
    if (_inFlight) return { ran: false, reason: 'in-flight' };

    _inFlight = true;
    writeLastAttempt(now());
    try {
        const { runFintableBrowserSync } = await importWithRetry(
            () => import('./browserSync'), 'fintable-sync',
        );
        // État relu au moment de COURIR (pas celui capturé aux gardes) : une passe qui écrirait
        // par-dessus un état plus vieux perdrait ce qui a changé entre-temps (même règle que la carte).
        const current = useFinanceStore.getState() as unknown as AppState;
        const { report, nextState } = await runFintableBrowserSync(current, token);
        const setAppState = (useFinanceStore.getState() as unknown as {
            setAppState: (p: Partial<AppState>) => void;
        }).setAppState;
        if (nextState === null) {
            // Échec : SEUL le rapport est écrit (diagnostics honnêtes), aucun contenu.
            setAppState({ fintableSyncReport: report });
            return { ran: true, report };
        }
        setAppState(referenceDeltaPatch(current, nextState));
        return { ran: true, report };
    } finally {
        _inFlight = false;
    }
}

/** Réservé aux tests. */
export function _resetAutoSyncForTests(): void {
    _inFlight = false;
    try { localStorage.removeItem(ATTEMPT_KEY); } catch { /* */ }
}
