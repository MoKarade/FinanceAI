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
//  - PURE (aucun réseau, aucun store) → testable ; l'horloge s'injecte via `opts.nowMs` ;
//  - ⚠️ [HIST-COVERAGE-TOTAL] COUVERTURE DU TOTAL (décision Marc 2026-07-23, ADR docs/decisions.md,
//    SURCLASSE l'ancien « un actif sans historique n'a NI colonne NI part dans les totaux ») : un
//    TOTAL qui omet des titres détenus est un chiffre FAUX (vu : ~190 k$ affiché vs ~242 k$ réels —
//    pire que l'approximation qu'on évitait). Désormais :
//      · titre SANS historique → AUCUNE colonne (on n'invente jamais une courbe), mais il contribue
//        au TOTAL/buckets à sa VALEUR ACTUELLE (qty(t) × currentPrice × fx, contribution PLATE en
//        prix) et il est signalé dans `noHistorySymbols` (bannière honnête). Sans prix courant
//        connu, rien n'est compté (valueCad = 0, signalé quand même) ;
//      · dates AVANT le début de l'historique d'un titre (provider borné) → prix = PREMIER close
//        connu (backfill borné, signalé via `partialHistorySymbols`) — supprime la « marche »
//        fantôme du TOTAL au jour où l'historique démarre ;
//      · queue PÉRIMÉE (dernier close > STALE_PRICE_DAYS avant t) : si t est dans les
//        STALE_PRICE_DAYS derniers jours ET que la quote live est fraîche (`priceUpdatedAt`),
//        raccord au `currentPrice` (cas GBS.PA : quote OK, candles cassées) ; sinon le titre sort
//        de la courbe (pas de forward-fill d'un vieux close) ;
//    Conséquence assumée : TOTAL = Σ colonnes symboles + Σ contributions plates sans colonne.
//  - mêmes définitions de détention/prix que la reconstruction mensuelle du Futur (helpers partagés
//    `holdingsAt`/`priceAt` — source unique, jamais deux copies qui divergent) ;
//  - ⚠️ APPROXIMATION ASSUMÉE (documentée, pas cachée — panel 2026-07-22) : le taux de change
//    COURANT (`fxRates` du jour) est appliqué à TOUT le passé (pas de source FX historique gratuite
//    branchée). La courbe d'un titre USD/EUR bouge donc légèrement quand le fx du jour bouge
//    (~5-8 % d'écart typique sur 3-5 ans). Même convention que reconstructPortfolioHistory (Futur)
//    → aucune divergence inter-surfaces ;
//  - les dates AVANT le premier achat global sont omises (« depuis que je les ai », demande Marc) ;
//  - totaux par bucket alignés sur les clés historiques du CSV de test : TOTAL_CELI, TOTAL_REER,
//    TOTAL_NON-ENREG, TOTAL_CRYPTO, TOTAL. ⚠️ TOTAL = PLACEMENTS SEULEMENT (pas de cash/immobilier —
//    scope validé Marc : « mon cours de portefeuille » = ses placements).

import type { Asset, RegisteredAccountType } from '../../types';
import type { MarketDataPoint } from '../finance';
import { holdingsAt, priceAt, type MinimalAsset } from './reconstructPortfolioHistory';
import { toCurrencyFactor } from '../portfolio';
import { getEffectivePurchases } from '../../utils/assetPurchases';

