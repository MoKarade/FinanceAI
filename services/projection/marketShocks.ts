// services/projection/marketShocks.ts
// Cycle 27 split: chocs de marché mensuels (MC gaussien + bootstrap historique
// + override stress test inflation).
// Pattern: Pure Function. L'ordre exact des appels gaussianRandom(rng) est
// préservé pour garantir la reproductibilité des séquences PRNG seedées.

import { gaussianRandom, applyShock } from './helpers';
import { canadianInflationFor, type YearReturn } from './historicalReturns';
import type { BaseRates } from './glidepathRates';

export interface StressTestConfig {
    enabled: boolean;
    year: number;
    recoveryMonths: number;
    inflationShock: number;
}

export interface MarketRatesResult {
    mcCeliRate: number;
    mcReerRate: number;
    mcNonRegRate: number;
    mcCryptoRate: number;
    mcCashRate: number;
    currentInflation: number;
}

/**
 * Calcule les taux de marché effectifs pour le mois m.
 * En MC, applique 6 chocs gaussiens corrélés (ordre fixe = déterminisme PRNG).
 * Le bootstrap historique ou replay override les taux MC si présent.
 * Le stress test ajoute un choc d'inflation supplémentaire.
 */
export function computeMonthlyMarketRates(
    m: number,
    enableMonteCarlo: boolean,
    baseRates: Readonly<BaseRates>,
    simInflation: number,
    historicalSequence: YearReturn[] | null,
    stressTest: Readonly<StressTestConfig> | null,
    rng: () => number,
): MarketRatesResult {
    let mcCeliRate = baseRates.celi;
    let mcReerRate = baseRates.reer;
    let mcNonRegRate = baseRates.nonReg;
    let mcCryptoRate = baseRates.crypto;
    let mcCashRate = baseRates.cash;
    let currentInflation = simInflation;

    if (enableMonteCarlo) {
        // Chocs corrélés — l'ordre des appels rng est intentionnel et figé.
        const Z_market = gaussianRandom(rng, 0, 1);
        const Z_macro = gaussianRandom(rng, 0, 1);
        const Z_stocks = (Z_market * 0.8 + gaussianRandom(rng, 0, 1) * 0.6);
        const Z_crypto = (Z_market * 1.2 + gaussianRandom(rng, 0, 1) * 0.8);
        const Z_inflation_shock = (-Z_market * 0.4 + Z_macro * 0.6 + gaussianRandom(rng, 0, 1) * 0.5);
        const Z_cash = (Z_inflation_shock * 0.5 + gaussianRandom(rng, 0, 1) * 0.5);

        mcCeliRate = applyShock(baseRates.celi, 15, Z_stocks);
        mcReerRate = applyShock(baseRates.reer, 15, Z_stocks);
        mcNonRegRate = applyShock(baseRates.nonReg, 15, Z_stocks);
        mcCryptoRate = applyShock(baseRates.crypto, 45, Z_crypto);
        mcCashRate = applyShock(baseRates.cash, 2, Z_cash);
        currentInflation = applyShock(simInflation, 1.5, Z_inflation_shock);
    }

    // W1.2 + W4.5: Override avec rendements historiques (bootstrap MC ou replay déterministe).
    // FIX D2.x: utilise CPI Canada (StatCan v41690973) si disponible.
    if (historicalSequence) {
        const histYear = historicalSequence[Math.floor(m / 12)];
        if (histYear) {
            mcCeliRate = histYear.sp500TotalReturn;
            mcReerRate = histYear.sp500TotalReturn;
            mcNonRegRate = histYear.sp500TotalReturn;
            mcCashRate = histYear.bondReturn;
            currentInflation = canadianInflationFor(histYear.year, histYear.inflationRate);
        }
    }

    // V36: Crisis Dashboard 2.0 — Inflation Shock (stress test).
    if (stressTest?.enabled) {
        const crashStartMonth = stressTest.year * 12;
        if (m >= crashStartMonth && m <= crashStartMonth + stressTest.recoveryMonths) {
            currentInflation += stressTest.inflationShock;
        }
    }

    return { mcCeliRate, mcReerRate, mcNonRegRate, mcCryptoRate, mcCashRate, currentInflation };
}
