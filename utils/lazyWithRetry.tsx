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
//   3. Garde anti-boucle par TIMESTAMP (sessionStorage) : au plus un reload
//      auto par RELOAD_MIN_INTERVAL_MS, quel que soit le déclencheur.
//
// PH1-a (revue) : la garde était un flag binaire effacé au mount de App — un échec
// PERSISTANT d'un chunk du chemin de boot (deploy cassé, offline avec shell servi
// par le SW) bouclait : reload → mount → clear → échec → reload… Le timestamp borne
// la boucle structurellement (1 reload/min max) sans AUCUN clear nécessaire.
//
// Inspiré de https://www.codemzy.com/blog/fix-chunkloaderror-react

import React from 'react';
import { logError } from '../services/errorLogger';

const RELOAD_FLAG_KEY = 'financeai:chunkReloaded:v1'; // valeur = Date.now() du dernier reload auto
const RELOAD_MIN_INTERVAL_MS = 60_000;

export function isChunkLoadError(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const msg = (err as Error).message ?? '';
    // « Unable to preload » = échec de preload d'une DÉPENDANCE (CSS ou module) signalé par Vite.
    return /Failed to fetch dynamically imported module|Loading chunk \d+ failed|Importing a module script failed|Unable to preload/i.test(msg);
}

// Reload auto autorisé ? — jamais deux fois en moins de RELOAD_MIN_INTERVAL_MS.
// Legacy '1' ou clé absente → Number() donne 1/0 → intervalle largement dépassé → true.
function shouldAttemptReload(): boolean {
    try {
        const last = Number(sessionStorage.getItem(RELOAD_FLAG_KEY));
        return !(Date.now() - last < RELOAD_MIN_INTERVAL_MS); // NaN-safe (NaN → comparaison false → true)
    } catch {
        return false; // storage indisponible : pas de reload auto (aucune garde anti-boucle possible)
    }
}

// Retourne false si l'écriture échoue (quota/storage) : dans ce cas on NE reload PAS,
// sinon shouldAttemptReload resterait vrai à chaque échec → boucle.
function markReloadAttempt(): boolean {
    try {
        sessionStorage.setItem(RELOAD_FLAG_KEY, String(Date.now()));
        return true;
    } catch {
        return false;
    }
}

/**
 * Import dynamique NON-composant avec la MÊME protection que lazyWithRetry (retry 500 ms puis hard
 * reload gardé anti-boucle sur chunk périmé post-deploy). À utiliser pour tout `await import()` NU
 * d'un module lourd hors du chemin React.lazy (ex. le SDK chat chargé au 1er message, AITOOLS-E) —
 * sinon un déploiement Vercel entre l'ouverture de l'onglet et le 1er message ferait boucler le 404
 * alors que le reste de l'app se répare tout seul.
 *
 * [SDK-IMPORT-TIMEOUT] Budget d'attente PAR TENTATIVE avant de déclarer un `import()` BLOQUÉ
 * (ni succès ni échec — connexion qui pend, proxy muet). Sans lui, le premier usage d'un chunk
 * (SDK chat au 1er message, recharts à l'ouverture de Futur) pendait indéfiniment.
 *
 * Dimensionné pour le PIRE chunk sur connexion lente (mesuré au build du 2026-09-04 : recharts
 * 404 Ko, jspdf 399 Ko → ~16 s à ~25 Ko/s). Le budget TOTAL est ~2× ce délai : la 2e tentative
 * re-attend la MÊME promesse d'import en vol (le module map du navigateur dédoublonne), donc un
 * chargement lent mais VIVANT qui rate la 1re fenêtre aboutit dans la 2e — seul un vrai blocage
 * finit en erreur (~20,5 s), remontée à l'appelant/ErrorBoundary, JAMAIS en reload (un blocage
 * réseau n'est pas un chunk périmé : recharger perdrait l'état pour rien).
 */
export const IMPORT_STALL_TIMEOUT_MS = 10_000;

/** Course promesse vs minuterie. Le message ne matche PAS `isChunkLoadError` — c'est voulu. */
function withStallTimeout<T>(p: Promise<T>, ms: number, chunkName?: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const t = setTimeout(
            () => reject(new Error(`Import bloqué depuis ${ms} ms${chunkName ? ` (${chunkName})` : ''} — ni succès ni échec`)),
            ms,
        );
        p.then(
            (v) => { clearTimeout(t); resolve(v); },
            (e: unknown) => { clearTimeout(t); reject(e); },
        );
    });
}

export async function importWithRetry<T>(factory: () => Promise<T>, chunkName?: string): Promise<T> {
    try {
        return await withStallTimeout(factory(), IMPORT_STALL_TIMEOUT_MS, chunkName);
    } catch (firstError) {
        await new Promise(resolve => setTimeout(resolve, 500));
        try {
            return await withStallTimeout(factory(), IMPORT_STALL_TIMEOUT_MS, chunkName);
        } catch (secondError) {
            logError({
                source: 'ui',
                severity: 'critical',
                message: `Dynamic import failed twice${chunkName ? ` (${chunkName})` : ''}`,
                error: secondError,
                context: { chunkName, firstError: (firstError as Error)?.message },
            });
            if (isChunkLoadError(secondError) && typeof window !== 'undefined'
                && shouldAttemptReload() && markReloadAttempt()) {
                window.location.reload();
                return new Promise<T>(() => {}); // jamais résolue — la page se recharge
            }
            // Reload déjà tenté il y a < 1 min (ou storage KO) → on remonte l'erreur à l'appelant.
            throw secondError;
        }
    }
}

export function lazyWithRetry<T extends React.ComponentType<unknown>>(
    factory: () => Promise<{ default: T }>,
    chunkName?: string,
): React.LazyExoticComponent<T> {
    // Mutualise la stratégie retry+reload (importWithRetry) ; l'échec final remonte à ErrorBoundary.
    return React.lazy(() => importWithRetry(factory, chunkName));
}

/**
 * PH1-a — filet global `vite:preloadError`. Vite émet cet événement pour TOUT échec
 * d'un import dynamique passé par son helper de preload : le module RACINE du chunk
 * COMME ses dépendances préchargées (deploy entre deux navigations → hash périmé ;
 * NB : le déclencheur « redirection Cloudflare Access sur session expirée » a disparu
 * avec le retrait de Cloudflare le 2026-06-16). Première ligne de défense :
 * reload immédiat (gardé par l'intervalle anti-boucle partagé) ; si le reload est
 * refusé, on laisse Vite re-throw → lazyWithRetry (2e ligne, retry 500 ms) ou
 * ErrorBoundary. PAS de preventDefault : l'empêcher ferait RÉSOUDRE les `import()`
 * à `undefined` (TypeError trompeuse dans les consommateurs pendant le reload).
 * À installer une fois au boot (index.tsx), avant le render.
 */
export function installPreloadErrorReload(): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('vite:preloadError', (event) => {
        const payload = (event as Event & { payload?: unknown }).payload;
        // Erreur d'ÉVALUATION d'un module (bug déterministe) → un reload ne réparera
        // rien : laisser remonter à l'ErrorBoundary sans gaspiller le quota de reload.
        if (!isChunkLoadError(payload)) return;
        if (!shouldAttemptReload() || !markReloadAttempt()) return;
        logError({
            source: 'ui',
            severity: 'warning',
            message: 'vite:preloadError — chunk périmé ou bloqué, rechargement',
            error: payload,
            // errorLogger garde `message` fourni : le nom du chunk fautif doit survivre ici.
            context: { detail: (payload as Error)?.message },
        });
        window.location.reload();
    });
}
