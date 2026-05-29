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
    it('rejette proprement quand GIS déclenche error_callback (pas de session)', async () => {
        stubGisError('access_denied');
        configureGoogleAuth('cid');
        await expect(requestAccessToken(false)).rejects.toThrow(/autorisation Google/i);
        expect(getCachedToken()).toBeNull();
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

// Persistance du jeton en sessionStorage : sans elle, un simple rafraîchissement perdait le jeton
// (en mémoire) → l'app se croyait déconnectée et il fallait re-cliquer « Connecter » à chaque refresh
// (friction majeure signalée par Marc 2026-05-29). Le jeton doit survivre au refresh, dans la session.
const TOKEN_KEY = 'financeai:gis:token:v1';
describe('persistance du jeton (sessionStorage) — survit au refresh', () => {
    it('getCachedToken restaure un jeton VALIDE depuis sessionStorage (= après un refresh)', () => {
        // _resetForTests (beforeEach) a vidé la mémoire ET la session → on simule un jeton laissé par
        // une session précédente, puis un « refresh » (mémoire vide, session conservée).
        sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ accessToken: 'tok-sess', expiresAt: Date.now() + 3_600_000 }));
        expect(getCachedToken()).toBe('tok-sess');
    });

    it('ignore ET purge un jeton EXPIRÉ en session', () => {
        sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ accessToken: 'tok-old', expiresAt: Date.now() - 1000 }));
        expect(getCachedToken()).toBeNull();
        expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull(); // purgé
    });

    it('requestAccessToken persiste le jeton en session', async () => {
        stubGis({ access_token: 'tok-new', expires_in: 3600 });
        configureGoogleAuth('cid');
        await requestAccessToken(true);
        const stored = JSON.parse(sessionStorage.getItem(TOKEN_KEY) as string);
        expect(stored.accessToken).toBe('tok-new');
    });

    it('revokeAccess efface le jeton persisté', async () => {
        stubGis({ access_token: 'tok-rev', expires_in: 3600 });
        configureGoogleAuth('cid');
        await requestAccessToken(true);
        expect(sessionStorage.getItem(TOKEN_KEY)).not.toBeNull();
        const { revokeAccess } = await import('../../services/googleDrive/gisAuth');
        revokeAccess();
        expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
    });
});
