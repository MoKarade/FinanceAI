// services/testAssets.ts
//
// Actifs de test (CELI, REER, Non-Enreg, Crypto) pour le mode test.
// Extrait de testFixtures.ts (DT4) — ne jamais charger au boot.
//
// Convention "valeurs réelles ou rien" : currentPrice et buyPrice sont les
// VRAIES valeurs Yahoo Finance correspondant aux premier et dernier points
// du CSV `services/data/test-portfolio-history.csv` (snapshot 2024-05-20
// → 2026-05-21, hebdomadaire). AAPL est converti USD → CAD au taux fixe
// USD_CAD_RATE documenté ci-dessous.

import type { Asset } from '../types';

// Taux de change USD/CAD fixe documenté (moyenne 2024-2026, approximation).
// Si le CSV est régénéré, vérifier que ce taux est cohérent.
export const USD_CAD_RATE = 1.37;

// Helper : génère un priceHistory plausible sur 12 mois (7 points bimestriels),
// interpolation linéaire entre buyPrice et currentPrice.
function genHistory(buyPrice: number, currentPrice: number): Array<{ date: string; price: number }> {
    const out: Array<{ date: string; price: number }> = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setMonth(d.getMonth() - i * 2);
        const t = (6 - i) / 6;
        const price = buyPrice + (currentPrice - buyPrice) * t;
        out.push({ date: d.toISOString().split('T')[0], price: Math.round(price * 100) / 100 });
    }
    return out;
}

export const TEST_ASSETS: Asset[] = [
    {
        id: 'test-asset-1', symbol: 'VFV.TO', name: 'Vanguard S&P 500 (CAD)', region: 'us-equity',
        sector: 'index', accountType: 'CELI', currentPrice: 182.18,
        priceHistory: genHistory(128.78, 182.18),
        purchases: [{ date: '2024-05-20', price: 128.78, quantity: 50 }],
        dateBought: '2024-05-20', buyPrice: 128.78, quantity: 50,
    },
    {
        id: 'test-asset-2', symbol: 'VEQT.TO', name: 'Vanguard All-Equity', region: 'global',
        sector: 'index', accountType: 'REER', currentPrice: 59.19,
        priceHistory: genHistory(41.16, 59.19),
        purchases: [{ date: '2024-05-20', price: 41.16, quantity: 250 }],
        dateBought: '2024-05-20', buyPrice: 41.16, quantity: 250,
    },
    {
        id: 'test-asset-3', symbol: 'XEQT.TO', name: 'iShares All-Equity', region: 'global',
        sector: 'index', accountType: 'NON-ENREG', currentPrice: 43.82,
        priceHistory: genHistory(31.02, 43.82),
        purchases: [{ date: '2024-05-20', price: 31.02, quantity: 100 }],
        dateBought: '2024-05-20', buyPrice: 31.02, quantity: 100,
    },
    {
        id: 'test-asset-4', symbol: 'AAPL', name: 'Apple Inc.', region: 'us-equity',
        sector: 'tech', accountType: 'CELI', currentPrice: 304.99 * USD_CAD_RATE,
        priceHistory: genHistory(189.98 * USD_CAD_RATE, 304.99 * USD_CAD_RATE),
        purchases: [{ date: '2024-05-20', price: 189.98 * USD_CAD_RATE, quantity: 20 }],
        dateBought: '2024-05-20', buyPrice: 189.98 * USD_CAD_RATE, quantity: 20,
    },
    {
        id: 'test-asset-5', symbol: 'BTC-CAD', name: 'Bitcoin', region: 'crypto',
        sector: 'crypto', accountType: 'CRYPTO', currentPrice: 106951.52,
        priceHistory: genHistory(93665.95, 106951.52),
        purchases: [{ date: '2024-05-20', price: 93665.95, quantity: 0.15 }],
        dateBought: '2024-05-20', buyPrice: 93665.95, quantity: 0.15,
    },
] as unknown as Asset[];
