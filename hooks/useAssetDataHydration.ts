// hooks/useAssetDataHydration.ts
//
// [GODFILE-APP] Hydratation des DONNÉES DE MARCHÉ des actifs (historiques de cours, prix live,
// profils secteur/région), extraite telle quelle d'App.tsx. Comportement inchangé : même clé de
// re-déclenchement (ensemble des symboles), mêmes gardes mode test, même chaînage séquentiel.
// ⚠️ Ce hook doit être appelé APRÈS useAppBootEffects dans App : la configuration du provider
// marketData (clé Finnhub) doit partir AVANT les consommateurs (ordre FIFO de la promesse
// partagée de loadMarketData).

import { useEffect, useMemo } from 'react';
import type { AppState } from '../types';
import { useFinanceStore } from '../store/useFinanceStore';
// [PERF-MARKETDATA-DYNIMPORT-INERTE] Voir useAppBootEffects : jamais d'import statique de valeurs
// depuis services/marketData dans le graphe de boot — tout passe par la promesse mémoïsée.
import { loadMarketData } from '../services/marketData/lazy';
import { refreshAssetPrices, applyPricePatches } from '../services/priceRefresh';
import { logError } from '../services/errorLogger';

export function useAssetDataHydration(
    assets: AppState['assets'],
    setAppState: (patch: Partial<AppState>) => void,
): void {
    // [HIST-SESSION-HYDRATE] Clé stable = ENSEMBLE des symboles (tri + join) : un actif AJOUTÉ en cours
    // de session redéclenche l'hydratation (avant : useEffect [] = boot seulement → pas de courbe ni de
    // part au TOTAL avant le prochain reload, sans message). Pas de boucle : les patchs (priceHistory/
    // currentPrice/secteur) ne changent PAS les symboles ; une re-passe est bon marché (fraîcheur 24 h
    // par actif + mutex module `_hydrateQueue` + mutex/intervalle min de priceRefresh).
    const assetSymbolsKey = useMemo(
        () => (assets ?? []).map(a => a?.symbol || '').filter(Boolean).sort().join(','),
        [assets],
    );

    useEffect(() => {
        let cancelled = false;
        // [PORTFOLIO-HISTORY] Hydrate priceHistory (clôtures natives datées) DEPUIS LE 1ER ACHAT via
        // la chaîne marketData (Finnhub → repli Yahoo proxy → CoinGecko crypto) — remplace l'ancien
        // stub CSV mort (priceHistory jamais rempli → graphes de cours vides, bug Marc 2026-07-22).
        // Sauté en mode test (les fixtures persona portent leur propre priceHistory).
        const hydrateAssets = async () => {
            const s = useFinanceStore.getState();
            if (s.isTestMode === true) return;
            const current = s.assets ?? [];
            if (current.length === 0) return;
            try {
                const { hydrateAssetHistories, applyHistoryPatches } = await import('../services/history/hydrateAssetHistories');
                const { getHistoryDetaille, hasHistoryProvider } = await loadMarketData();
                const res = await hydrateAssetHistories(current, { getHistory: getHistoryDetaille, hasProvider: hasHistoryProvider });
                if (cancelled) return;
                // [HIST-MULTI-PROVIDER] Publier le rapport MÊME sans patch (c'est justement quand
                // rien n'a pu être hydraté que le diagnostic par titre est utile à l'écran).
                const { setHistorySyncReport } = await import('../services/history/syncDiagnostics');
                setHistorySyncReport({ at: Date.now(), skipped: res.skipped, patchedCount: res.patches.size });
                if (res.patches.size === 0) return;
                // Anti-course : patch par symbole sur l'état FRAIS (un pull Drive pendant l'hydratation
                // n'est pas écrasé) — même patron qu'applyPricePatches.
                const fresh = useFinanceStore.getState().assets ?? [];
                setAppState({ assets: applyHistoryPatches(fresh, res.patches) });
            } catch (e) {
                logError({ source: 'network', severity: 'warning', message: 'Hydratation des historiques de cours échouée (graphes partiels).', error: e });
            }
        };
        // [PRICE-REFRESH-LIVE] — après l'hydratation d'historique, rafraîchit les currentPrice
        // depuis les quotes live (séquentiel 2 500 ms, cf services/priceRefresh). Sans ça, un prix
        // reste FIGÉ à sa valeur d'ajout pour toujours (dérive mesurée ~20 k$ vs courtier).
        // Anti-course : lit l'état FRAIS du store au lancement ET à l'application (fusion par
        // symbole) — un pull Drive pendant le refresh n'est pas écrasé. Sauté en mode test
        // (ne pas réécrire les prix des fixtures persona).
        const refreshPricesAtBoot = async (): Promise<void> => {
            const s = useFinanceStore.getState();
            if (s.isTestMode === true) return;
            const current = s.assets ?? [];
            if (current.filter(a => a?.symbol && (a.quantity || 0) > 0).length === 0) return;
            try {
                // Boot = passe NON forcée : sautée si une passe a fini il y a < 5 min (mutex +
                // intervalle min du service — anti-entrelacement avec le bouton, anti-spam reload).
                // [QUOTE-NEGATIVE-CACHE] hasProvider = provider présent ET pas de skip négatif :
                // un titre manuel/GIC (3 nulls consécutifs) ne repaie plus réseau + pacing au boot.
                const { getQuote, canAttemptQuote } = await loadMarketData();
                const res = await refreshAssetPrices(current, { getQuote, hasProvider: canAttemptQuote });
                // [Finding silent-failure #499] Des cours non rafraîchis au boot laissent une trace
                // au JOURNAL (pas de toast — les titres manuels skippés par design en feraient un
                // bruit permanent) : sans ça, un skip négatif post-panne était strictement invisible.
                if (res.skipped.length > 0) {
                    logError({
                        source: 'network', severity: 'warning',
                        message: `Cours non rafraîchis au boot pour ${res.skipped.length} titre(s) : ${res.skipped.map(s => s.symbol).slice(0, 6).join(', ')}${res.skipped.length > 6 ? '…' : ''} — bouton « Actualiser les cours » pour forcer un nouvel essai.`,
                    });
                }
                // [PRICE-SYNC-REPORT] Publier les skips de quotes à l'ÉCRAN (doctor Investissements) —
                // le journal seul était invisible (finding ÉLEVÉ #499). Toujours publié ([] efface
                // les skips périmés d'une passe précédente).
                const { updateQuoteSkips } = await import('../services/history/syncDiagnostics');
                updateQuoteSkips(res.skipped);
                if (cancelled || res.patches.size === 0) return;
                const fresh = useFinanceStore.getState().assets ?? [];
                setAppState({ assets: applyPricePatches(fresh, res.patches) });
            } catch (e) {
                // [PRICE-SYNC-REPORT] Échec TOTAL : quoteSkips précédents CONSERVÉS à dessein
                // (toujours vrais — pas de prix frais) ; l'échec global part au journal.
                logError({ source: 'network', severity: 'warning', message: 'Rafraîchissement des cours au boot échoué (prix existants conservés)', error: e });
            }
        };
        // [INVEST-ALLOC-GEO-SECTOR] Après les prix : auto-remplit Asset.sector/region (profil
        // provider) pour les actifs non résolus — répare les donuts « tout en Autre ». Même garde
        // mode test + patches sur l'état FRAIS (anti-course).
        const hydrateProfilesAtBoot = async (): Promise<void> => {
            const s = useFinanceStore.getState();
            if (s.isTestMode === true) return;
            const current = s.assets ?? [];
            if (current.length === 0) return;
            try {
                const { hydrateAssetProfiles, applyProfilePatches } = await import('../services/assetProfileSync');
                // [QUOTE-NEGATIVE-CACHE] canAttemptProfile : un profil non couvert (3 nulls
                // consécutifs) n'est plus retenté à chaque boot (skip TTL 7 j, self-heal).
                const { getProfile, canAttemptProfile } = await loadMarketData();
                const res = await hydrateAssetProfiles(current, { getProfile, hasProvider: canAttemptProfile });
                if (cancelled || res.size === 0) return;
                const fresh = useFinanceStore.getState().assets ?? [];
                setAppState({ assets: applyProfilePatches(fresh, res) });
            } catch (e) {
                logError({ source: 'network', severity: 'warning', message: 'Auto-remplissage secteur/région échoué (répartitions inchangées).', error: e });
            }
        };
        hydrateAssets()
            .then(() => { if (!cancelled) return refreshPricesAtBoot(); })
            .then(() => { if (!cancelled) void hydrateProfilesAtBoot(); });
        return () => { cancelled = true; };
    // [HIST-SESSION-HYDRATE] Re-run quand l'ENSEMBLE des symboles change (ajout/retrait d'actif en
    // session) — jamais sur un simple patch de prix/historique (la clé ne bouge pas). setAppState et
    // assets restent volontairement omis (une dep sur l'objet assets re-fetcherait en boucle).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [assetSymbolsKey]);
}