// Exporté : le Dashboard (piles CELI/REER/NonReg/Crypto) doit router par la MÊME table que les
// buckets émis ici — avant, sa comparaison stricte `type === 'CELI'` classait CELIAPP/REEE en
// NonReg alors qu'Investissements les comptait en TOTAL_CELI/TOTAL_REER (panel 2026-07-22).
export const BUCKET_OF: Record<RegisteredAccountType, 'TOTAL_CELI' | 'TOTAL_REER' | 'TOTAL_NON-ENREG' | 'TOTAL_CRYPTO'> = {
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
    /**
     * [HIST-COVERAGE-TOTAL] Titres détenus SANS le moindre historique de cours : pas de colonne
     * (aucune courbe inventée), mais INCLUS au TOTAL/buckets à leur valeur actuelle —
     * `valueCad` = qty courante × currentPrice × fx (0 si aucun prix courant connu → alors rien
     * n'est compté). L'UI DOIT le signaler (bannière « sans courbe, compté à la valeur actuelle »).
     */
    noHistorySymbols: Array<{ symbol: string; valueCad: number }>;
    /**
     * Symboles dont l'historique commence NETTEMENT APRÈS leur premier achat (provider borné —
     * ex. CoinGecko free cappe à ~365 j). Avant `historyStart`, le titre compte au PREMIER close
     * connu (backfill borné — sans lui, la courbe TOTAL faisait une « marche » fantôme au jour où
     * l'historique démarre, mesuré +90 k$ sans transaction, panel 2026-07-22). L'UI doit signaler
     * l'approximation.
     */
    partialHistorySymbols: Array<{ symbol: string; historyStart: string }>;
    /**
     * [Finding silent-failure #493 — CRITIQUE, mesuré] Symboles dont la QUEUE d'historique est
     * périmée SANS quote live fraîche pour la raccorder : le titre est ABSENT du TOTAL à la
     * dernière date tracée (les jours les plus consultés). Sans ce signal, on reproduisait en
     * silence le trou même que ce module corrige (TOTAL amputé sans avertissement). L'UI doit
     * le signaler (« historique arrêté depuis le X, absent du total des derniers jours »).
     */
    staleTailSymbols: Array<{ symbol: string; lastKnownDate: string }>;
    /**
     * [PERF-STALE-TAIL-ZERO] Clés `${date}|${symbol}` dont la valeur du jour a été RACCORDÉE au prix
     * courant (queue de candles cassée MAIS quote live fraîche — cas GBS.PA). Deux jours consécutifs
     * raccordés au même `currentPrice` donnent un `seriesReturnPct` de 0,00 % techniquement exact mais
     * TROMPEUR (donnée figée ≠ marché plat). L'UI/`seriesReturnPct` doit rendre « — » quand latest ET
     * baseline sont synthétiques. Scope PER-SYMBOLE (les agrégats TOTAL/buckets mêlent réel+synthétique).
     */
    syntheticTailKeys: Set<string>;
}

/** Au-delà de ce retard entre le dernier close connu et la date t, le prix est PÉRIMÉ (pas de forward-fill). */
const STALE_PRICE_DAYS = 7;
/** Tolérance avant de déclarer un historique « partiel » vs le 1er achat (week-ends/fériés). */
const PARTIAL_WINDOW_TOLERANCE_DAYS = 7;

const DAY_MS = 86_400_000;
const daysBetween = (a: string, b: string): number =>
    Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

/**
 * Une clé de ligne MarketDataPoint correspond-elle à un symbole d'actif ? Clés réelles = symbole
 * EXACT (buildMarketData) ; clés legacy du CSV de test = préfixées place (« NASDAQ:AAPL »).
 * ⚠️ JAMAIS `key.includes(symbol)` : « V » (Visa) matche « VFV.TO » → mauvaise courbe affichée
 * avec assurance (violation no-fake-data, panel 2026-07-22).
 */
export function historyKeyMatchesSymbol(key: string, symbol: string): boolean {
    if (!key || !symbol) return false;
    if (key === symbol) return true;
    return key.replace(/^[A-Z]+:/, '') === symbol;
}

/**
 * Downsample honnête : garde ~1 point sur N pour rester < maxPoints, en conservant TOUJOURS les
 * DEUX derniers points — les KPIs « variation 24h » lisent les deux dernières lignes ; sans
 * l'avant-dernier point réel, la « variation 24h » porterait sur `step` jours (libellé menteur).
 */
function downsample(rows: MarketDataPoint[], maxPoints: number): MarketDataPoint[] {
    if (rows.length <= maxPoints) return rows;
    const step = Math.ceil(rows.length / maxPoints);
    const out: MarketDataPoint[] = [];
    for (let i = 0; i < rows.length; i += step) out.push(rows[i]);
    const secondLast = rows[rows.length - 2];
    if (secondLast && !out.includes(secondLast)) {
        if (out[out.length - 1] === rows[rows.length - 1]) out.splice(out.length - 1, 0, secondLast);
        else out.push(secondLast);
    }
    if (out[out.length - 1] !== rows[rows.length - 1]) out.push(rows[rows.length - 1]);
    return out;
}

/** Premier achat connu (purchases effectifs, sinon dateBought), ou null. */
function firstPurchaseOf(purchases: Array<{ date: string }>, dateBought: string | undefined): string | null {
    if (purchases.length > 0) {
        return purchases.reduce((min, p) => (p.date && p.date < min ? p.date : min), purchases[0].date) || null;
    }
    return dateBought || null;
}

/**
 * Construit les lignes datées de valeur de portefeuille (CAD) par symbole + totaux.
 * `maxPoints` borne le volume rendu par Recharts (défaut 500 ; le zoom garde le détail utile).
 * `nowMs` : horloge injectable (raccord des queues périmées à la quote fraîche) — défaut Date.now().
 */
