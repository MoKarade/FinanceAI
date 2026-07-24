// services/googleDrive/gisAuth.ts
// Authentification Google Drive via Google Identity Services (GIS) — token client navigateur.
// Scope minimal : drive.appdata (dossier app caché) + userinfo.email (afficher le compte).
// Aucun secret client (flux token GIS public). Le token est gardé en mémoire ET mis en cache
// dans localStorage (clé dédiée, jamais synchronisée) pour éviter une reconnexion à chaque reload /
// fermeture d'onglet, + renouvellement silencieux avant expiration (cf plus bas). Scope minimal
// drive.appdata → un vol éventuel ne donne accès qu'au dossier app, et le jeton expire en ~1h.

import { logErrorThrottled } from '../errorLogger';

const GIS_SRC = 'https://accounts.google.com/gsi/client';

/**
 * [AUTH-DRIVE-STILL-RECONNECT] Trace DIAGNOSTIQUE d'un renouvellement silencieux impossible, throttlée
 * 1×/(contexte+raison)/session (`logErrorThrottled`) : le polling 60 s re-tente sinon → journal noyé.
 * `info` (pas un incident : une reprise sans session Google est nominale), mais la RAISON GIS exacte
 * (`popup_failed_to_open`, `login_required`, cookies tiers bloqués…) est ce qui permet à Marc de
 * diagnostiquer POURQUOI la reconnexion est redemandée — visible dans Réglages → Diagnostics.
 */
export function traceSilentRenewalFailure(context: 'minuteur' | 'gate' | 'boot', error: unknown): void {
    const reason = error instanceof Error ? error.message : String(error);
    logErrorThrottled(`drive-renew-fail:${context}:${reason}`, {
        source: 'network',
        severity: 'info',
        message: `Renouvellement Drive silencieux impossible (${context}) — ${reason}. La bannière de reconnexion prend le relais.`,
    });
}

/**
 * [AUTH-DRIVE-INACTIVITY] Erreur d'auth NOMINALE : une interaction utilisateur est requise (pas de
 * session Google active, consentement absent, cookies tiers bloqués, refus). Émise par le chemin GIS
 * `error_callback` / réponse refusée. À DISTINGUER d'une erreur ANORMALE (chargement du script GIS
 * échoué, timeout réseau) qui, elle, reste une `Error` générique. L'appelant (gateSilentResume/
 * runBootSync) journalise l'anormale mais garde le silence sur celle-ci (une reprise silencieuse qui
 * échoue faute de session est le cas normal, pas un incident à tracer).
 */
