import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    isTokenExpired,
    isGoogleAuthConfigured,
    configureGoogleAuth,
    requestAccessToken,
    getCachedToken,
    getValidAccessToken,
    _resetForTests,
} from '../../services/googleDrive/gisAuth';

// Clé localStorage du jeton GIS (doit rester alignée sur TOKEN_STORAGE_KEY de gisAuth.ts).
const TOKEN_KEY = 'financeai:gis:token:v1';

beforeEach(() => {
    _resetForTests();
});
afterEach(() => {
    vi.unstubAllGlobals();
});

/** Installe un faux Google Identity Services qui renvoie `resp` quand on demande un token. */
function stubGis(resp: { access_token?: string; expires_in?: number; error?: string }) {
    const revoke = vi.fn();
    const fakeClient = {
        callback: (_r: unknown) => { void _r; },
        requestAccessToken() {
            this.callback(resp);
        },
    };
    const initTokenClient = vi.fn(() => fakeClient);
    vi.stubGlobal('google', { accounts: { oauth2: { initTokenClient, revoke } } });
    return { initTokenClient, revoke };
}

describe('isTokenExpired (pur)', () => {
    it('expiré si on est dans la marge avant échéance', () => {
        expect(isTokenExpired(10_000, 9_999_000, 60_000)).toBe(true); // now+margin >= exp
    });
    it('valide si bien avant échéance', () => {
        expect(isTokenExpired(10_000_000, 1_000, 60_000)).toBe(false);
    });
});

describe('configuration', () => {
    it('non configuré par défaut', () => {
        expect(isGoogleAuthConfigured()).toBe(false);
    });
    it('configuré après un Client ID non vide', () => {
        configureGoogleAuth('abc.apps.googleusercontent.com');
        expect(isGoogleAuthConfigured()).toBe(true);
    });
    it('vide / null → non configuré', () => {
        configureGoogleAuth('   ');
        expect(isGoogleAuthConfigured()).toBe(false);
        configureGoogleAuth(null);
        expect(isGoogleAuthConfigured()).toBe(false);
    });
});

describe('getCachedToken', () => {
    it('null tant qu aucun token obtenu', () => {
        expect(getCachedToken()).toBeNull();
    });
});

/** Faux GIS qui déclenche l'`error_callback` (échec SANS réponse token : pas de session, etc.). */
function stubGisError(errType = 'access_denied') {
    let errorCb: ((e: { type?: string }) => void) | undefined;
    const fakeClient = {
        callback: (_r: unknown) => { void _r; },
        requestAccessToken() { errorCb?.({ type: errType }); },
    };
    const initTokenClient = vi.fn((cfg: { error_callback?: (e: { type?: string }) => void }) => {
        errorCb = cfg.error_callback;
        return fakeClient;
    });
    vi.stubGlobal('google', { accounts: { oauth2: { initTokenClient, revoke: vi.fn() } } });
}

describe('requestAccessToken — error_callback (anti-hang)', () => {
    it('interactif : rejette proprement quand GIS déclenche error_callback (popup bloqué / pas de session)', async () => {
        stubGisError('popup_failed_to_open');
        configureGoogleAuth('cid');
        // Le popup (donc l'error_callback) n'existe QUE sur le chemin interactif (geste utilisateur).
        await expect(requestAccessToken(true)).rejects.toThrow(/autorisation Google/i);
        expect(getCachedToken()).toBeNull();
    });
});

// Fix `popup_failed_to_open` (Marc 2026-06) : la reprise SILENCIEUSE (interactive=false) ne doit
// JAMAIS ouvrir de popup. Au boot / hard-refresh il n'y a pas de geste utilisateur → un popup serait
// bloqué et GIS lèverait `popup_failed_to_open` à chaque chargement. Le chemin silencieux s'appuie
// donc uniquement sur le cache (mémoire/localStorage).
describe('requestAccessToken(false) — silencieux : cache uniquement, jamais de popup', () => {
    it('sans jeton en cache : rejette SANS appeler GIS (aucun popup tenté)', async () => {
        const { initTokenClient } = stubGis({ access_token: 'never', expires_in: 3600 });
        configureGoogleAuth('cid');
        await expect(requestAccessToken(false)).rejects.toThrow(/reconnexion requise/i);
        // GIS n'est même pas sollicité : pas d'init de client → pas de requestAccessToken → pas de popup.
        expect(initTokenClient).not.toHaveBeenCalled();
        expect(getCachedToken()).toBeNull();
    });

    it('avec un jeton VALIDE en session : résout depuis le cache, sans popup', async () => {
        localStorage.setItem(TOKEN_KEY, JSON.stringify({ accessToken: 'tok-cache', expiresAt: Date.now() + 3_600_000 }));
        const { initTokenClient } = stubGis({ access_token: 'never', expires_in: 3600 });
        configureGoogleAuth('cid');
        await expect(requestAccessToken(false)).resolves.toBe('tok-cache');
        expect(initTokenClient).not.toHaveBeenCalled();
    });
});

