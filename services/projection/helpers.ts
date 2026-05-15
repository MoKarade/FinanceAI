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

// V31: Séquençage Mid-Month & Intégration globale des MER
// Cycle 7 split: hoisté hors de runScenario (était redéfini 360× par scénario).
export function applyMidMonthGrowth(startVal: number, endVal: number, rateAnnual: number, applyMER: boolean = true) {
    if (startVal <= 0 && endVal <= 0) return { newVal: 0, growth: 0, pct: 0 };
    const monthlyRate = Math.pow(1 + rateAnnual / 100, 1 / 12) - 1;
    const netFlow = endVal - startVal;
    // Le solde initial croît le mois entier, les flux ne croissent qu'un demi-mois
    const growthOnStart = startVal * monthlyRate;
    const growthOnFlow = netFlow * ((Math.pow(1 + rateAnnual / 100, 1 / 24)) - 1);
    const merDeduction = applyMER ? (startVal + netFlow) * (MER / 12) : 0;
    const totalGrowth = growthOnStart + growthOnFlow - merDeduction;
    const newVal = Math.max(0, endVal + totalGrowth);
    const pct = startVal > 0 ? (totalGrowth / startVal) * 100 : 0;
    return { newVal, growth: totalGrowth, pct };
}

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
// Calcul cumulatif par tranche (style impôt). Paliers 2026 Montréal.
// Source: Ville de Montréal — Règlement sur les droits de mutation.
// Note: TODO D2.5 retiré — la structure cumulative est désormais correcte.
// Pour Québec/Laval/Gatineau (paliers provinciaux 3 tranches max 1.5%),
// utiliser realEstate.ts:calculateWelcomeTax — TODO unifier les deux APIs.
const MTL_WELCOME_TAX_BRACKETS: Array<{ upTo: number; rate: number }> = [
    { upTo: 53700, rate: 0.005 },     // 0.5% jusqu'à 53 700$
    { upTo: 269300, rate: 0.010 },    // 1.0% de 53 700 à 269 300$
    { upTo: 538500, rate: 0.015 },    // 1.5% de 269 300 à 538 500$
    { upTo: 1077000, rate: 0.020 },   // 2.0% de 538 500 à 1 077 000$
    { upTo: 2154000, rate: 0.025 },   // 2.5% de 1 077 000 à 2 154 000$
    { upTo: 3231000, rate: 0.030 },   // 3.0% de 2 154 000 à 3 231 000$
    { upTo: 5385000, rate: 0.035 },   // 3.5% de 3 231 000 à 5 385 000$
    { upTo: Infinity, rate: 0.040 },  // 4.0% au-delà de 5 385 000$
];

export function welcomeTax(price: number): number {
    if (price <= 0) return 0;
    let tax = 0;
    let previousLimit = 0;
    for (const bracket of MTL_WELCOME_TAX_BRACKETS) {
        if (price <= previousLimit) break;
        const taxableInBracket = Math.min(price, bracket.upTo) - previousLimit;
        tax += taxableInBracket * bracket.rate;
        previousLimit = bracket.upTo;
    }
    return tax;
}

// ---- Probabilité annuelle d'événement de soins de longue durée (LTC) ----
// D2.8: Calibration approximative sur "Long-Term Care Need by Age" (Genworth/Stats Can).
// Le besoin de soins (>90j) culmine après 80 ans.
//   65-69: 1%/an, 70-74: 2%/an, 75-79: 4%/an, 80-84: 8%/an, 85-89: 15%/an, 90+: 25%/an
export function ltcAnnualProbability(age: number): number {
    if (age < 65) return 0;
    if (age < 70) return 0.01;
    if (age < 75) return 0.02;
    if (age < 80) return 0.04;
    if (age < 85) return 0.08;
    if (age < 90) return 0.15;
    return 0.25;
}

// ---- Probabilité annuelle de décès par âge (Stats Canada 2020-2022, unisexe lissé) ----
// D2.8: utilisé pour mortalité stochastique en MC (au lieu d'un horizon fixe).
//   Sources approximatives: 60→0.6%, 70→1.5%, 80→4%, 85→7%, 90→13%, 95→22%, 100→33%
export function mortalityAnnualProbability(age: number): number {
    if (age < 50) return 0.001;
    if (age < 60) return 0.003;
    if (age < 65) return 0.005;
    if (age < 70) return 0.009;
    if (age < 75) return 0.015;
    if (age < 80) return 0.025;
    if (age < 85) return 0.045;
    if (age < 90) return 0.080;
    if (age < 95) return 0.140;
    if (age < 100) return 0.220;
    return 0.330;
}
