// services/projection/historicalReturns.ts
// W1.2 — Bootstrap historique des rendements réels du marché US.
//
// Au lieu de tirer des rendements gaussiens (qui sous-estiment les queues),
// on rééchantillonne des blocs consécutifs de l'historique réel S&P 500
// + inflation US. Capture les vrais krachs (1929, 1973-74, 2000-02, 2008, 2020).
//
// Source: Robert Shiller data (yale.edu/~shiller), rendements annuels nominaux
// total return du S&P 500 + CPI inflation US. Période 1928-2024 (97 ans).
//
// Les valeurs sont des proxys / fortement arrondies pour rester compactes;
// elles capturent l'essentiel des distributions (crashs et booms).

export interface YearReturn {
    year: number;
    sp500TotalReturn: number;   // total return nominal (%), incl. dividendes
    bondReturn: number;         // 10Y Treasury return nominal (%)
    inflationRate: number;      // CPI US (%)
}

// Données 1928-2024 (rendements en %). Source: Aswath Damodaran (NYU Stern).
// Format compact. Pour usage projection on convertit en mois.
export const HISTORICAL_RETURNS_US: YearReturn[] = [
    { year: 1928, sp500TotalReturn: 43.81, bondReturn:  0.84, inflationRate: -1.15 },
    { year: 1929, sp500TotalReturn: -8.30, bondReturn:  4.20, inflationRate:  0.58 },
    { year: 1930, sp500TotalReturn:-25.12, bondReturn:  4.54, inflationRate: -6.40 },
    { year: 1931, sp500TotalReturn:-43.84, bondReturn: -2.56, inflationRate: -9.32 },
    { year: 1932, sp500TotalReturn: -8.64, bondReturn:  8.79, inflationRate:-10.27 },
    { year: 1933, sp500TotalReturn: 49.98, bondReturn:  1.86, inflationRate:  0.76 },
    { year: 1934, sp500TotalReturn: -1.19, bondReturn:  7.96, inflationRate:  1.52 },
    { year: 1935, sp500TotalReturn: 46.74, bondReturn:  4.47, inflationRate:  2.99 },
    { year: 1936, sp500TotalReturn: 31.94, bondReturn:  5.02, inflationRate:  1.45 },
    { year: 1937, sp500TotalReturn:-35.34, bondReturn:  1.38, inflationRate:  2.86 },
    { year: 1938, sp500TotalReturn: 29.28, bondReturn:  4.21, inflationRate: -2.78 },
    { year: 1939, sp500TotalReturn: -1.10, bondReturn:  4.41, inflationRate: -1.15 },
    { year: 1940, sp500TotalReturn: -10.67, bondReturn: 5.40, inflationRate:  0.97 },
    { year: 1941, sp500TotalReturn:-12.77, bondReturn:  -2.02, inflationRate: 9.93 },
    { year: 1942, sp500TotalReturn: 19.17, bondReturn:  2.29, inflationRate:  9.03 },
    { year: 1943, sp500TotalReturn: 25.06, bondReturn:  2.49, inflationRate:  2.96 },
    { year: 1944, sp500TotalReturn: 19.03, bondReturn:  2.58, inflationRate:  2.30 },
    { year: 1945, sp500TotalReturn: 35.82, bondReturn:  3.80, inflationRate:  2.25 },
    { year: 1946, sp500TotalReturn: -8.43, bondReturn:  3.13, inflationRate: 18.13 },
    { year: 1947, sp500TotalReturn:  5.20, bondReturn:  0.92, inflationRate:  8.84 },
    { year: 1948, sp500TotalReturn:  5.70, bondReturn:  1.95, inflationRate:  2.99 },
    { year: 1949, sp500TotalReturn: 18.30, bondReturn:  4.66, inflationRate: -2.07 },
    { year: 1950, sp500TotalReturn: 30.81, bondReturn:  0.43, inflationRate:  5.93 },
    { year: 1951, sp500TotalReturn: 23.68, bondReturn: -0.30, inflationRate:  6.00 },
    { year: 1952, sp500TotalReturn: 18.15, bondReturn:  2.27, inflationRate:  0.75 },
    { year: 1953, sp500TotalReturn: -1.21, bondReturn:  4.14, inflationRate:  0.75 },
    { year: 1954, sp500TotalReturn: 52.56, bondReturn:  3.29, inflationRate: -0.74 },
    { year: 1955, sp500TotalReturn: 32.60, bondReturn: -1.34, inflationRate:  0.37 },
    { year: 1956, sp500TotalReturn:  7.44, bondReturn: -2.26, inflationRate:  2.99 },
    { year: 1957, sp500TotalReturn:-10.46, bondReturn:  6.80, inflationRate:  2.90 },
    { year: 1958, sp500TotalReturn: 43.72, bondReturn: -2.10, inflationRate:  1.76 },
    { year: 1959, sp500TotalReturn: 12.06, bondReturn: -2.65, inflationRate:  1.73 },
    { year: 1960, sp500TotalReturn:  0.34, bondReturn: 11.64, inflationRate:  1.36 },
    { year: 1961, sp500TotalReturn: 26.64, bondReturn:  2.06, inflationRate:  0.67 },
    { year: 1962, sp500TotalReturn: -8.81, bondReturn:  5.69, inflationRate:  1.33 },
    { year: 1963, sp500TotalReturn: 22.61, bondReturn:  1.68, inflationRate:  1.64 },
    { year: 1964, sp500TotalReturn: 16.42, bondReturn:  3.73, inflationRate:  0.97 },
    { year: 1965, sp500TotalReturn: 12.40, bondReturn:  0.72, inflationRate:  1.92 },
    { year: 1966, sp500TotalReturn: -9.97, bondReturn:  2.91, inflationRate:  3.46 },
    { year: 1967, sp500TotalReturn: 23.80, bondReturn: -1.58, inflationRate:  3.04 },
    { year: 1968, sp500TotalReturn: 10.81, bondReturn:  3.27, inflationRate:  4.72 },
    { year: 1969, sp500TotalReturn: -8.24, bondReturn: -5.01, inflationRate:  6.20 },
    { year: 1970, sp500TotalReturn:  3.56, bondReturn: 16.75, inflationRate:  5.57 },
    { year: 1971, sp500TotalReturn: 14.22, bondReturn:  9.79, inflationRate:  3.27 },
    { year: 1972, sp500TotalReturn: 18.76, bondReturn:  2.82, inflationRate:  3.41 },
    { year: 1973, sp500TotalReturn:-14.31, bondReturn:  3.66, inflationRate:  8.71 },
    { year: 1974, sp500TotalReturn:-25.90, bondReturn:  1.99, inflationRate: 12.34 },
    { year: 1975, sp500TotalReturn: 37.00, bondReturn:  3.61, inflationRate:  6.94 },
    { year: 1976, sp500TotalReturn: 23.83, bondReturn: 15.98, inflationRate:  4.86 },
    { year: 1977, sp500TotalReturn: -6.98, bondReturn:  1.29, inflationRate:  6.70 },
    { year: 1978, sp500TotalReturn:  6.51, bondReturn: -0.78, inflationRate:  9.02 },
    { year: 1979, sp500TotalReturn: 18.52, bondReturn:  0.67, inflationRate: 13.29 },
    { year: 1980, sp500TotalReturn: 31.74, bondReturn: -2.99, inflationRate: 12.52 },
    { year: 1981, sp500TotalReturn: -4.70, bondReturn:  8.20, inflationRate:  8.92 },
    { year: 1982, sp500TotalReturn: 20.42, bondReturn: 32.81, inflationRate:  3.83 },
    { year: 1983, sp500TotalReturn: 22.34, bondReturn:  3.20, inflationRate:  3.79 },
    { year: 1984, sp500TotalReturn:  6.15, bondReturn: 13.73, inflationRate:  3.95 },
    { year: 1985, sp500TotalReturn: 31.24, bondReturn: 25.71, inflationRate:  3.80 },
    { year: 1986, sp500TotalReturn: 18.49, bondReturn: 24.28, inflationRate:  1.10 },
    { year: 1987, sp500TotalReturn:  5.81, bondReturn: -4.96, inflationRate:  4.43 },
    { year: 1988, sp500TotalReturn: 16.54, bondReturn:  8.22, inflationRate:  4.42 },
    { year: 1989, sp500TotalReturn: 31.48, bondReturn: 17.69, inflationRate:  4.65 },
    { year: 1990, sp500TotalReturn: -3.06, bondReturn:  6.24, inflationRate:  6.11 },
    { year: 1991, sp500TotalReturn: 30.23, bondReturn: 15.00, inflationRate:  3.06 },
    { year: 1992, sp500TotalReturn:  7.49, bondReturn:  9.36, inflationRate:  2.90 },
    { year: 1993, sp500TotalReturn:  9.97, bondReturn: 14.21, inflationRate:  2.75 },
    { year: 1994, sp500TotalReturn:  1.33, bondReturn: -8.04, inflationRate:  2.67 },
    { year: 1995, sp500TotalReturn: 37.20, bondReturn: 23.48, inflationRate:  2.54 },
    { year: 1996, sp500TotalReturn: 23.82, bondReturn:  1.43, inflationRate:  3.32 },
    { year: 1997, sp500TotalReturn: 31.86, bondReturn:  9.94, inflationRate:  1.70 },
    { year: 1998, sp500TotalReturn: 28.34, bondReturn: 14.92, inflationRate:  1.61 },
    { year: 1999, sp500TotalReturn: 20.89, bondReturn: -8.25, inflationRate:  2.68 },
    { year: 2000, sp500TotalReturn: -9.03, bondReturn: 16.66, inflationRate:  3.39 },
    { year: 2001, sp500TotalReturn:-11.85, bondReturn:  5.57, inflationRate:  1.55 },
    { year: 2002, sp500TotalReturn:-21.97, bondReturn: 15.12, inflationRate:  2.38 },
    { year: 2003, sp500TotalReturn: 28.36, bondReturn:  0.38, inflationRate:  1.88 },
    { year: 2004, sp500TotalReturn: 10.74, bondReturn:  4.49, inflationRate:  3.26 },
    { year: 2005, sp500TotalReturn:  4.83, bondReturn:  2.87, inflationRate:  3.42 },
    { year: 2006, sp500TotalReturn: 15.61, bondReturn:  1.96, inflationRate:  2.54 },
    { year: 2007, sp500TotalReturn:  5.48, bondReturn: 10.21, inflationRate:  4.08 },
    { year: 2008, sp500TotalReturn:-36.55, bondReturn: 20.10, inflationRate:  0.09 },
    { year: 2009, sp500TotalReturn: 25.94, bondReturn: -11.12, inflationRate: 2.72 },
    { year: 2010, sp500TotalReturn: 14.82, bondReturn:  8.46, inflationRate:  1.50 },
    { year: 2011, sp500TotalReturn:  2.10, bondReturn: 16.04, inflationRate:  2.96 },
    { year: 2012, sp500TotalReturn: 15.89, bondReturn:  2.97, inflationRate:  1.74 },
    { year: 2013, sp500TotalReturn: 32.15, bondReturn: -9.10, inflationRate:  1.50 },
    { year: 2014, sp500TotalReturn: 13.52, bondReturn: 10.75, inflationRate:  0.76 },
    { year: 2015, sp500TotalReturn:  1.36, bondReturn:  1.28, inflationRate:  0.73 },
    { year: 2016, sp500TotalReturn: 11.74, bondReturn:  0.69, inflationRate:  2.07 },
    { year: 2017, sp500TotalReturn: 21.61, bondReturn:  2.80, inflationRate:  2.11 },
    { year: 2018, sp500TotalReturn: -4.23, bondReturn:  0.01, inflationRate:  1.91 },
    { year: 2019, sp500TotalReturn: 31.21, bondReturn:  9.64, inflationRate:  2.29 },
    { year: 2020, sp500TotalReturn: 18.02, bondReturn: 11.33, inflationRate:  1.36 },
    { year: 2021, sp500TotalReturn: 28.47, bondReturn: -4.42, inflationRate:  7.04 },
    { year: 2022, sp500TotalReturn:-18.04, bondReturn:-17.83, inflationRate:  6.45 },
    { year: 2023, sp500TotalReturn: 26.06, bondReturn:  3.88, inflationRate:  3.35 },
    { year: 2024, sp500TotalReturn: 25.02, bondReturn:  0.58, inflationRate:  2.95 },
];

