// services/history/reconstructPortfolioHistory.ts
// A1 — reconstruction du PASSÉ réel des comptes de placement à partir des
// avoirs (purchases datés) et de l'historique de prix (priceHistory, peuplé via
// Finnhub — A2). Fonction PURE (aucun réseau, aucune dépendance store) →
// testable. La valeur marché à une date t = Σ détention(t) × prix(t), convertie
// en CAD. No-fake : si le prix historique manque pour un titre, on retombe sur
// son prix actuel et on le compte dans `coverage` pour signaler l'estimation.

import type { RegisteredAccountType } from '../../types';

export interface MinimalPurchase { date: string; quantity: number; price: number }
export interface MinimalPricePoint { date: string; price: number }
export interface MinimalAsset {
    symbol: string;
    quantity: number;
    currency: string; // 'CAD' | 'USD' | 'EUR'
    currentPrice: number; // prix actuel en devise native
    accountType?: RegisteredAccountType;
    dateBought?: string; // fallback si purchases absent
    purchases?: MinimalPurchase[];
    priceHistory?: MinimalPricePoint[]; // prix natif daté (close Finnhub)
}

// Clés alignées sur le chartData de la projection (pour fusionner les axes en A3).
export type AccountKey = 'CELI' | 'CELIAPP' | 'REER' | 'REEE' | 'NonReg' | 'Crypto';
const ACCOUNT_KEYS: AccountKey[] = ['CELI', 'CELIAPP', 'REER', 'REEE', 'NonReg', 'Crypto'];

const TYPE_TO_KEY: Record<RegisteredAccountType, AccountKey> = {
    CELI: 'CELI',
    CELIAPP: 'CELIAPP',
    REER: 'REER',
    REEE: 'REEE',
    'NON-ENREG': 'NonReg',
    CRYPTO: 'Crypto',
    MARGE: 'NonReg', // compte sur marge = non enregistré côté avoirs
    AUTRE: 'NonReg',
};

export interface PortfolioHistoryPoint {
    date: string; // YYYY-MM-DD (fin de mois)
    monthIndex: number; // ≤ 0, relatif à aujourd'hui (0 = ce mois) — aligne avec la projection
    CELI: number; CELIAPP: number; REER: number; REEE: number; NonReg: number; Crypto: number;
    NetWorth: number;
}
export interface PortfolioHistoryResult {
    points: PortfolioHistoryPoint[];
    /** Part de la valeur finale adossée à de vrais prix historiques (0..1). */
    coverage: number;
    /** Date de la 1re donnée réelle (1er achat connu), ou null. */
    firstDate: string | null;
}

const fxToCad = (currency: string, fx: Record<string, number>): number => {
    if (!currency || currency === 'CAD') return 1;
    const r = fx[currency];
    return typeof r === 'number' && r > 0 ? r : 1;
};

// Détention cumulée d'un titre à la date t (somme des achats jusqu'à t).
function holdingsAt(asset: MinimalAsset, t: string): number {
    if (asset.purchases && asset.purchases.length > 0) {
        return asset.purchases.reduce((q, p) => (p.date <= t ? q + p.quantity : q), 0);
    }
    if (asset.dateBought) return asset.dateBought <= t ? asset.quantity : 0;
    return asset.quantity; // pas de date connue → supposé détenu sur toute la fenêtre
}

// Prix natif à la date t : dernier point d'historique ≤ t. Renvoie null si aucun
// (→ le caller retombe sur le prix actuel et marque l'estimation).
function priceAt(asset: MinimalAsset, t: string): number | null {
    const hist = asset.priceHistory;
    if (!hist || hist.length === 0) return null;
    let best: MinimalPricePoint | null = null;
    for (const p of hist) {
        if (p.date <= t && (!best || p.date > best.date)) best = p;
    }
    return best ? best.price : null;
}

const lastDayOfMonth = (year: number, monthIdx0: number): string => {
    const d = new Date(Date.UTC(year, monthIdx0 + 1, 0));
    return d.toISOString().slice(0, 10);
};

/**
 * Reconstruit la valeur marché mensuelle passée par compte, de la 1re donnée
 * connue jusqu'à aujourd'hui (inclus). `monthIndex` ≤ 0 pour s'aligner sur la
 * projection (qui démarre à monthIndex 0 = aujourd'hui).
 */
export function reconstructPortfolioHistory(
    assets: MinimalAsset[],
    fx: Record<string, number>,
    opts?: { today?: Date; maxMonths?: number },
): PortfolioHistoryResult {
    const invest = (assets || []).filter((a) => (a.quantity || 0) !== 0 || (a.purchases && a.purchases.length > 0));
    if (invest.length === 0) return { points: [], coverage: 1, firstDate: null };

    // 1re date connue = plus ancien achat (sinon dateBought).
    let first: string | null = null;
    for (const a of invest) {
        const dates = [
            ...(a.purchases?.map((p) => p.date) ?? []),
            ...(a.dateBought ? [a.dateBought] : []),
        ];
        for (const d of dates) if (d && (!first || d < first)) first = d;
    }
    if (!first) return { points: [], coverage: 1, firstDate: null };

    const today = opts?.today ?? new Date();
    const maxMonths = opts?.maxMonths ?? 600;
    const firstDate = new Date(`${first}T00:00:00Z`);

    // Liste des fins de mois de `first` → aujourd'hui (cap maxMonths).
    const months: { y: number; m: number }[] = [];
    let y = firstDate.getUTCFullYear(), m = firstDate.getUTCMonth();
    const ty = today.getUTCFullYear(), tm = today.getUTCMonth();
    while ((y < ty || (y === ty && m <= tm)) && months.length < maxMonths) {
        months.push({ y, m });
        m++; if (m > 11) { m = 0; y++; }
    }

    const totalMonths = months.length;
    let valueWithRealPrice = 0;
    let valueTotalFinal = 0;

    const points: PortfolioHistoryPoint[] = months.map(({ y: yy, m: mm }, i) => {
        const t = lastDayOfMonth(yy, mm);
        const isFinal = i === totalMonths - 1;
        const acc: Record<AccountKey, number> = { CELI: 0, CELIAPP: 0, REER: 0, REEE: 0, NonReg: 0, Crypto: 0 };
        for (const a of invest) {
            const qty = holdingsAt(a, t);
            if (qty === 0) continue;
            const histPrice = priceAt(a, t);
            const price = histPrice ?? a.currentPrice ?? 0;
            const valueCad = qty * price * fxToCad(a.currency, fx);
            const key = a.accountType ? TYPE_TO_KEY[a.accountType] : 'NonReg';
            acc[key] += valueCad;
            if (isFinal) {
                valueTotalFinal += valueCad;
                if (histPrice !== null) valueWithRealPrice += valueCad;
            }
        }
        const netWorth = ACCOUNT_KEYS.reduce((s, k) => s + acc[k], 0);
        return {
            date: t,
            monthIndex: i - (totalMonths - 1), // dernier point = 0 (aujourd'hui), passé < 0
            ...acc,
            NetWorth: Number(netWorth.toFixed(2)),
        };
    });

    const coverage = valueTotalFinal > 0 ? valueWithRealPrice / valueTotalFinal : 1;
    return { points, coverage: Number(coverage.toFixed(3)), firstDate: first };
}
