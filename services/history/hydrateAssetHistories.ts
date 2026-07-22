// services/history/hydrateAssetHistories.ts
//
// [PORTFOLIO-HISTORY] Hydrate `Asset.priceHistory` (clôtures natives datées) depuis la chaîne
// marketData.getHistory (Finnhub → repli Yahoo proxy → CoinGecko crypto), DEPUIS LE PREMIER ACHAT
// de chaque titre (« depuis que je les ai », demande Marc 2026-07-22). Remplace l'ancien chemin
// stub (fetchAssetHistory → CSV mort → priceHistory jamais rempli → graphes vides).
//
// Sécurité/rate-limit (pattern priceRefresh, leçon PERF-BOOT-RATELIMIT) :
//  - boucle SÉQUENTIELLE, sleep 2 500 ms entre APPELS RÉSEAU potentiels (≈24/min, sous la limite du
//    provider le PLUS STRICT — CoinGecko free ~30/min) ; pas de sleep pour les symboles sautés ;
//  - sélection AVANT la boucle : seuls les actifs SANS historique ou PÉRIMÉ (lastHistorySync > 24h)
//    sont traités — un boot ordinaire ne refait pas N requêtes (le cache IDB 24h absorbe déjà) ;
//  - anti-course : le patch est appliqué par SYMBOLE sur l'état FRAIS du store au moment de
//    l'écriture (un pull Drive pendant l'hydratation n'est pas écrasé) — même patron qu'applyPricePatches ;
//  - JAMAIS en mode test (les fixtures persona portent leur propre priceHistory).
//
// Deps injectables → testable sans réseau ni vrais timers.

import type { Asset } from '../../types';
import type { HistoryPoint } from '../marketData';
import { coinGeckoQuoteCurrencyFor } from '../marketData/providers/coingecko';
import { getEffectivePurchases } from '../../utils/assetPurchases';
import { logError } from '../errorLogger';

export interface HydrateHistoryDeps {
    /** Contrat façade : `[]` = vide VALIDE, `null` = ERREUR (chaîne entière en échec). */
    getHistory: (symbol: string, from: Date, to: Date) => Promise<HistoryPoint[] | null>;
    hasProvider?: (symbol: string) => boolean;
    sleep?: (ms: number) => Promise<void>;
    delayMs?: number;
    now?: () => number;
}

export interface HydrateHistoryResult {
    /** Patches par symbole : historique natif FUSIONNÉ (ancien ∪ nouveau) + horodatage de sync. */
    patches: Map<string, { priceHistory: Array<{ date: string; price: number }>; lastHistorySync: number }>;
    skipped: Array<{ symbol: string; reason: 'fresh' | 'no-provider' | 'no-first-date' | 'empty' | 'error' | 'currency-mismatch' }>;
}

const STALE_AFTER_MS = 24 * 60 * 60 * 1000; // au-delà : re-sync (aligné sur le TTL cache 'history')
const DEFAULT_DELAY_MS = 2_500;

/**
 * L'actif a-t-il besoin d'une (re)synchronisation d'historique ? (exporté pour test)
 * Éligibilité ALIGNÉE sur buildMarketData (qty≠0 OU achats connus — un actif VENDU garde sa
 * courbe passée) : avant, un actif qty=0 à purchases non vides était attendu par le graphe mais
 * JAMAIS hydraté → exclu à vie en silence (panel 2026-07-22).
 */
export function needsHistorySync(a: Asset, now: number): boolean {
    if (!a.symbol) return false;
    if ((a.quantity || 0) === 0 && getEffectivePurchases(a).length === 0) return false;
    if (!a.priceHistory || a.priceHistory.length === 0) return true;
    return !a.lastHistorySync || now - a.lastHistorySync > STALE_AFTER_MS;
}

/**
 * Fusionne l'historique EXISTANT avec les nouveaux points (le nouveau gagne à date égale, les
 * anciens points HORS de la nouvelle fenêtre survivent). Sans fusion, un provider à fenêtre
 * bornée (CoinGecko free ~365 j) REMPLAÇAIT tout : un crypto détenu > 1 an perdait chaque jour
 * son point le plus ancien (panel 2026-07-22). Exportée pour test.
 */