describe('requestAccessToken (GIS mocké)', () => {
    it('résout le token et le met en cache', async () => {
        stubGis({ access_token: 'tok-123', expires_in: 3600 });
        configureGoogleAuth('cid');
        const tok = await requestAccessToken(true);
        expect(tok).toBe('tok-123');
        expect(getCachedToken()).toBe('tok-123');
    });

    it('rejette si Google renvoie une erreur', async () => {
        stubGis({ error: 'access_denied' });
        configureGoogleAuth('cid');
        await expect(requestAccessToken(true)).rejects.toThrow(/refus/i);
        expect(getCachedToken()).toBeNull();
    });

    it('getValidAccessToken réutilise le cache sans redemander', async () => {
        const { initTokenClient } = stubGis({ access_token: 'tok-xyz', expires_in: 3600 });
        configureGoogleAuth('cid');
        await requestAccessToken(true); // 1er appel → init + token
        const again = await getValidAccessToken(); // doit réutiliser le cache
        expect(again).toBe('tok-xyz');
        // initTokenClient n'est appelé qu'une fois (client réutilisé), et pas de nouveau requestAccessToken réseau.
        expect(initTokenClient).toHaveBeenCalledTimes(1);
    });
});

// Persistance du jeton en localStorage (choix Marc 2026-07-16 : ne plus se reconnecter à chaque reload) :
// l'ancien cache sessionStorage était perdu à la FERMETURE DE L'ONGLET / non partagé entre onglets.
// localStorage survit reload + fermeture d'onglet + est partagé entre onglets du même appareil.
describe('persistance du jeton (localStorage) — survit reload / fermeture d\'onglet', () => {
    it('getCachedToken restaure un jeton VALIDE depuis localStorage (= après un refresh/nouvel onglet)', () => {
        // _resetForTests (beforeEach) a vidé la mémoire ET le stockage → on simule un jeton laissé par
        // une session précédente, puis un « refresh » (mémoire vide, localStorage conservé).
        localStorage.setItem(TOKEN_KEY, JSON.stringify({ accessToken: 'tok-sess', expiresAt: Date.now() + 3_600_000 }));
        expect(getCachedToken()).toBe('tok-sess');
    });

    it('ignore ET purge un jeton EXPIRÉ en stockage', () => {
        localStorage.setItem(TOKEN_KEY, JSON.stringify({ accessToken: 'tok-old', expiresAt: Date.now() - 1000 }));
        expect(getCachedToken()).toBeNull();
        expect(localStorage.getItem(TOKEN_KEY)).toBeNull(); // purgé
    });

    it('requestAccessToken persiste le jeton en session', async () => {
        stubGis({ access_token: 'tok-new', expires_in: 3600 });
        configureGoogleAuth('cid');
        await requestAccessToken(true);
        const stored = JSON.parse(localStorage.getItem(TOKEN_KEY) as string);
        expect(stored.accessToken).toBe('tok-new');
    });

    it('revokeAccess efface le jeton persisté', async () => {
        stubGis({ access_token: 'tok-rev', expires_in: 3600 });
        configureGoogleAuth('cid');
        await requestAccessToken(true);
        expect(localStorage.getItem(TOKEN_KEY)).not.toBeNull();
        const { revokeAccess } = await import('../../services/googleDrive/gisAuth');
        revokeAccess();
        expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    });
});