export class AuthInteractionRequiredError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AuthInteractionRequiredError';
    }
}
export const DRIVE_SCOPES = [
    'https://www.googleapis.com/auth/drive.appdata',
    'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

// ── Typage minimal de la surface GIS utilisée (évite `any`) ──────────────────
interface GisTokenResponse {
    access_token?: string;
    expires_in?: number;
    error?: string;
}
interface GisTokenClient {
    requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
    callback: (resp: GisTokenResponse) => void;
}
interface GisOAuth2 {
    initTokenClient: (config: {
        client_id: string;
        scope: string;
        callback: (resp: GisTokenResponse) => void;
        error_callback?: (err: { type?: string; message?: string }) => void;
    }) => GisTokenClient;
    revoke: (token: string, done?: () => void) => void;
}
interface GoogleNs { accounts?: { oauth2?: GisOAuth2 } }

function getGis(): GisOAuth2 | null {
    const g = (globalThis as { google?: GoogleNs }).google;
    return g?.accounts?.oauth2 ?? null;
}

// ── État module (en mémoire uniquement) ──────────────────────────────────────
let _clientId: string | null = null;
let _tokenClient: GisTokenClient | null = null;
let _cached: { accessToken: string; expiresAt: number } | null = null;
let _scriptPromise: Promise<void> | null = null;
// Rejet de la requête de token en cours, routé depuis l'`error_callback` GIS (défini une seule
// fois à l'init du client). Sans ça, un échec SANS réponse token (pas de session Google, popup
// bloqué…) ne rejetterait jamais la promesse → boot / gate figé indéfiniment.
let _pendingReject: ((e: Error) => void) | null = null;
// Minuteur de renouvellement silencieux du jeton (choix Marc 2026-07-16 : ne plus se reconnecter à ~1h
// tant que l'onglet vit). Armé après chaque acquisition, purgé à la révocation/reset.
let _renewTimer: ReturnType<typeof setTimeout> | undefined;

/** Marge avant expiration pour rafraîchir un peu en avance (évite un appel sur un token mourant). */
const EXPIRY_MARGIN_MS = 60_000;
/** Coussin supplémentaire avant l'échéance pour lancer le renouvellement (renouvelle ~2 min avant). */
const RENEW_LEAD_MS = 60_000;

// Persistance du jeton en localStorage (choix Marc 2026-07-16 : « je veux pas me reconnecter à chaque
// reload »). Le jeton GIS ne vit qu'en mémoire ~1h ; l'ancien cache sessionStorage était PERDU à la
// FERMETURE DE L'ONGLET et non partagé entre onglets → reconnexion à chaque nouvel onglet. localStorage
// survit à la fermeture d'onglet ET est partagé entre onglets du même appareil. ⚠️ Clé DÉDIÉE (≠
// `financeai-storage`, le store synchronisé) → le jeton n'est JAMAIS poussé vers Drive (secret
// device-local, comme les apiKeys). Portée minimale drive.appdata + email, expire ~1h (pas un secret
// long terme) : un vol ne donne accès qu'au dossier app, et pour < 1h. La péremption ~1h est couverte
// par le renouvellement silencieux (cf `scheduleTokenRenewal`) tant que l'onglet vit ; sinon la bannière
// de reconnexion prend le relais.
const TOKEN_STORAGE_KEY = 'financeai:gis:token:v1';

/** Persiste le jeton courant sur l'appareil (localStorage, best-effort). */
function persistCached(): void {
    try {
        if (typeof localStorage !== 'undefined' && _cached) {
            localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(_cached));
        }
    } catch {
        /* localStorage indispo (quota, nav privée stricte) — le jeton reste en mémoire pour cette page */
    }
}

/** Restaure le jeton depuis l'appareil s'il est encore valide (sinon purge). No-op si déjà en mémoire. */
function restoreCachedToken(): void {
    if (_cached) return;
    try {
        if (typeof localStorage === 'undefined') return;
        const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as { accessToken?: unknown; expiresAt?: unknown };
        if (
            typeof parsed.accessToken === 'string' &&
            typeof parsed.expiresAt === 'number' &&
            !isTokenExpired(parsed.expiresAt, Date.now())
        ) {
            _cached = { accessToken: parsed.accessToken, expiresAt: parsed.expiresAt };
        } else {
            localStorage.removeItem(TOKEN_STORAGE_KEY); // expiré / corrompu → purge
        }
    } catch {
        /* illisible — on repartira d'une ré-authentification */
    }
}

/** Efface le jeton persisté (déconnexion / reset). */
function clearCachedToken(): void {
    try {
        if (typeof localStorage !== 'undefined') localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
        /* best-effort */
    }
}

// [AUTH-DRIVE-PERSIST] Propagation CROSS-ONGLET de la déconnexion (finding security-privacy). Quand un
// AUTRE onglet efface le jeton de localStorage (`revokeAccess`→`clearCachedToken` lors d'une déconnexion
// ou d'une suppression Drive), l'événement `storage` se déclenche ICI — il ne se déclenche QUE dans les
// AUTRES onglets, jamais dans celui qui a fait le changement. On purge alors le jeton EN MÉMOIRE + on
// arrête le renouvellement silencieux → cet onglet cesse IMMÉDIATEMENT de pousser vers Drive. Sans ça,
// le renouvellement le garderait « connecté » indéfiniment après une déconnexion faite ailleurs (sync
// fantôme post-déconnexion, Loi 25 droit à l'effacement).
let _storageListenerBound = false;
function bindCrossTabDisconnect(): void {
    if (_storageListenerBound) return;
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    _storageListenerBound = true;
    window.addEventListener('storage', (e: StorageEvent) => {
        // Suppression de la clé jeton par un autre onglet → newValue null = déconnexion propagée.
        if (e.key === TOKEN_STORAGE_KEY && e.newValue === null) {
            _cached = null;
            clearRenewTimer();
        }
    });
}
bindCrossTabDisconnect();

