// services/sync/inactivityLogout.ts
//
// [AUTH-DRIVE-INACTIVITY] Déconnexion automatique de Google Drive après ~8h d'INACTIVITÉ (demande Marc
// 2026-07-22 : « déconnecte-moi au bout de genre 8h d'inactivité »). Double rôle :
//   1. Convenance : tant que tu es actif (< 8h), on te garde connecté sans reconnexion (la ré-auth
//      silencieuse au boot, cf syncLifecycle, s'appuie sur ce seuil) — « je le fais une fois, c'est bon ».
//   2. Vie privée (Loi 25) : BORNE la session — au-delà de 8h sans interaction, le jeton est révoqué,
//      exactement la protection que la leçon AUTH-DRIVE-PERSIST recommandait contre une session illimitée.
//
// L'horodatage « dernière activité » est persisté en localStorage (clé DÉDIÉE, device-local, JAMAIS
// synchronisée vers Drive — comme le jeton). L'écriture est throttlée (au plus 1×/min) pour ne pas
// marteler localStorage à chaque événement. Le seuil traverse reload ET fermeture d'onglet (persisté).

const KEY = 'financeai:lastActivity:v1';
export const INACTIVITY_LIMIT_MS = 8 * 60 * 60 * 1000; // 8 heures
const WRITE_THROTTLE_MS = 60_000; // au plus une écriture localStorage par minute

let _lastWrite = 0;

/** Marque « il y a de l'activité maintenant » (throttlé). À appeler sur interaction + à la connexion. */
export function recordActivity(now: number = Date.now()): void {
    if (now - _lastWrite < WRITE_THROTTLE_MS) return;
    _lastWrite = now;
    try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, String(now));
    } catch {
        /* localStorage indispo (nav privée stricte, quota) — best-effort */
    }
}

/** Horodatage de la dernière activité, ou null si jamais enregistré. */
export function getLastActivityAt(): number | null {
    try {
        if (typeof localStorage === 'undefined') return null;
        const raw = localStorage.getItem(KEY);
        if (!raw) return null;
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
    } catch {
        return null;
    }
}

/**
 * A-t-on dépassé le seuil d'inactivité ? PUR (exporté pour test). Si aucune activité n'a jamais été
 * enregistrée (null), on renvoie `false` — pas d'expiration spontanée avant la 1ʳᵉ connexion/activité
 * (sinon un tout premier accès serait considéré « inactif » à tort).
 */
export function isInactivityExpired(now: number = Date.now(), limitMs: number = INACTIVITY_LIMIT_MS): boolean {
    const last = getLastActivityAt();
    if (last === null) return false;
    return now - last >= limitMs;
}

/** Efface l'horodatage (déconnexion / reset). */
export function clearActivity(): void {
    _lastWrite = 0;
    try {
        if (typeof localStorage !== 'undefined') localStorage.removeItem(KEY);
    } catch {
        /* best-effort */
    }
}

// ── Surveillance active (onglet ouvert) ──────────────────────────────────────
let _timer: ReturnType<typeof setTimeout> | undefined;
let _onExpire: (() => void) | null = null;
let _bound = false;
// `visibilitychange` est un événement du DOCUMENT (pas window) ; pointerdown/keydown bullent jusqu'au
// document → on écoute tout sur `document` (un seul point d'attache).
const ACTIVITY_EVENTS: Array<keyof DocumentEventMap> = ['pointerdown', 'keydown', 'visibilitychange'];

function clearTimer(): void {
    if (_timer) { clearTimeout(_timer); _timer = undefined; }
}

/** (Re)programme le déclenchement à `dernièreActivité + 8h`. Si déjà dépassé → tire tout de suite. */
function reschedule(): void {
    clearTimer();
    if (typeof setTimeout === 'undefined') return;
    const last = getLastActivityAt() ?? Date.now();
    const delay = Math.max(0, last + INACTIVITY_LIMIT_MS - Date.now());
    _timer = setTimeout(() => {
        _timer = undefined;
        // Re-vérifie (une activité a pu survenir juste avant l'échéance sans re-planifier) : si vraiment
        // expiré → déconnexion ; sinon on repousse au nouveau seuil.
        if (isInactivityExpired()) _onExpire?.();
        else reschedule();
    }, delay);
}

function onActivity(): void {
    // `visibilitychange` couvre le retour sur l'onglet ; on n'enregistre que quand la page est visible
    // (un onglet en arrière-plan n'est pas de l'« activité »).
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    // [Finding panel silent-failure] ⚠️ Un onglet SPA GELÉ par le navigateur (tab freezing, veille)
    // > 8h peut ne PAS avoir exécuté son setTimeout : au retour, il faut VÉRIFIER l'expiration AVANT
    // de réenregistrer l'activité — sinon on écraserait silencieusement une expiration déjà consommée
    // (la borne 8h ne tiendrait pas pour un onglet jamais rechargé). Si déjà expiré → déconnexion.
    if (isInactivityExpired()) { _onExpire?.(); return; }
    recordActivity();
    reschedule();
}

/**
 * Démarre la surveillance d'inactivité : enregistre l'activité utilisateur (throttlé) et déclenche
 * `onExpire` après 8h sans interaction. Retourne une fonction d'arrêt. `onExpire` doit révoquer le
 * jeton Drive (cf syncLifecycle.handleInactivityLogout).
 */
export function startInactivityWatch(onExpire: () => void): () => void {
    if (typeof document === 'undefined') return () => {};
    _onExpire = onExpire;
    if (!_bound) {
        _bound = true;
        for (const ev of ACTIVITY_EVENTS) document.addEventListener(ev, onActivity, { passive: true });
    }
    recordActivity(); // ancre le début de session comme activité (le compte à rebours part de maintenant)
    reschedule();
    return () => {
        clearTimer();
        _onExpire = null;
        if (_bound) {
            _bound = false;
            for (const ev of ACTIVITY_EVENTS) document.removeEventListener(ev, onActivity);
        }
    };
}