export function buildMarketData(
    assets: Asset[],
    fxRates: Record<string, number> | undefined,
    opts?: { maxPoints?: number; nowMs?: number },
): BuildMarketDataResult {
    const maxPoints = opts?.maxPoints ?? 500;
    const nowMs = opts?.nowMs ?? Date.now();
    const todayStr = new Date(nowMs).toISOString().slice(0, 10);
    const held = (assets || []).filter((a) => a.symbol && ((a.quantity || 0) !== 0 || (a.purchases?.length ?? 0) > 0));
    if (held.length === 0) return { rows: [], noHistorySymbols: [], partialHistorySymbols: [], staleTailSymbols: [], syntheticTailKeys: new Set() };

    // Entrées minimales (mêmes conventions que la reconstruction du Futur : purchases effectifs,
    // priceHistory natif). Un actif sans le MOINDRE point d'historique n'a pas de colonne mais
    // contribue au TOTAL à sa valeur actuelle (flatOnly) — [HIST-COVERAGE-TOTAL].
    interface HistEntry {
        minimal: MinimalAsset;
        firstPurchase: string | null;
        historyStart: string;
        firstClose: number;
        lastCloseDate: string;
        quoteFresh: boolean;
    }
    const withHistory: HistEntry[] = [];
    const flatOnly: Array<{ minimal: MinimalAsset; firstPurchase: string | null }> = [];
    const noHistoryValue = new Map<string, number>(); // agrégé par symbole (multi-comptes)
    const partialHistorySymbols: BuildMarketDataResult['partialHistorySymbols'] = [];
    for (const a of held) {
        const purchases = getEffectivePurchases(a);
        const hist = (a.priceHistory || []).filter((p) => p.date && Number.isFinite(p.price) && p.price > 0);
        const firstPurchase = firstPurchaseOf(purchases, a.dateBought);
        const minimal: MinimalAsset = {
            symbol: a.symbol,
            quantity: a.quantity || 0,
            currency: a.currency || 'CAD',
            currentPrice: a.currentPrice || 0,
            accountType: a.accountType,
            dateBought: a.dateBought,
            purchases,
            priceHistory: hist.map((p) => ({ date: p.date, price: p.price })),
        };
        if (hist.length === 0) {
            const cur = Number(a.currentPrice);
            // [Finding financial-integrity #493 — MOYEN, mesuré] MÊME base de quantité que la
            // contribution aux lignes (`holdingsAt`, achats datés) — `a.quantity` peut être
            // désynchronisé de Σ purchases (sells) → le bandeau annonçait un montant ≠ tracé.
            const qtyNow = holdingsAt(minimal, todayStr);
            const flatValue = Number.isFinite(cur) && cur > 0 && qtyNow > 0
                ? qtyNow * cur * toCurrencyFactor(fxRates, minimal.currency)
                : 0;
            noHistoryValue.set(a.symbol,
                (noHistoryValue.get(a.symbol) ?? 0) + (Number.isFinite(flatValue) ? flatValue : 0));
            if (Number.isFinite(flatValue) && flatValue > 0) flatOnly.push({ minimal, firstPurchase });
            continue;
        }
        const historyStart = hist.reduce((min, p) => (p.date < min ? p.date : min), hist[0].date);
        const firstClose = hist.reduce(
            (best, p) => (p.date === historyStart ? p.price : best), hist[0].price);
        const lastCloseDate = hist.reduce((max, p) => (p.date > max ? p.date : max), hist[0].date);
        if (firstPurchase && daysBetween(firstPurchase, historyStart) > PARTIAL_WINDOW_TOLERANCE_DAYS
            && !partialHistorySymbols.some((p) => p.symbol === a.symbol)) {
            partialHistorySymbols.push({ symbol: a.symbol, historyStart });
        }
        const quoteFresh = typeof a.priceUpdatedAt === 'number'
            && nowMs - a.priceUpdatedAt <= STALE_PRICE_DAYS * DAY_MS
            && Number.isFinite(a.currentPrice) && (a.currentPrice || 0) > 0;
        withHistory.push({ minimal, firstPurchase, historyStart, firstClose, lastCloseDate, quoteFresh });
    }
    const noHistorySymbols: BuildMarketDataResult['noHistorySymbols'] =
        [...noHistoryValue.entries()].map(([symbol, valueCad]) => ({ symbol, valueCad: Number(valueCad.toFixed(2)) }));
    if (withHistory.length === 0) return { rows: [], noHistorySymbols, partialHistorySymbols, staleTailSymbols: [], syntheticTailKeys: new Set() };

    // Axe des dates = UNION des dates d'historique, bornée à partir du 1er achat GLOBAL connu
    // (« depuis que je les ai ») — les titres SANS historique comptent aussi pour cette borne.
    // Sans aucune date d'achat connue → toute la fenêtre d'historique.
    let globalFirst: string | null = null;
    for (const { firstPurchase } of [...withHistory, ...flatOnly]) {
        if (firstPurchase && (!globalFirst || firstPurchase < globalFirst)) globalFirst = firstPurchase;
    }
    const dateSet = new Set<string>();
    for (const { minimal } of withHistory) {
        for (const p of minimal.priceHistory!) {
            if (!globalFirst || p.date >= globalFirst) dateSet.add(p.date);
        }
    }
    const dates = [...dateSet].sort();
    if (dates.length === 0) return { rows: [], noHistorySymbols, partialHistorySymbols, staleTailSymbols: [], syntheticTailKeys: new Set() };

    const lastAxisDate = dates[dates.length - 1];
    const staleTailSymbols: BuildMarketDataResult['staleTailSymbols'] = [];
    // [PERF-STALE-TAIL-ZERO] `${date}|${symbol}` raccordés au prix courant (candles KO, quote fraîche).
    const syntheticTailKeys = new Set<string>();
    const rows: MarketDataPoint[] = dates.map((t) => {
        const row: MarketDataPoint = { date: t };
        let total = 0;
        const buckets: Record<string, number> = {
            TOTAL_CELI: 0, TOTAL_REER: 0, 'TOTAL_NON-ENREG': 0, TOTAL_CRYPTO: 0,
        };
        // AGRÉGAT par symbole : le même titre peut vivre dans PLUSIEURS comptes (XEQT en CELI et
        // REER) — une affectation directe `row[symbol] = v` écrasait la 1re position (colonne
        // sous-comptée de la valeur ENTIÈRE d'une position ; mesuré 10 k$, panel 2026-07-22).
        const bySymbol: Record<string, number> = {};
        for (const { minimal, historyStart, firstClose, lastCloseDate, quoteFresh } of withHistory) {
            const qty = holdingsAt(minimal, t);
            if (qty <= 0) continue;
            let price = priceAt(minimal, t, STALE_PRICE_DAYS);
            if (price === null) {
                if (t < historyStart) {
                    // [HIST-COVERAGE-TOTAL] Backfill borné pré-historique : le titre était DÉTENU
                    // (qty > 0) mais le provider ne remonte pas si loin → premier close connu
                    // (signalé partialHistorySymbols) plutôt qu'une marche fantôme du TOTAL.
                    price = firstClose;
                } else if (quoteFresh && daysBetween(t, todayStr) >= 0 && daysBetween(t, todayStr) <= STALE_PRICE_DAYS) {
                    // Queue périmée MAIS quote live fraîche : raccord au prix courant pour les
                    // derniers jours (cas « quote OK, candles cassées » — GBS.PA).
                    price = minimal.currentPrice;
                    // [PERF-STALE-TAIL-ZERO] Valeur du jour SYNTHÉTIQUE (prix figé) → traçable pour
                    // que seriesReturnPct ne rende pas un 0 % trompeur si latest ET baseline le sont.
                    syntheticTailKeys.add(`${t}|${minimal.symbol}`);
                } else {
                    // Périmé sans quote fraîche → pas de valeur inventée. MAIS un titre absent de
                    // la DERNIÈRE date tracée = TOTAL récent amputé → SIGNALER (finding
                    // silent-failure #493 : sans ce signal, on reproduisait en silence le trou
                    // même que ce module corrige).
                    if (t === lastAxisDate && !staleTailSymbols.some((s) => s.symbol === minimal.symbol)) {
                        staleTailSymbols.push({ symbol: minimal.symbol, lastKnownDate: lastCloseDate });
                    }
                    continue;
                }
            }
            const valueCad = qty * price * toCurrencyFactor(fxRates, minimal.currency);
            if (!Number.isFinite(valueCad)) continue;
            const v = Number(valueCad.toFixed(2));
            bySymbol[minimal.symbol] = (bySymbol[minimal.symbol] ?? 0) + v;
            total += v;
            const bucket = BUCKET_OF[minimal.accountType ?? 'NON-ENREG'];
            buckets[bucket] += v;
        }
        // [HIST-COVERAGE-TOTAL] Contribution PLATE des titres sans historique : TOTAL/buckets
        // seulement, JAMAIS de colonne (pas de courbe inventée). qty(t) suit les achats datés.
        for (const { minimal } of flatOnly) {
            const qty = holdingsAt(minimal, t);
            if (qty <= 0) continue;
            const valueCad = qty * minimal.currentPrice * toCurrencyFactor(fxRates, minimal.currency);
            if (!Number.isFinite(valueCad) || valueCad <= 0) continue;
            const v = Number(valueCad.toFixed(2));
            total += v;
            buckets[BUCKET_OF[minimal.accountType ?? 'NON-ENREG']] += v;
        }
        for (const [k, v] of Object.entries(bySymbol)) row[k] = Number(v.toFixed(2));
        for (const [k, v] of Object.entries(buckets)) {
            if (v > 0) row[k] = Number(v.toFixed(2));
        }
        row.TOTAL = Number(total.toFixed(2));
        return row;
    });

    return { rows: downsample(rows, maxPoints), noHistorySymbols, partialHistorySymbols, staleTailSymbols, syntheticTailKeys };
}
