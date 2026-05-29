// services/sync/authGate.ts
// R2 — décision du « gate » de login Google (logique pure, testable, sans React).
//
// Le gate bloque l'app derrière un login Google (remplace le rôle de Cloudflare Access) ET sert
// de source du jeton Drive (un seul login pour l'app + la sync). Livraison « DARK » : il faut
//   1) un Client ID OAuth (VITE_GOOGLE_CLIENT_ID) — la *capacité* de sync, et
//   2) VITE_GOOGLE_GATE activé — l'*activation* du blocage,
// pour qu'il s'active. Découpler capacité et activation évite que « déployer = activer » :
// tant que VITE_GOOGLE_GATE est absent, le comportement prod est strictement inchangé.
//
// Trappe ANTI-LOCKOUT : si Google tombe ou bloque l'utilisateur, `?nogate=1` (ou un bouton
// « continuer sans me connecter ») permet toujours d'entrer dans l'app en local. On ne se
// retrouve JAMAIS enfermé dehors.

const ESCAPE_STORAGE_KEY = 'financeai:gate:escape';
const ESCAPE_URL_PARAMS = ['nogate', 'skipgate'];

/** Un flag d'env « truthy » ? (1 / true / on / yes, insensible à la casse). */
function isFlagOn(value: string | undefined): boolean {
    if (!value) return false;
    const s = value.trim().toLowerCase();
    return s === '1' || s === 'true' || s === 'on' || s === 'yes';
}

/**
 * Le gate de login est-il activé ? Capacité (Client ID) ET activation (VITE_GOOGLE_GATE) requises.
 * Les valeurs sont injectables pour les tests ; par défaut on lit l'env Vite.
 */
export function isGateEnabled(
    clientId: string | undefined = import.meta.env.VITE_GOOGLE_CLIENT_ID,
    gateFlag: string | undefined = import.meta.env.VITE_GOOGLE_GATE,
): boolean {
    return Boolean(clientId && clientId.trim()) && isFlagOn(gateFlag);
}

/** Trappe anti-lockout : l'utilisateur a-t-il choisi d'entrer sans login ? (URL ?nogate ou session) */
export function isGateEscaped(): boolean {
    try {
        if (typeof window !== 'undefined' && window.location?.search) {
            const params = new URLSearchParams(window.location.search);
            if (ESCAPE_URL_PARAMS.some((p) => params.has(p))) return true;
        }
        if (typeof sessionStorage !== 'undefined') {
            return sessionStorage.getItem(ESCAPE_STORAGE_KEY) === '1';
        }
    } catch {
        /* storage / URL inaccessibles → pas d'échappement mémorisé */
    }
    return false;
}

/** Mémorise « continuer sans me connecter » pour la session courante (pas au-delà). */
export function setGateEscaped(): void {
    try {
        if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(ESCAPE_STORAGE_KEY, '1');
    } catch {
        /* best-effort : si le storage est indispo, l'état React du gate suffit pour la session */
    }
}

/**
 * Décision pure : faut-il afficher l'écran de login (bloquer l'app) ?
 * - gate désactivé → non (app directe, comportement actuel) ;
 * - trappe activée → non (anti-lockout) ;
 * - sinon → bloque tant que l'utilisateur n'est pas authentifié.
 */
export function gateRequiresLogin(input: { enabled: boolean; escaped: boolean; authenticated: boolean }): boolean {
    if (!input.enabled) return false;
    if (input.escaped) return false;
    return !input.authenticated;
}
