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

/** Marge avant expiration pour rafraîchir un peu en avance (évite un appel sur un token mourant). */
const EXPIRY_MARGIN_MS = 60_000;

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
                client.callback = (resp: GisTokenResponse) => {
                    if (resp.error || !resp.access_token) {
                        reject(new Error(`Autorisation Google refusée${resp.error ? `: ${resp.error}` : ''}`));
                        return;
                    }
                    const expiresAt = Date.now() + (resp.expires_in ?? 3600) * 1000;
                    _cached = { accessToken: resp.access_token, expiresAt };
                    resolve(resp.access_token);
                };
                client.requestAccessToken({ prompt: interactive ? 'consent' : '' });
            }),
    );
}

/** Retourne un token valide : le cache s'il est encore bon, sinon un renouvellement silencieux. */
export function getValidAccessToken(): Promise<string> {
    if (_cached && !isTokenExpired(_cached.expiresAt, Date.now())) {
        return Promise.resolve(_cached.accessToken);
    }
    return requestAccessToken(false);
}

/** Token en cache (sans réseau), ou null. Pour savoir si on est « connecté » cette session. */
export function getCachedToken(): string | null {
    if (_cached && !isTokenExpired(_cached.expiresAt, Date.now())) return _cached.accessToken;
    return null;
}

/** Révoque l'accès et purge le cache (déconnexion). */
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
}

/** Réinitialise l'état module — réservé aux tests. */
export function _resetForTests(): void {
    _clientId = null;
    _tokenClient = null;
    _cached = null;
    _scriptPromise = null;
}