// Renouvellement silencieux (choix Marc 2026-07-16 : ne plus se reconnecter à ~1h tant que l'onglet vit).
// Après une acquisition, un minuteur ré-obtient un jeton en réseau (prompt:'') un peu avant l'expiration.
// Best-effort : un échec (session absente, cookies tiers bloqués) est SILENCIEUX → bannière de reconnexion.
describe('renouvellement silencieux du jeton', () => {
    it('programme et déclenche un renouvellement avant expiration (session tenue au-delà de ~1h)', async () => {
        vi.useFakeTimers();
        try {
            let calls = 0;
            const fakeClient = {
                callback: (_r: unknown) => { void _r; },
                requestAccessToken() {
                    calls += 1;
                    // 130s → délai = max(30000 plancher, 130000−60000−60000) = 30000 ms (plancher anti-boucle).
                    this.callback({ access_token: `tok-${calls}`, expires_in: 130 });
                },
            };
            vi.stubGlobal('google', { accounts: { oauth2: { initTokenClient: vi.fn(() => fakeClient), revoke: vi.fn() } } });
            configureGoogleAuth('cid');

            expect(await requestAccessToken(true)).toBe('tok-1');
            expect(calls).toBe(1);

            await vi.advanceTimersByTimeAsync(31_000); // franchit le plancher de 30 s → déclenche le renouvellement
            expect(calls).toBe(2);                     // 2e acquisition RÉSEAU = renouvellement
            expect(getCachedToken()).toBe('tok-2');    // nouveau jeton en cache, sans reconnexion
        } finally {
            vi.useRealTimers();
        }
    });

    it('un échec de renouvellement est SILENCIEUX (ne lève pas) — la bannière prend le relais', async () => {
        vi.useFakeTimers();
        try {
            let calls = 0;
            let errorCb: ((e: { type?: string }) => void) | undefined;
            const fakeClient = {
                callback: (_r: unknown) => { void _r; },
                requestAccessToken() {
                    calls += 1;
                    if (calls === 1) this.callback({ access_token: 'tok-1', expires_in: 130 });
                    else errorCb?.({ type: 'popup_failed_to_open' }); // renouvellement échoue
                },
            };
            const initTokenClient = vi.fn((cfg: { error_callback?: (e: { type?: string }) => void }) => {
                errorCb = cfg.error_callback;
                return fakeClient;
            });
            vi.stubGlobal('google', { accounts: { oauth2: { initTokenClient, revoke: vi.fn() } } });
            configureGoogleAuth('cid');
            await requestAccessToken(true);
            // Le renouvellement échoue mais NE doit PAS lever : si le rejet n'était pas catché dans le
            // minuteur, l'avance des timers propagerait l'erreur (unhandled) et ferait échouer le test.
            await vi.advanceTimersByTimeAsync(31_000); // franchit le plancher de 30 s → déclenche le renouvellement
            expect(calls).toBe(2); // le renouvellement a bien été tenté (2e appel), puis avalé proprement
        } finally {
            vi.useRealTimers();
        }
    });
});

// Propagation cross-onglet de la déconnexion (finding security-privacy) : sans elle, le renouvellement
// silencieux garderait CE jeton vivant indéfiniment après une déconnexion/suppression faite dans un
// AUTRE onglet → sync fantôme post-déconnexion (Loi 25). L'event `storage` (autres onglets uniquement)
// purge le jeton en mémoire.
describe('[AUTH-DRIVE-PERSIST] déconnexion propagée entre onglets (event storage)', () => {
    it('purge le jeton EN MÉMOIRE quand un autre onglet efface la clé jeton', async () => {
        stubGis({ access_token: 'tok-multi', expires_in: 3600 });
        configureGoogleAuth('cid');
        await requestAccessToken(true);
        expect(getCachedToken()).toBe('tok-multi');
        // Simule la déconnexion dans un AUTRE onglet : la clé disparaît de localStorage (partagé) et
        // l'event `storage` se déclenche ici (il ne se déclenche QUE dans les onglets NON à l'origine).
        localStorage.removeItem(TOKEN_KEY);
        window.dispatchEvent(new StorageEvent('storage', { key: TOKEN_KEY, oldValue: 'x', newValue: null }));
        expect(getCachedToken()).toBeNull(); // jeton mémoire purgé → cet onglet cesse de pousser vers Drive
    });
});
