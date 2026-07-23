// services/history/periodReturn.ts
//
// [INVEST-PERF-PERIOD] Variations/performances sur une PÉRIODE AU CHOIX (demande Marc 2026-07-23 :
// « la performance actuellement c'est 24h mais je veux pouvoir choisir moi »). Deux calculs
// DISTINCTS, honnêtes sur leur sémantique :
//  - `seriesReturnPct` : variation de VALEUR d'une série du marketData (TOTAL, buckets, positions
//    en CAD) — une position peut varier par ACHAT autant que par le cours → c'est une « variation »,
//    pas une performance de prix. '24H' = avant-dernière ligne portant la clé (le dernier jour de
//    bourse — comportement historique de la page).
//  - `priceReturnPct` : performance de PRIX NATIF d'un titre (priceHistory), insensible aux achats
//    (règle ASSET-FX : les % sont des ratios natifs, jamais de CAD injecté).
// no-fake-data : pas de baseline dans la fenêtre (titre plus récent que la période, série absente)
// → null (affiché « — »), JAMAIS un 0 plausible.

import type { MarketDataPoint } from '../finance';

export type PerfPeriod = '24H' | '7D' | '1M' | '3M' | '6M' | 'YTD' | '1Y';

export const PERF_PERIODS: PerfPeriod[] = ['24H', '7D', '1M', '3M', '6M', 'YTD', '1Y'];

export const PERF_PERIOD_LABELS: Record<PerfPeriod, string> = {
    '24H': '24h', '7D': '7 j', '1M': '1 mois', '3M': '3 mois', '6M': '6 mois', 'YTD': 'cette année', '1Y': '1 an',
};

/** Date-borne (YYYY-MM-DD) de début de période, relative à la date de RÉFÉRENCE (dernier point). */
export function periodStartDate(refDate: string, period: Exclude<PerfPeriod, '24H'>): string {
    const d = new Date(`${refDate}T00:00:00Z`);
    switch (period) {
        case '7D': d.setUTCDate(d.getUTCDate() - 7); break;
        case '1M': d.setUTCMonth(d.getUTCMonth() - 1); break;
        case '3M': d.setUTCMonth(d.getUTCMonth() - 3); break;
        case '6M': d.setUTCMonth(d.getUTCMonth() - 6); break;
        case '1Y': d.setUTCFullYear(d.getUTCFullYear() - 1); break;
        case 'YTD': return `${refDate.slice(0, 4)}-01-01`;
    }
    return d.toISOString().slice(0, 10);
}

const pct = (from: number, to: number): number => ((to - from) / from) * 100;

/**
 * Le titre/la série est-il le benchmark « marché » (MSCI World / CW8) ?
 * Matching STRICT (finding ÉLEVÉ panel #498, prouvé par sonde) : un `name.includes('MSCI')` nu
 * matchait « Amundi MSCI Em Asia » (AASI.PA, titre réel du portefeuille) → la carte « Marché »
 * pouvait afficher l'Asie émergente comme benchmark mondial selon l'ordre des actifs — 3ᵉ
 * instance de la classe « matching par sous-chaîne » (cf historyKeyMatchesSymbol).
 */
export function isBenchmarkCandidate(symbol: string, name?: string): boolean {
    if (symbol.toUpperCase().includes('CW8')) return true; // CW8.PA / EPA:CW8 / CW8
    return (name || '').toUpperCase().includes('MSCI WORLD');
}

/**
 * Variation % de la série `key` du marketData entre son dernier point et la DERNIÈRE ligne datée
 * ≤ (dernière date − période) qui porte la clé (> 0). null si pas de baseline dans la fenêtre.
 */
export function seriesReturnPct(rows: MarketDataPoint[], key: string, period: PerfPeriod): number | null {
    if (!rows || rows.length === 0) return null;
    let latest: number | null = null;
    let latestIdx = -1;
    for (let i = rows.length - 1; i >= 0; i--) {
        const v = Number(rows[i][key]);
        if (Number.isFinite(v) && v > 0) { latest = v; latestIdx = i; break; }
    }
    if (latest === null) return null;
    if (period === '24H') {
        for (let i = latestIdx - 1; i >= 0; i--) {
            const v = Number(rows[i][key]);
            if (Number.isFinite(v) && v > 0) return pct(v, latest);
        }
        return null;
    }
    const start = periodStartDate(String(rows[latestIdx].date), period);
    for (let i = latestIdx - 1; i >= 0; i--) {
        if (String(rows[i].date) > start) continue;
        const v = Number(rows[i][key]);
        if (Number.isFinite(v) && v > 0) return pct(v, latest);
        // Ligne à la bonne date mais sans la clé → continuer vers le passé (lignes éparses).
    }
    return null; // série plus récente que la période → « — » honnête
}

/**
 * Performance % de PRIX NATIF d'un titre entre son dernier close et le dernier close ≤ (dernier
 * close − période). null sans baseline. `priceHistory` = points natifs {date, price} de l'actif.
 */
export function priceReturnPct(
    priceHistory: Array<{ date: string; price: number }> | undefined,
    period: PerfPeriod,
): number | null {
    const hist = (priceHistory || []).filter((p) => p.date && Number.isFinite(p.price) && p.price > 0);
    if (hist.length === 0) return null;
    // Comparateur STRICT (0 sur égalité — finding silent-failure #498) : un comparateur qui ne
    // rend jamais 0 donne un ordre DÉPENDANT DE L'ORDRE D'ARRIVÉE pour deux entrées à la même
    // date → `last` (la référence du calcul) devenait non déterministe. Avec 0, le tri est stable
    // (ES2019) : à dates égales, l'ordre d'insertion est préservé — la DERNIÈRE entrée écrite
    // gagne, déterministe. (mergePriceHistories dédoublonne déjà par date en amont — ceinture.)
    const sorted = [...hist].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const last = sorted[sorted.length - 1];
    if (period === '24H') {
        const prev = sorted[sorted.length - 2];
        return prev ? pct(prev.price, last.price) : null;
    }
    const start = periodStartDate(last.date, period);
    for (let i = sorted.length - 2; i >= 0; i--) {
        if (sorted[i].date <= start) return pct(sorted[i].price, last.price);
    }
    return null;
}