export function mergePriceHistories(
    existing: Array<{ date: string; price: number }> | undefined,
    fresh: Array<{ date: string; price: number }>,
): Array<{ date: string; price: number }> {
    const byDate = new Map<string, number>();
    for (const p of existing || []) {
        if (p.date && Number.isFinite(p.price) && p.price > 0) byDate.set(p.date, p.price);
    }
    for (const p of fresh) byDate.set(p.date, p.price);
    return [...byDate.entries()]
        .map(([date, price]) => ({ date, price }))
        .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Date du premier achat connu (purchases effectifs, sinon dateBought), ou null. */
function firstPurchaseDate(a: Asset): string | null {
    const purchases = getEffectivePurchases(a);
    let first: string | null = null;
    for (const p of purchases) {
        if (p.date && (!first || p.date < first)) first = p.date;
    }
    if (!first && a.dateBought) first = a.dateBought;
    return first || null;
}

export async function hydrateAssetHistories(
    assets: Asset[],
    deps: HydrateHistoryDeps,
): Promise<HydrateHistoryResult> {
    const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const delayMs = deps.delayMs ?? DEFAULT_DELAY_MS;
    const now = deps.now ?? Date.now;

    const patches: HydrateHistoryResult['patches'] = new Map();
    const skipped: HydrateHistoryResult['skipped'] = [];
    let networkCalls = 0;

    for (const a of assets || []) {
        if (!needsHistorySync(a, now())) {
            if (a.symbol) skipped.push({ symbol: a.symbol, reason: 'fresh' });
            continue;
        }
        if (deps.hasProvider && !deps.hasProvider(a.symbol)) {
            skipped.push({ symbol: a.symbol, reason: 'no-provider' });
            continue;
        }
        // Garde de DEVISE crypto (même classe que priceRefresh « currency-mismatch ») : CoinGecko
        // déduit la devise des clôtures du SUFFIXE du symbole (« BTC » nu → USD, « BTC-CAD » → CAD).
        // Si elle diverge de la devise déclarée de l'actif, les closes seraient valorisés au MAUVAIS
        // facteur FX (mesuré −27,5 % sur BTC+CAD, panel 2026-07-22) → on SAUTE (courbe absente
        // honnête) plutôt que de stocker des valeurs fausses.
        const cgCurrency = coinGeckoQuoteCurrencyFor(a.symbol);
        if (cgCurrency && cgCurrency !== (a.currency || 'CAD').toUpperCase()) {
            skipped.push({ symbol: a.symbol, reason: 'currency-mismatch' });
            logError({
                source: 'network', severity: 'warning',
                message: `Historique ${a.symbol} ignoré : le provider renvoie des prix en ${cgCurrency} mais l'actif est déclaré en ${a.currency || 'CAD'}. Renomme le symbole (ex. ${a.symbol}-${(a.currency || 'CAD').toUpperCase()}) ou corrige la devise de l'actif.`,
            });
            continue;
        }
        const first = firstPurchaseDate(a);
        if (!first) {
            // Sans la moindre date d'achat, « depuis que je les ai » est indéfini → 1 an d'historique
            // (fenêtre honnête par défaut, pas d'invention de date).
        }
        const from = first
            ? new Date(`${first}T00:00:00Z`)
            : new Date(now() - 365 * 86_400_000);
        try {
            // Pacing AVANT chaque appel réseau potentiel sauf le premier (le cache 24h peut répondre
            // instantanément, mais on ne peut pas le savoir d'ici → prudence : provider le plus strict).
            if (networkCalls > 0) await sleep(delayMs);
            networkCalls++;
            const hist = await deps.getHistory(a.symbol, from, new Date(now()));
            if (hist === null) {
                // Contrat façade : null = ÉCHEC de toute la chaîne (≠ vide légitime) → tracé,
                // pas de patch (l'historique existant SURVIT), retry au prochain boot.
                skipped.push({ symbol: a.symbol, reason: 'error' });
                logError({
                    source: 'network', severity: 'warning',
                    message: `Historique ${a.symbol} : tous les providers ont échoué (graphe partiel, nouvel essai au prochain démarrage).`,
                });
                continue;
            }
            // Filtre AVANT le check vide : une réponse non-vide mais 100 % invalide est un VIDE
            // (skip), jamais un patch `[]` qui écraserait un historique existant valide.
            const fresh = hist
                .filter((h) => h.date && Number.isFinite(h.close) && h.close > 0)
                .map((h) => ({ date: h.date, price: h.close }));
            if (fresh.length === 0) {
                skipped.push({ symbol: a.symbol, reason: 'empty' });
                continue;
            }
            patches.set(a.symbol, {
                priceHistory: mergePriceHistories(a.priceHistory, fresh),
                lastHistorySync: now(),
            });
        } catch (e) {
            skipped.push({ symbol: a.symbol, reason: 'error' });
            logError({
                source: 'network', severity: 'warning',
                message: `Hydratation de l'historique de ${a.symbol} échouée (graphe partiel).`,
                error: e instanceof Error ? e : new Error(String(e)),
            });
        }
    }

    return { patches, skipped };
}

/** Applique les patches par SYMBOLE sur une liste FRAÎCHE d'actifs (anti-course, pur). */
export function applyHistoryPatches(
    freshAssets: Asset[],
    patches: HydrateHistoryResult['patches'],
): Asset[] {
    if (patches.size === 0) return freshAssets;
    return freshAssets.map((a) =>
        patches.has(a.symbol)
            ? { ...a, ...patches.get(a.symbol)! }
            : a,
    );
}
