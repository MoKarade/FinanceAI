// services/history/buildMarketData.ts
//
// [PORTFOLIO-HISTORY] Construit les lignes `MarketDataPoint` (la forme historique attendue par les
// graphes Dashboard « Évolution détaillée », Investissements « Performance comparée » et le modal de
// comparaison) à partir des VRAIS avoirs : `priceHistory` daté (hydraté via marketData.getHistory) ×
// détention à la date t (achats DCA datés) × taux de change → valeur CAD par symbole + totaux.
//
// Remplace l'ancien CSV Google Sheet (stub mort → graphes vides en données réelles, bug Marc
// 2026-07-22 « je vois pas le cours ni le cours du portefeuille »).
//
// Règles :
//  - PURE (aucun réseau, aucun store) → testable ;
//  - no-fake-data : un actif SANS historique de prix n'a NI colonne NI part dans les totaux — il est
//    listé dans `excludedSymbols` pour un affichage honnête (« courbe partielle ») ; on n'invente
//    JAMAIS une ligne plate au prix actuel ;
//  - mêmes définitions de détention/prix que la reconstruction mensuelle du Futur (helpers partagés
//    `holdingsAt`/`priceAt` — source unique, jamais deux copies qui divergent) ;
//  - les dates AVANT le premier achat global sont omises (« depuis que je les ai », demande Marc) ;
//  - totaux par bucket alignés sur les clés historiques du CSV de test : TOTAL_CELI, TOTAL_REER,
//    TOTAL_NON-ENREG, TOTAL_CRYPTO, TOTAL. ⚠️ TOTAL = PLACEMENTS SEULEMENT (pas de cash/immobilier —
//    scope validé Marc : « mon cours de portefeuille » = ses placements).

import type { Asset, RegisteredAccountType } from '../../types';
import type { MarketDataPoint } from '../finance';
import { holdingsAt, priceAt, type MinimalAsset } from './reconstructPortfolioHistory';
import { toCurrencyFactor } from '../portfolio';
import { getEffectivePurchases } from '../../utils/assetPurchases';

const BUCKET_OF: Record<RegisteredAccountType, 'TOTAL_CELI' | 'TOTAL_REER' | 'TOTAL_NON-ENREG' | 'TOTAL_CRYPTO'> = {
    CELI: 'TOTAL_CELI',
    CELIAPP: 'TOTAL_CELI',   // même famille fiscale à l'affichage des totaux historiques
    REER: 'TOTAL_REER',
    REEE: 'TOTAL_REER',
    'NON-ENREG': 'TOTAL_NON-ENREG',
    MARGE: 'TOTAL_NON-ENREG',
    AUTRE: 'TOTAL_NON-ENREG',
    CRYPTO: 'TOTAL_CRYPTO',
};

export interface BuildMarketDataResult {
    rows: MarketDataPoint[];
    /** Symboles détenus mais SANS historique de prix (exclus des colonnes ET des totaux). */
    excludedSymbols: string[];
}

/** Downsample honnête : garde ~1 point sur N pour rester < maxPoints, en conservant TOUJOURS le dernier. */
function downsample(rows: MarketDataPoint[], maxPoints: number): MarketDataPoint[] {
    if (rows.length <= maxPoints) return rows;
    const step = Math.ceil(rows.length / maxPoints);
    const out: MarketDataPoint[] = [];
    for (let i = 0; i < rows.length; i += step) out.push(rows[i]);
    if (out[out.length - 1] !== rows[rows.length - 1]) out.push(rows[rows.length - 1]);
    return out;
}

/**
 * Construit les lignes datées de valeur de portefeuille (CAD) par symbole + totaux.
 * `maxPoints` borne le volume rendu par Recharts (défaut 500 ; le zoom garde le détail utile).
 */
export function buildMarketData(
    assets: Asset[],
    fxRates: Record<string, number> | undefined,
    opts?: { maxPoints?: number },
): BuildMarketDataResult {
    const maxPoints = opts?.maxPoints ?? 500;
    const held = (assets || []).filter((a) => a.symbol && ((a.quantity || 0) !== 0 || (a.purchases?.length ?? 0) > 0));
    if (held.length === 0) return { rows: [], excludedSymbols: [] };

    // Entrées minimales (mêmes conventions que la reconstruction du Futur : purchases effectifs,
    // priceHistory natif). Un actif sans le MOINDRE point d'historique est EXCLU (no-fake-data).
    const withHistory: Array<{ asset: Asset; minimal: MinimalAsset; firstPurchase: string | null }> = [];
    const excludedSymbols: string[] = [];
    for (const a of held) {
        const purchases = getEffectivePurchases(a);
        const hist = (a.priceHistory || []).filter((p) => p.date && Number.isFinite(p.price) && p.price > 0);
        if (hist.length === 0) {
            excludedSymbols.push(a.symbol);
            continue;
        }
        const firstPurchase = purchases.length > 0
            ? purchases.reduce((min, p) => (p.date && p.date < min ? p.date : min), purchases[0].date)
            : (a.dateBought || null);
        withHistory.push({
            asset: a,
            minimal: {
                symbol: a.symbol,
                quantity: a.quantity || 0,
                currency: a.currency || 'CAD',
                currentPrice: a.currentPrice || 0,
                accountType: a.accountType,
                dateBought: a.dateBought,
                purchases,
                priceHistory: hist.map((p) => ({ date: p.date, price: p.price })),
            },
            firstPurchase,
        });
    }
    if (withHistory.length === 0) return { rows: [], excludedSymbols };

    // Axe des dates = UNION des dates d'historique, bornée à partir du 1er achat GLOBAL connu
    // (« depuis que je les ai »). Sans aucune date d'achat connue → toute la fenêtre d'historique.
    let globalFirst: string | null = null;
    for (const { firstPurchase } of withHistory) {
        if (firstPurchase && (!globalFirst || firstPurchase < globalFirst)) globalFirst = firstPurchase;
    }
    const dateSet = new Set<string>();
    for (const { minimal } of withHistory) {
        for (const p of minimal.priceHistory!) {
            if (!globalFirst || p.date >= globalFirst) dateSet.add(p.date);
        }
    }
    const dates = [...dateSet].sort();
    if (dates.length === 0) return { rows: [], excludedSymbols };

    const rows: MarketDataPoint[] = dates.map((t) => {
        const row: MarketDataPoint = { date: t };
        let total = 0;
        const buckets: Record<string, number> = {
            TOTAL_CELI: 0, TOTAL_REER: 0, 'TOTAL_NON-ENREG': 0, TOTAL_CRYPTO: 0,
        };
        for (const { minimal } of withHistory) {
            const qty = holdingsAt(minimal, t);
            if (qty <= 0) continue;
            const price = priceAt(minimal, t);
            if (price === null) continue; // pas encore de point ≤ t pour CE titre → pas de valeur inventée
            const valueCad = qty * price * toCurrencyFactor(fxRates, minimal.currency);
            if (!Number.isFinite(valueCad)) continue;
            const v = Number(valueCad.toFixed(2));
            row[minimal.symbol] = v;
            total += v;
            const bucket = BUCKET_OF[minimal.accountType ?? 'NON-ENREG'];
            buckets[bucket] += v;
        }
        for (const [k, v] of Object.entries(buckets)) {
            if (v > 0) row[k] = Number(v.toFixed(2));
        }
        row.TOTAL = Number(total.toFixed(2));
        return row;
    });

    return { rows: downsample(rows, maxPoints), excludedSymbols };
}
