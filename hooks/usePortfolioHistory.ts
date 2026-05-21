// hooks/usePortfolioHistory.ts
//
// Sprint 3B M3 — Hook partagé pour `fetchPortfolioHistory()`. Avant ce hook,
// Dashboard, Investments, Retirement et FutureProjection faisaient chacun
// leur propre appel réseau au montage → jusqu'à 4 hits réseau identiques par
// session pour la même donnée immuable (CSV historique du portefeuille).
//
// Cache : un seul fetch en flight global + résultat mémoïsé pour la durée de
// la session. Le cache vit dans le module (singleton) pas dans un useState
// pour être partagé entre tous les consumers.
//
// Pas de TTL : l'historique CSV est immuable côté serveur (Vercel rewrite vers
// `/portfolio-history.csv`). Si on a besoin de forcer le refresh un jour
// (ex : nouveau snapshot publié), exporter `invalidatePortfolioHistoryCache()`.

import { useEffect, useState } from 'react';
import { fetchPortfolioHistory, MarketDataPoint } from '../services/finance';
import { useFinanceStore } from '../store/useFinanceStore';
import { generateTestMarketData } from '../services/testFixtures';

let cached: MarketDataPoint[] | null = null;
let inFlight: Promise<MarketDataPoint[]> | null = null;

async function getPortfolioHistory(): Promise<MarketDataPoint[]> {
    if (cached) return cached;
    if (inFlight) return inFlight;
    inFlight = fetchPortfolioHistory().then(data => {
        cached = data;
        inFlight = null;
        return data;
    }).catch(e => {
        inFlight = null; // permettre un retry
        throw e;
    });
    return inFlight;
}

export interface UsePortfolioHistoryResult {
    history: MarketDataPoint[];
    isLoading: boolean;
    error: Error | null;
}

export function usePortfolioHistory(): UsePortfolioHistoryResult {
    // En mode test, on retourne un marketData synthétique généré depuis les
    // fixtures pour que Dashboard (Évolution Détaillée, Actifs individuels)
    // et Investments (Vue d'ensemble, Allocation, Performance) aient des
    // données à afficher. Sans ce hook, l'utilisateur en mode test voit
    // "Aucun actif trouvé" partout malgré 5 assets dans le store.
    const isTestMode = useFinanceStore(s => s.isTestMode);
    const [history, setHistory] = useState<MarketDataPoint[]>(() => {
        if (isTestMode) return generateTestMarketData();
        return cached ?? [];
    });
    const [isLoading, setIsLoading] = useState(() => !isTestMode && cached === null);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (isTestMode) {
            // Régénère à chaque fois pour rester aligné si les fixtures changent
            setHistory(generateTestMarketData());
            setIsLoading(false);
            return;
        }
        let cancelled = false;
        if (cached) {
            setHistory(cached);
            setIsLoading(false);
            return;
        }
        getPortfolioHistory()
            .then(data => {
                if (!cancelled) {
                    setHistory(data);
                    setIsLoading(false);
                }
            })
            .catch(e => {
                if (!cancelled) {
                    setError(e instanceof Error ? e : new Error(String(e)));
                    setIsLoading(false);
                }
            });
        return () => { cancelled = true; };
    }, [isTestMode]);

    return { history, isLoading, error };
}

/** Vide le cache (utile pour les tests, ou si on veut forcer un refresh côté UI). */
export function invalidatePortfolioHistoryCache(): void {
    cached = null;
    inFlight = null;
}
