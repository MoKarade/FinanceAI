// services/googleDrive/gisAuth.ts
// Authentification Google Drive via Google Identity Services (GIS) — token client navigateur.
// Scope minimal : drive.appdata (dossier app caché) + userinfo.email (afficher le compte).
// Aucun secret client (flux token GIS public). Le token vit en mémoire (jamais persisté).

const GIS_SRC = 'https://accounts.google.com/gsi/client';
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

/** Marge avant expiration pour rafraîchir un peu en avance (évite un appel sur un token mourant). */
const EXPIRY_MARGIN_MS = 60_000;

// Persistance du jeton DANS LA SESSION (sessionStorage). Le jeton GIS ne vit qu'en mémoire : un simple
// rafraîchissement de page le perdait → l'app se croyait déconnectée et il fallait re-cliquer
// « Connecter » à chaque refresh (friction majeure signalée par Marc 2026-05-29, surtout en navigation
// privée où la ré-auth silencieuse est souvent bloquée par les cookies tiers). On le persiste pour la
// durée de la session (effacé à la fermeture de l'onglet ET à la révocation). C'est un jeton de portée
// drive.appdata + email (pas un secret long terme) ; compromis UX assumé.
const TOKEN_STORAGE_KEY = 'financeai:gis:token:v1';

/** Persiste le jeton courant en session (best-effort). */
function persistCached(): void {
    try {
        if (typeof sessionStorage !== 'undefined' && _cached) {
            sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(_cached));
        }
    } catch {
        /* sessionStorage indispo — le jeton reste en mémoire pour cette page */
    }
}

/** Restaure le jeton depuis la session s'il est encore valide (sinon purge). No-op si déjà en mémoire. */
function restoreCachedFromSession(): void {
    if (_cached) return;
    try {
        if (typeof sessionStorage === 'undefined') return;
        const raw = sessionStorage.getItem(TOKEN_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as { accessToken?: unknown; expiresAt?: unknown };
        if (
            typeof parsed.accessToken === 'string' &&
            typeof parsed.expiresAt === 'number' &&
            !isTokenExpired(parsed.expiresAt, Date.now())
        ) {
            _cached = { accessToken: parsed.accessToken, expiresAt: parsed.expiresAt };
        } else {
            sessionStorage.removeItem(TOKEN_STORAGE_KEY); // expiré / corrompu → purge
        }
    } catch {
        /* illisible — on repartira d'une ré-authentification */
    }
}

/** Efface le jeton persisté (déconnexion / reset). */
function clearCachedSession(): void {
    try {
        if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
        /* best-effort */
    }
}

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
                if (reject) reject(new Error(`Échec de l'autorisation Google${err?.type ? ` (${err.type})` : ''}`));
            },
        });
    }
    return _tokenClient;
}

/**
 * Demande un access token. `interactive=true` force le consentement (1er login / re-grant) ;
 * `false` tente un renouvellement silencieux.
 */
export function requestAccessToken(interactive: boolean): Promise<string> {
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
                // Court en silencieux (échec attendu rapide), large en interactif (l'utilisateur agit).
                timer = setTimeout(
                    () => settle(() => reject(new Error("Délai dépassé pour l'autorisation Google"))),
                    interactive ? 120_000 : 15_000,
                );
                client.callback = (resp: GisTokenResponse) => {
                    if (resp.error || !resp.access_token) {
                        settle(() => reject(new Error(`Autorisation Google refusée${resp.error ? `: ${resp.error}` : ''}`)));
                        return;
                    }
                    // Capturé en const : `resp.access_token` est narrowé à `string` ici, mais TS
                    // re-élargit dans la closure `settle(() => …)` ; la const préserve le type.
                    const accessToken = resp.access_token;
                    const expiresAt = Date.now() + (resp.expires_in ?? 3600) * 1000;
                    _cached = { accessToken, expiresAt };
                    persistCached(); // survit à un refresh → plus de reconnexion à chaque rafraîchissement
                    settle(() => resolve(accessToken));
                };
                client.requestAccessToken({ prompt: interactive ? 'consent' : '' });
            }),
    );
}

/** Retourne un token valide : le cache (mémoire ou session) s'il est bon, sinon un renouvellement silencieux. */
export function getValidAccessToken(): Promise<string> {
    restoreCachedFromSession(); // récupère le jeton d'un refresh précédent (évite une reconnexion)
    if (_cached && !isTokenExpired(_cached.expiresAt, Date.now())) {
        return Promise.resolve(_cached.accessToken);
    }
    return requestAccessToken(false);
}

/** Token en cache (mémoire ou session, sans réseau), ou null. Pour savoir si on est « connecté ». */
export function getCachedToken(): string | null {
    restoreCachedFromSession();
    if (_cached && !isTokenExpired(_cached.expiresAt, Date.now())) return _cached.accessToken;
    return null;
}

/** Révoque l'accès et purge le cache mémoire + session (déconnexion). */
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
    clearCachedSession();
}

/** Réinitialise l'état module — réservé aux tests. */
export function _resetForTests(): void {
    _clientId = null;
    _tokenClient = null;
    _cached = null;
    _scriptPromise = null;
    _pendingReject = null;
    clearCachedSession();
}
