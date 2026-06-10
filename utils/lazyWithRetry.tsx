// P1 — Wrapper React.lazy avec retry automatique + reload sur échec persistent.
//
// Problème : après un nouveau deploy, un user avec l'app ouverte garde
// l'ancien index.html en cache. Quand il clique sur un onglet lazy, le
// chunk avec l'ancien hash n'existe plus sur le serveur → import fail →
// "Failed to fetch dynamically imported module".
//
// Solution :
//   1. Retry l'import 1 fois après 500ms (au cas où le réseau a vacillé)
//   2. Si fail à nouveau, recharge la page (window.location.reload())
//      → le browser re-fetch index.html, prend les nouveaux hashes
//   3. Marqueur sessionStorage pour éviter une boucle de reloads
//
// Inspiré de https://www.codemzy.com/blog/fix-chunkloaderror-react

import React from 'react';
import { logError } from '../services/errorLogger';

const RELOAD_FLAG_KEY = 'financeai:chunkReloaded:v1';

function isChunkLoadError(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const msg = (err as Error).message ?? '';
    return /Failed to fetch dynamically imported module|Loading chunk \d+ failed|Importing a module script failed/i.test(msg);
}

export function lazyWithRetry<T extends React.ComponentType<unknown>>(
    factory: () => Promise<{ default: T }>,
    chunkName?: string,
): React.LazyExoticComponent<T> {
    return React.lazy(async () => {
        try {
            return await factory();
        } catch (firstError) {
            // Retry après 500ms (réseau qui vacille, etc.)
            await new Promise(resolve => setTimeout(resolve, 500));
            try {
                return await factory();
            } catch (secondError) {
                // Chunk vraiment introuvable. Probablement vieux index.html cached.
                logError({
                    source: 'ui',
                    severity: 'critical',
                    message: `Chunk load failed twice${chunkName ? ` (${chunkName})` : ''}`,
                    error: secondError,
                    context: { chunkName, firstError: (firstError as Error)?.message },
                });
                if (isChunkLoadError(secondError) && typeof window !== 'undefined') {
                    // Garde-fou : ne reload qu'une fois pour éviter boucle infinie
                    const alreadyReloaded = sessionStorage.getItem(RELOAD_FLAG_KEY);
                    if (!alreadyReloaded) {
                        sessionStorage.setItem(RELOAD_FLAG_KEY, '1');
                        // Hard reload pour forcer le re-fetch de index.html
                        window.location.reload();
                        // Promise jamais résolue — la page se recharge
                        return new Promise<{ default: T }>(() => {});
                    }
                    // Si on a déjà reload une fois et que ça fail encore, on remonte l'erreur
                    // au composant pour qu'ErrorBoundary l'affiche proprement
                }
                throw secondError;
            }
        }
    });
}

/**
 * À appeler au boot pour clear le flag "reload attempted" une fois que tout
 * a chargé OK. Évite de garder le flag indéfiniment.
 */
export function clearChunkReloadFlag(): void {
    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(RELOAD_FLAG_KEY);
    }
}

/**
 * PH1-a — filet global `vite:preloadError`. Vite émet cet événement quand le preload
 * d'une dépendance d'un import dynamique échoue (deploy entre deux navigations → hash
 * périmé, ou redirection Cloudflare Access sur session expirée). lazyWithRetry ne voit
 * que l'échec du module RACINE du chunk ; ses dépendances préchargées passent par ici.
 * Même stratégie : UN reload (flag sessionStorage partagé), sinon on laisse l'erreur
 * remonter à l'ErrorBoundary. À installer une fois au boot (index.tsx), avant le render.
 */
export function installPreloadErrorReload(): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('vite:preloadError', (event) => {
        try {
            if (sessionStorage.getItem(RELOAD_FLAG_KEY)) return; // déjà tenté → laisser remonter
            sessionStorage.setItem(RELOAD_FLAG_KEY, '1');
        } catch {
            return; // storage indisponible : ne PAS reload (aucune garde anti-boucle possible)
        }
        logError({
            source: 'ui',
            severity: 'warning',
            message: 'vite:preloadError — chunk périmé ou bloqué, rechargement',
            error: (event as Event & { payload?: unknown }).payload,
        });
        event.preventDefault(); // empêche Vite de re-throw (la page se recharge)
        window.location.reload();
    });
}
