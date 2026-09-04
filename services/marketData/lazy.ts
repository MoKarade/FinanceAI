// services/marketData/lazy.ts
//
// [PERF-MARKETDATA-DYNIMPORT-INERTE] Point de chargement UNIQUE et mémoïsé du module marketData
// (~67 Ko de sources + providers Finnhub/CoinGecko). Le code atteignable depuis le chunk d'ENTRÉE
// (App.tsx, hooks app-level) ne doit JAMAIS importer `./index` statiquement — quatre imports
// statiques annulaient les `import()` existants et gardaient tout le module dans le chunk de boot
// (INEFFECTIVE_DYNAMIC_IMPORT, mesuré au build du 2026-08-19 et re-mesuré le 2026-08-29).
//
// ⚠️ POURQUOI une promesse PARTAGÉE et pas des `import()` dispersés : l'ORDRE des gestes.
// `configureMarketDataProvider({ finnhubKey })` (effet App) doit s'appliquer AVANT toute cotation
// partie ensuite — une cotation avant la pose de la clé se replie sur un autre provider SANS RIEN
// DIRE (classe `PERF-REFACTOR-A-RISQUE-DE-COURSE`). Avec une promesse mémoïsée, les continuations
// s'exécutent dans l'ordre où les appelants l'ont attendue (FIFO de la microtask queue) : le même
// ordre temporel qu'avec le module synchrone d'avant.
//
// ⚠️ Un échec de chargement (chunk périmé, réseau) N'EMPOISONNE PAS la façade : la promesse
// rejetée est OUBLIÉE, le prochain appel retente — sinon toute cotation resterait morte jusqu'au
// rechargement de la page. `importWithRetry` journalise déjà l'échec (2 tentatives).

import { importWithRetry } from '../../utils/lazyWithRetry';

export type MarketDataModule = typeof import('./index');

let modPromise: Promise<MarketDataModule> | null = null;

/** Charge (une seule fois) le module marketData complet. Toujours la MÊME promesse tant qu'elle
 *  n'a pas échoué — c'est elle qui porte la garantie d'ordre configure→quote. */
export function loadMarketData(): Promise<MarketDataModule> {
    if (!modPromise) {
        modPromise = importWithRetry(() => import('./index'), 'marketData')
            .catch((e: unknown) => {
                modPromise = null; // ne pas mémoïser un échec : le prochain geste retente
                throw e;
            });
    }
    return modPromise;
}