/**
 * Échantillonne un bloc de N années consécutives parmi l'historique.
 * Si le bloc dépasse la fin du dataset, on wrap-around (concat début).
 */
export function sampleHistoricalBlock(
    rng: () => number,
    blockYears: number,
): YearReturn[] {
    const n = HISTORICAL_RETURNS_US.length;
    const start = Math.floor(rng() * n);
    const block: YearReturn[] = [];
    for (let i = 0; i < blockYears; i++) {
        block.push(HISTORICAL_RETURNS_US[(start + i) % n]);
    }
    return block;
}

/**
 * Pour une projection de N années, construit une séquence annuelle
 * en assemblant des blocs successifs de `blockSize` années.
 * Cela capture la corrélation temporelle (booms longs, récessions persistantes).
 */
export function buildHistoricalSequence(
    rng: () => number,
    totalYears: number,
    blockSize: number = 24,
): YearReturn[] {
    const seq: YearReturn[] = [];
    while (seq.length < totalYears) {
        const block = sampleHistoricalBlock(rng, blockSize);
        seq.push(...block);
    }
    return seq.slice(0, totalYears);
}

/**
 * W4.5 — Replay historique. Force la simulation à utiliser les rendements
 * réels à partir d'une année donnée (ex: 1929 pour tester un krach
 * pendant la décennie critique).
 */
export function buildReplaySequence(
    startYear: number,
    totalYears: number,
): YearReturn[] {
    const idx = HISTORICAL_RETURNS_US.findIndex(y => y.year === startYear);
    if (idx === -1) return HISTORICAL_RETURNS_US.slice(0, totalYears);
    const seq: YearReturn[] = [];
    for (let i = 0; i < totalYears; i++) {
        seq.push(HISTORICAL_RETURNS_US[(idx + i) % HISTORICAL_RETURNS_US.length]);
    }
    return seq;
}

/**
 * Convertit un rendement annuel en rendement mensuel équivalent.
 * (1 + r_annual)^(1/12) - 1
 */
export function annualToMonthly(annualPct: number): number {
    return (Math.pow(1 + annualPct / 100, 1 / 12) - 1) * 100;
}
