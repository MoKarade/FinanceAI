// services/projection/helpers.ts
// Helpers purs extraits du moteur de projection (zéro état partagé, zéro closure).
// Aucun changement de comportement: ce sont les mêmes fonctions et constantes,
// hissées hors de runScenario() pour la lisibilité et la testabilité.

// ---- PRNG seedé (Mulberry32) — déterministe, rapide ----
export function mulberry32(seed: number): () => number {
    return function () {
        let t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ---- Box-Muller: deux uniformes → une normale standard ----
export function gaussianRandom(rng: () => number, mean: number, stdDev: number): number {
    let u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    const n = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return mean + stdDev * n;
}

// ---- Applique un choc gaussien à un taux annuel et le ré-annualise ----
export function applyShock(baseRateAnnual: number, sigmaAnnual: number, shock: number): number {
    const muMonthly = Math.pow(1 + baseRateAnnual / 100, 1 / 12) - 1;
    const sigmaMonthly = (sigmaAnnual / 100) / Math.sqrt(12);
    const monthlyRateWithShock = muMonthly + sigmaMonthly * shock;
    return (Math.pow(1 + monthlyRateWithShock, 12) - 1) * 100;
}

// ---- Volatilité annuelle (écart-type) par classe d'actif ----
export const ASSET_VOLATILITY = {
    stocks: 0.15,  // CELI, REER, NonReg — indice actions
    crypto: 0.50,
    cash: 0.03,
} as const;

// V31: Frais de gestion appliqués stochastiquement
export const MER = 0.0020;

// ---- Table de retrait minimum FERR (RRIF) par âge (Canada) ----
// Source: ARC. À 94+ on plafonne à 20% (fallback via `RRIF_RATES[age] ?? 0.20`).
export const RRIF_RATES: Record<number, number> = {
    72: 0.0540, 73: 0.0553, 74: 0.0567, 75: 0.0582, 76: 0.0598,
    77: 0.0617, 78: 0.0636, 79: 0.0658, 80: 0.0682, 81: 0.0708,
    82: 0.0738, 83: 0.0771, 84: 0.0808, 85: 0.0851, 86: 0.0899,
    87: 0.0955, 88: 0.1021, 89: 0.1099, 90: 0.1192, 91: 0.1306,
    92: 0.1449, 93: 0.1634, 94: 0.2000,
};

// ---- Taxe de bienvenue (Montréal — Loi sur les droits de mutation) ----
// TODO D2.5: paramétrer par municipalité (Québec, Laval, Gatineau diffèrent).
export function welcomeTax(price: number): number {
    let tax = 0;
    if (price > 500000) tax += (price - 500000) * 0.030;
    else if (price > 300000) tax += (price - 300000) * 0.015;
    else if (price > 50000) tax += (price - 50000) * 0.010;
    tax += Math.min(price, 50000) * 0.005;
    return tax;
}
