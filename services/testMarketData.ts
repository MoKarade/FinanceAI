// services/testMarketData.ts
//
// Données de marché synthétiques pour le mode test, basées sur de vraies
// données Yahoo Finance (voir ci-dessous). Extrait de testFixtures.ts (DT4).
// Ne jamais charger au boot — uniquement en mode test.
//
// Convention "valeurs réelles ou rien" : aucune simulation, aucune
// interpolation. Les valeurs viennent toutes du CSV bundlé. Si une
// cellule est manquante (rare), le point est ignoré pour ce symbole.

import type { MarketDataPoint } from './finance';
import { USD_CAD_RATE, TEST_ASSETS } from './testAssets';

// Import raw du CSV historique réel (Yahoo Finance v8, weekly close,
// 2024-05-20 → 2026-05-21 — 106 points hebdo). Bundlé via Vite `?raw`,
// pas de fetch réseau requis. Voir scripts/build-test-portfolio-csv.cjs
// pour reproduire (Yahoo Finance API, sans clé requise).
import testPortfolioCsv from './data/test-portfolio-history.csv?raw';

/**
 * Parse le CSV bundlé en un map `{ date: string; prices: Record<string, number> }[]`.
 * Convertit AAPL (USD source Yahoo) en CAD via taux fixe USD_CAD_RATE.
 */
function parseTestMarketCsv(): { date: string; prices: Record<string, number> }[] {
    const lines = testPortfolioCsv.trim().split(/\r?\n/);
    const headers = lines[0].split(',').map(s => s.trim());
    // headers attendus : date,VFV.TO,AAPL,BTC-CAD,VEQT.TO,XEQT.TO
    const rows: { date: string; prices: Record<string, number> }[] = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(s => s.trim());
        if (cols.length < headers.length) continue;
        const row: { date: string; prices: Record<string, number> } = {
            date: cols[0],
            prices: {},
        };
        for (let j = 1; j < headers.length; j++) {
            const symbol = headers[j];
            const raw = parseFloat(cols[j]);
            if (!Number.isFinite(raw)) continue;
            row.prices[symbol] = symbol === 'AAPL' ? raw * USD_CAD_RATE : raw;
        }
        rows.push(row);
    }
    return rows;
}

const PARSED_CSV = parseTestMarketCsv();

// U5 — Warning si le CSV bundlé manque un symbole utilisé par TEST_ASSETS.
// Détecte les régressions futures (ex: si on ajoute un actif test sans
// régénérer le CSV via scripts/build-test-portfolio-csv.cjs).
(function validateCsvSymbols() {
    if (PARSED_CSV.length === 0) return;
    const csvSymbols = new Set(Object.keys(PARSED_CSV[0].prices));
    const missing: string[] = [];
    for (const a of TEST_ASSETS) {
        if (!csvSymbols.has(a.symbol)) missing.push(a.symbol);
    }
    if (missing.length > 0) {
        console.warn(
            `[testMarketData] CSV bundlé manque ${missing.length} symbole(s) utilisé(s) ` +
            `par TEST_ASSETS : ${missing.join(', ')}. ` +
            `Régénérer via scripts/build-test-portfolio-csv.cjs.`
        );
    }
})();

/**
 * Historique de marché pour le mode test, basé sur des vraies données
 * Yahoo Finance hebdomadaires (close prices, 2024-05 → 2026-05).
 *
 * En production : ce hook n'est pas appelé — le vrai CSV
 * `/portfolio-history.csv` (vrai portefeuille) prime.
 */
export function generateTestMarketData(): MarketDataPoint[] {
    const initialBalances = {
        CELI: 32000,
        REER: 12500,
        'NON-ENREG': 3500,
        CRYPTO: 14250,
        LIQUIDITE: 8500,
    };
    const cashTotal = Object.values(initialBalances).reduce((s, v) => s + v, 0);
    const out: MarketDataPoint[] = [];

    for (const row of PARSED_CSV) {
        const point: MarketDataPoint = { date: row.date };
        let celiTotal = 0;
        let reerTotal = 0;
        let nonRegTotal = 0;
        let cryptoTotal = 0;

        for (const a of TEST_ASSETS) {
            const price = row.prices[a.symbol];
            if (price == null) continue; // pas de fake — on saute si manquant
            const qty = a.quantity || a.purchases?.[0]?.quantity || 0;
            const value = Math.round(price * qty * 100) / 100;
            point[a.symbol] = value;
            if (a.accountType === 'CELI') celiTotal += value;
            else if (a.accountType === 'REER') reerTotal += value;
            else if (a.accountType === 'CRYPTO') cryptoTotal += value;
            else nonRegTotal += value;
        }
        point['TOTAL_CELI'] = celiTotal;
        point['TOTAL_REER'] = reerTotal;
        point['TOTAL_NON-ENREG'] = nonRegTotal;
        point['TOTAL_CRYPTO'] = cryptoTotal;
        point['TOTAL'] = celiTotal + reerTotal + nonRegTotal + cryptoTotal + cashTotal;
        out.push(point);
    }

    return out;
}
