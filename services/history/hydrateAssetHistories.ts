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
import { getEffectivePurchases } from '../../utils/assetPurchases';
import { logError } from '../errorLogger';

export interface HydrateHistoryDeps {
    getHistory: (symbol: string, from: Date, to: Date) => Promise<HistoryPoint[]>;
    hasProvider?: (symbol: string) => boolean;
    sleep?: (ms: number) => Promise<void>;
    delayMs?: number;
    now?: () => number;
}

export interface HydrateHistoryResult {
    /** Patches par symbole : nouvel historique natif + horodatage de sync. */
    patches: Map<string, { priceHistory: Array<{ date: string; price: number }>; lastHistorySync: number }>;
    skipped: Array<{ symbol: string; reason: 'fresh' | 'no-provider' | 'no-first-date' | 'empty' | 'error' }>;
}

const STALE_AFTER_MS = 24 * 60 * 60 * 1000; // au-delà : re-sync (aligné sur le TTL cache 'history')
const DEFAULT_DELAY_MS = 2_500;

/** L'actif a-t-il besoin d'une (re)synchronisation d'historique ? (exporté pour test) */
export function needsHistorySync(a: Asset, now: number): boolean {
    if (!a.symbol || (a.quantity || 0) === 0) return false;
    if (!a.priceHistory || a.priceHistory.length === 0) return true;
    return !a.lastHistorySync || now - a.lastHistorySync > STALE_AFTER_MS;
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
            if (!hist || hist.length === 0) {
                skipped.push({ symbol: a.symbol, reason: 'empty' });
                continue;
            }
            patches.set(a.symbol, {
                priceHistory: hist
                    .filter((h) => h.date && Number.isFinite(h.close) && h.close > 0)
                    .map((h) => ({ date: h.date, price: h.close })),
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
