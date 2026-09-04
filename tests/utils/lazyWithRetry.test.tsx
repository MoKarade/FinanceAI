// PH1-a — installPreloadErrorReload : filet global `vite:preloadError`.
// Un chunk périmé (deploy pendant la session) ou bloqué (redirect d'auth) doit
// déclencher AU PLUS un reload par minute (garde timestamp auto-expirante —
// jamais de boucle, même sur échec persistant du chemin de boot).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { installPreloadErrorReload, importWithRetry, IMPORT_STALL_TIMEOUT_MS } from '../../utils/lazyWithRetry';

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

describe('[SDK-IMPORT-TIMEOUT] importWithRetry — un import BLOQUÉ ne pend plus indéfiniment', () => {
    // Un `import()` qui ne résout NI ne rejette (connexion qui pend) laissait l'appelant suspendu
    // pour toujours — 1er usage du SDK chat, ouverture de Futur (recharts). Désormais : course
    // contre IMPORT_STALL_TIMEOUT_MS par tentative, erreur EXPLICITE au bout des deux fenêtres,
    // et JAMAIS de reload (le message ne matche pas isChunkLoadError — un blocage réseau n'est
    // pas un chunk périmé, recharger perdrait l'état pour rien).
    it('factory qui pend pour toujours → rejet « Import bloqué » après les deux fenêtres, sans reload', async () => {
        vi.useFakeTimers();
        try {
            const pendante = (): Promise<never> => new Promise<never>(() => {});
            const p = importWithRetry(pendante, 'sdk-test');
            const issue = p.then(() => 'resolue', (e: Error) => e.message);
            // 1re fenêtre (10 s) + pause 500 ms + 2e fenêtre (10 s).
            await vi.advanceTimersByTimeAsync(IMPORT_STALL_TIMEOUT_MS + 500 + IMPORT_STALL_TIMEOUT_MS + 1);
            const msg = await issue;
            expect(msg).toMatch(/Import bloqué depuis/);
            expect(msg).toContain('sdk-test');
            // Pas de reload : un blocage n'est pas un chunk périmé.
            expect(reloadMock).not.toHaveBeenCalled();
            // L'échec est journalisé en critique (comme les échecs classiques).
            expect(logError).toHaveBeenCalledWith(expect.objectContaining({ severity: 'critical' }));
        } finally {
            vi.useRealTimers();
        }
    });

    it('CONTRÔLE : un chargement lent mais VIVANT aboutit — la fenêtre ne coupe pas un vrai téléchargement', async () => {
        vi.useFakeTimers();
        try {
            // Résout à 9 s < fenêtre de 10 s (le pire chunk mesuré, recharts 404 Ko, tient dans
            // le budget TOTAL ~20,5 s grâce à la re-attente de la même promesse en 2e tentative).
            const lente = (): Promise<string> => new Promise((res) => { setTimeout(() => res('module'), 9_000); });
            const p = importWithRetry(lente, 'lent');
            await vi.advanceTimersByTimeAsync(9_001);
            await expect(p).resolves.toBe('module');
            expect(reloadMock).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it('1re tentative bloquée, 2e vivante → succès (le retry a sa PROPRE fenêtre)', async () => {
        vi.useFakeTimers();
        try {
            let appels = 0;
            const factory = (): Promise<string> => {
                appels++;
                return appels === 1
                    ? new Promise<never>(() => {})                       // bloquée
                    : new Promise((res) => { setTimeout(() => res('ok'), 2_000); }); // vivante
            };
            const p = importWithRetry(factory, 'mixte');
            await vi.advanceTimersByTimeAsync(IMPORT_STALL_TIMEOUT_MS + 500 + 2_001);
            await expect(p).resolves.toBe('ok');
            expect(appels).toBe(2);
        } finally {
            vi.useRealTimers();
        }
    });
});