/** Le Client ID OAuth est-il configuré ? (feature inerte sinon — cf VITE_GOOGLE_CLIENT_ID). */
export function isGoogleAuthConfigured(): boolean {
    return Boolean(_clientId);
}

/** Configure le Client ID (depuis l'env). À appeler au boot. */
export function configureGoogleAuth(clientId: string | undefined | null): void {
    _clientId = clientId && clientId.trim() ? clientId.trim() : null;
}

/** Pur : un token est-il (bientôt) expiré ? Exporté pour test. */
export function isTokenExpired(expiresAt: number, now: number, marginMs: number = EXPIRY_MARGIN_MS): boolean {
    return now + marginMs >= expiresAt;
}

/** Charge le script GIS une seule fois (résout immédiatement s'il est déjà là). */
function loadGisScript(): Promise<void> {
    if (getGis()) return Promise.resolve();
    if (_scriptPromise) return _scriptPromise;
    _scriptPromise = new Promise<void>((resolve, reject) => {
        if (typeof document === 'undefined') {
            reject(new Error('GIS indisponible (pas de DOM)'));
            return;
        }
        const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
        if (existing) {
            existing.addEventListener('load', () => resolve());
            existing.addEventListener('error', () => reject(new Error('Échec de chargement GIS')));
            if (getGis()) resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = GIS_SRC;
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Échec de chargement du script Google Identity Services'));
        document.head.appendChild(script);
    });
    return _scriptPromise;
}

function ensureTokenClient(): GisTokenClient {
    if (!_clientId) throw new Error('Google Client ID non configuré (VITE_GOOGLE_CLIENT_ID)');
    const oauth2 = getGis();
    if (!oauth2) throw new Error('GIS non chargé');
    if (!_tokenClient) {
        _tokenClient = oauth2.initTokenClient({
            client_id: _clientId,
            scope: DRIVE_SCOPES,
            callback: () => { /* remplacé par requête avant chaque appel */ },
            // GIS route ici les échecs SANS réponse token (pas de session, popup bloqué…).
            // On les renvoie vers le rejet de la requête courante (cf _pendingReject).
            error_callback: (err) => {
                const reject = _pendingReject;
                _pendingReject = null;
                // Interaction requise (pas de session / popup bloqué / cookies tiers) = NOMINAL au boot.
                if (reject) reject(new AuthInteractionRequiredError(`Échec de l'autorisation Google${err?.type ? ` (${err.type})` : ''}`));
            },
        });
    }
    return _tokenClient;
}

/**
 * Acquisition RÉSEAU d'un jeton via GIS. `prompt='consent'` = login interactif (popup, sous un geste).
 * `prompt=''` = renouvellement (réutilise le consentement existant ; peut aboutir SANS popup si la
 * session Google est active + cookies tiers non bloqués, sinon GIS lève un `error_callback`). Sur succès :
 * met en cache, persiste, et (re)programme le renouvellement silencieux.
 */
function acquireTokenViaNetwork(prompt: 'consent' | '', timeoutMs: number): Promise<string> {
    return loadGisScript().then(
        () =>
            new Promise<string>((resolve, reject) => {
                let client: GisTokenClient;
                try {
                    client = ensureTokenClient();
                } catch (e) {
                    reject(e instanceof Error ? e : new Error(String(e)));
                    return;
                }
                // Garde-fou : on ne règle la promesse qu'une fois (callback succès, error_callback,
                // ou timeout), et on nettoie systématiquement le rejet en attente + le minuteur.
                let settled = false;
                let timer: ReturnType<typeof setTimeout> | undefined;
                const settle = (fn: () => void): void => {
                    if (settled) return;
                    settled = true;
                    if (_pendingReject === onError) _pendingReject = null;
                    if (timer) clearTimeout(timer);
                    fn();
                };
                const onError = (e: Error): void => settle(() => reject(e));
                // Route l'error_callback GIS (défini à l'init) vers CE rejet.
                _pendingReject = onError;
                // Filet anti-hang : si GIS ne rappelle ni callback ni error_callback (cas limite).
                timer = setTimeout(
                    () => settle(() => reject(new Error("Délai dépassé pour l'autorisation Google"))),
                    timeoutMs,
                );
                client.callback = (resp: GisTokenResponse) => {
                    if (resp.error || !resp.access_token) {
                        // Refus / pas de jeton = interaction requise (nominal en reprise silencieuse).
                        settle(() => reject(new AuthInteractionRequiredError(`Autorisation Google refusée${resp.error ? `: ${resp.error}` : ''}`)));
                        return;
                    }
                    // Capturé en const : `resp.access_token` est narrowé à `string` ici, mais TS
                    // re-élargit dans la closure `settle(() => …)` ; la const préserve le type.
                    const accessToken = resp.access_token;
                    const expiresAt = Date.now() + (resp.expires_in ?? 3600) * 1000;
                    _cached = { accessToken, expiresAt };
                    persistCached(); // survit reload/fermeture d'onglet → plus de reconnexion à chaque reload
                    scheduleTokenRenewal(); // garde la session vivante au-delà de ~1h tant que l'onglet vit
                    settle(() => resolve(accessToken));
                };
                client.requestAccessToken({ prompt });
            }),
    );
}

/**
 * (Re)programme un renouvellement SILENCIEUX du jeton un peu avant son expiration, tant que l'onglet
 * vit (choix Marc 2026-07-16 : ne plus se reconnecter à ~1h). Best-effort : si GIS exige une UI
 * (session Google absente, cookies tiers bloqués), l'échec est SILENCIEUX et la bannière de
 * reconnexion (`SyncStatusBanner`) prend le relais — on n'ouvre JAMAIS un popup sans geste utilisateur.
 */
/** Arrête le minuteur de renouvellement (déconnexion / reset / re-armement). */
function clearRenewTimer(): void {
    if (_renewTimer) { clearTimeout(_renewTimer); _renewTimer = undefined; }
}

/** Plancher du délai de renouvellement : évite une boucle serrée si un `expires_in` anormalement
 *  court était renvoyé (Google renvoie ~3600s en pratique). Retente au pire toutes les 30 s. */
const MIN_RENEW_DELAY_MS = 30_000;

function scheduleTokenRenewal(): void {
    if (typeof setTimeout === 'undefined') return;
    clearRenewTimer();
    if (!_cached) return;
    const delay = Math.max(MIN_RENEW_DELAY_MS, _cached.expiresAt - Date.now() - EXPIRY_MARGIN_MS - RENEW_LEAD_MS);
    _renewTimer = setTimeout(() => {
        _renewTimer = undefined;
        // [code-reviewer] Ne PAS renouveler si une acquisition (login interactif) est DÉJÀ en vol :
        // `_tokenClient.callback`/`_pendingReject` sont des singletons — un 2e appel écraserait la
        // promesse en cours. On re-programme pour plus tard ; l'acquisition en vol, en cas de succès,
        // ré-arme de toute façon le renouvellement.
        if (_pendingReject) { scheduleTokenRenewal(); return; }
        // Succès → le callback réseau reprogramme via scheduleTokenRenewal. Échec → best-effort
        // (bannière), mais TRACÉ : le minuteur n'a AUCUN appelant pour router son échec → sans cette
        // trace, un jeton qui meurt à ~1h renvoie Marc au login sans qu'on sache pourquoi (le trou noir
        // de [AUTH-DRIVE-STILL-RECONNECT]).
        renewTokenSilently().catch((e: unknown) => traceSilentRenewalFailure('minuteur', e));
    }, delay);
}

/**
 * Renouvellement SILENCIEUX (réseau, `prompt=''`) — réservé au minuteur post-login. NE PAS appeler au
 * boot (popup bloqué sans geste, cf `requestAccessToken(false)`). Échoue proprement si GIS exige une UI.
 */
export function renewTokenSilently(): Promise<string> {
    return acquireTokenViaNetwork('', 15_000);
}

/**
 * Demande un access token. `interactive=true` force le consentement (1er login / re-grant) et
 * ouvre le popup Google (à n'appeler que SOUS un geste utilisateur — clic).
 *
 * `interactive=false` = reprise SILENCIEUSE au BOOT : on s'appuie UNIQUEMENT sur le cache (mémoire +
 * localStorage). Raison (fix `popup_failed_to_open`, Marc 2026-06) : au boot / hard-refresh il n'y a
 * pas de geste → un popup serait bloqué et GIS lèverait `popup_failed_to_open` à CHAQUE chargement.
 * On ne tente donc jamais de popup en silencieux au boot : sans jeton valide en cache, on rejette
 * proprement et l'appelant (gate / boot) bascule sur le bouton « Connecter ». Le renouvellement réseau
 * silencieux existe (cf `renewTokenSilently`) mais est réservé au MINUTEUR post-login (onglet vivant),
 * jamais au boot.
 */
export function requestAccessToken(interactive: boolean): Promise<string> {
    if (!interactive) {
        restoreCachedToken();
        if (_cached && !isTokenExpired(_cached.expiresAt, Date.now())) {
            scheduleTokenRenewal(); // jeton restauré valide → (re)armer le renouvellement pour cet onglet
            return Promise.resolve(_cached.accessToken);
        }
        return Promise.reject(new Error('Session Google expirée — reconnexion requise'));
    }
    return acquireTokenViaNetwork('consent', 120_000);
}

/**
 * Retourne un token valide DEPUIS LE CACHE (mémoire ou localStorage) s'il est bon. Sinon REJETTE
 * (cf `requestAccessToken(false)`, cache-only — plus de renouvellement réseau silencieux : GIS est
 * popup-only, ce qui échouait au boot sans geste utilisateur). Pour (ré)obtenir un jeton après
 * expiration, il faut passer par la connexion interactive (clic → `connectAndSync`).
 */
export function getValidAccessToken(): Promise<string> {
    restoreCachedToken(); // récupère le jeton d'un refresh précédent (évite une reconnexion)
    if (_cached && !isTokenExpired(_cached.expiresAt, Date.now())) {
        scheduleTokenRenewal(); // jeton valide → garder la session vivante (renouvellement pour cet onglet)
        return Promise.resolve(_cached.accessToken);
    }
    return requestAccessToken(false);
}

/** Token en cache (mémoire ou localStorage, sans réseau), ou null. Pour savoir si on est « connecté ». */
export function getCachedToken(): string | null {
    restoreCachedToken();
    if (_cached && !isTokenExpired(_cached.expiresAt, Date.now())) return _cached.accessToken;
    return null;
}

/** Révoque l'accès et purge le cache mémoire + appareil (déconnexion). Arrête le renouvellement. */
export function revokeAccess(): void {
    const oauth2 = getGis();
    if (_cached && oauth2) {
        try {
            oauth2.revoke(_cached.accessToken);
        } catch {
            /* révocation best-effort */
        }
    }
    _cached = null;
    clearRenewTimer();
    clearCachedToken();
}

/** Réinitialise l'état module — réservé aux tests. */
export function _resetForTests(): void {
    _clientId = null;
    _tokenClient = null;
    _cached = null;
    _scriptPromise = null;
    _pendingReject = null;
    clearRenewTimer();
    clearCachedToken();
}
