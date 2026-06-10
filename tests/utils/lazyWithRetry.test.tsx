// PH1-a — installPreloadErrorReload : filet global `vite:preloadError`.
// Un chunk périmé (deploy pendant la session) ou bloqué (redirect d'auth) doit
// déclencher UN SEUL reload (flag sessionStorage), jamais une boucle.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { installPreloadErrorReload, clearChunkReloadFlag } from '../../utils/lazyWithRetry';

vi.mock('../../services/errorLogger', () => ({ logError: vi.fn() }));
import { logError } from '../../services/errorLogger';

const RELOAD_FLAG_KEY = 'financeai:chunkReloaded:v1';
const reloadMock = vi.fn();

// L'écouteur s'empile sur window à chaque install — on garde la référence pour le retirer.
function dispatchPreloadError(): Event {
    const event = new Event('vite:preloadError', { cancelable: true });
    (event as Event & { payload?: unknown }).payload = new Error('Failed to fetch dynamically imported module');
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
});

describe('installPreloadErrorReload — vite:preloadError → un reload gardé', () => {
    it('premier preloadError → reload + flag posé + erreur loguée + defaultPrevented', () => {
        installPreloadErrorReload();
        const event = dispatchPreloadError();

        expect(reloadMock).toHaveBeenCalledTimes(1);
        expect(sessionStorage.getItem(RELOAD_FLAG_KEY)).toBe('1');
        expect(event.defaultPrevented).toBe(true); // Vite ne re-throw pas : la page se recharge
        expect(logError).toHaveBeenCalledWith(expect.objectContaining({
            source: 'ui',
            severity: 'warning',
        }));
    });

    it('flag déjà posé (reload déjà tenté) → AUCUN second reload, erreur laissée remonter', () => {
        sessionStorage.setItem(RELOAD_FLAG_KEY, '1');
        installPreloadErrorReload();
        const event = dispatchPreloadError();

        expect(reloadMock).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false); // l'erreur suit son cours (ErrorBoundary)
    });

    it('clearChunkReloadFlag réarme le filet pour un futur deploy', () => {
        installPreloadErrorReload();
        dispatchPreloadError();
        expect(reloadMock).toHaveBeenCalledTimes(1);

        clearChunkReloadFlag(); // appelé au boot quand tout a chargé OK (App.tsx)
        expect(sessionStorage.getItem(RELOAD_FLAG_KEY)).toBeNull();

        dispatchPreloadError();
        expect(reloadMock).toHaveBeenCalledTimes(2); // réarmé
    });
});
