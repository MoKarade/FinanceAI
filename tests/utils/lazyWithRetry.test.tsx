// PH1-a — installPreloadErrorReload : filet global `vite:preloadError`.
// Un chunk périmé (deploy pendant la session) ou bloqué (redirect d'auth) doit
// déclencher AU PLUS un reload par minute (garde timestamp auto-expirante —
// jamais de boucle, même sur échec persistant du chemin de boot).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { installPreloadErrorReload } from '../../utils/lazyWithRetry';

vi.mock('../../services/errorLogger', () => ({ logError: vi.fn() }));
import { logError } from '../../services/errorLogger';

const RELOAD_FLAG_KEY = 'financeai:chunkReloaded:v1';
const reloadMock = vi.fn();

// NOTE : chaque install ajoute un écouteur sur le window jsdom partagé du fichier ;
// un SEUL install ici (la garde timestamp rendrait des écouteurs surnuméraires no-op).
installPreloadErrorReload();

function dispatchPreloadError(message = 'Failed to fetch dynamically imported module /assets/X-abc123.js'): Event {
    const event = new Event('vite:preloadError', { cancelable: true });
    (event as Event & { payload?: unknown }).payload = new Error(message);
    window.dispatchEvent(event);
    return event;
}

beforeEach(() => {
    sessionStorage.clear();
    reloadMock.mockClear();
    // Stub window.location.reload (jsdom le marque « Not implemented » sinon).
    Object.defineProperty(window, 'location', {
        configurable: true,
        writable: true,
        value: { reload: reloadMock, search: '', href: 'http://localhost/' },
    });
});
afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
});

describe('installPreloadErrorReload — vite:preloadError → reload gardé par intervalle', () => {
    it('premier preloadError → reload + timestamp posé + erreur loguée avec le chunk fautif', () => {
        dispatchPreloadError();

        expect(reloadMock).toHaveBeenCalledTimes(1);
        const ts = Number(sessionStorage.getItem(RELOAD_FLAG_KEY));
        expect(Date.now() - ts).toBeLessThan(5_000); // timestamp frais, pas un flag binaire
        expect(logError).toHaveBeenCalledWith(expect.objectContaining({
            source: 'ui',
            severity: 'warning',
            context: expect.objectContaining({ detail: expect.stringContaining('X-abc123') }),
        }));
    });

    it('PAS de preventDefault : Vite re-throw → les import() ne résolvent jamais undefined', () => {
        const event = dispatchPreloadError();
        expect(event.defaultPrevented).toBe(false);
    });

    it('reload récent (< 1 min) → AUCUN second reload, même après le cycle reload→boot→échec (anti-boucle)', () => {
        dispatchPreloadError();
        expect(reloadMock).toHaveBeenCalledTimes(1);
        // simule le cycle post-reload : nouveau boot, MÊME échec persistant du chunk
        dispatchPreloadError();
        dispatchPreloadError();
        expect(reloadMock).toHaveBeenCalledTimes(1); // borné — l'ancien flag-clear-au-mount bouclait ici
    });

    it('timestamp vieux (> 1 min) → la garde s\'auto-réarme (nouveau deploy plus tard = reload OK)', () => {
        sessionStorage.setItem(RELOAD_FLAG_KEY, String(Date.now() - 120_000));
        dispatchPreloadError();
        expect(reloadMock).toHaveBeenCalledTimes(1);
    });

    it('legacy flag binaire \'1\' (ancien schéma) → traité comme expiré, reload permis', () => {
        sessionStorage.setItem(RELOAD_FLAG_KEY, '1');
        dispatchPreloadError();
        expect(reloadMock).toHaveBeenCalledTimes(1);
    });

    it('erreur d\'ÉVALUATION de module (pas un échec de chargement) → pas de reload gaspillé', () => {
        dispatchPreloadError('TypeError: x is not a function');
        expect(reloadMock).not.toHaveBeenCalled();
        expect(logError).not.toHaveBeenCalled(); // l'erreur remonte à l'ErrorBoundary, loguée en aval
    });

    it('sessionStorage indisponible → AUCUN reload (sans garde persistante, reload = boucle potentielle)', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('SecurityError: storage disabled');
        });
        dispatchPreloadError();
        expect(reloadMock).not.toHaveBeenCalled();
    });
});
