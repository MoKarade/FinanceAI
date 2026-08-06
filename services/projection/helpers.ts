// services/projection/helpers.ts
// Helpers purs extraits du moteur de projection (zéro état partagé, zéro closure).
// Aucun changement de comportement: ce sont les mêmes fonctions et constantes,
// hissées hors de runScenario() pour la lisibilité et la testabilité.

import { calculateWelcomeTax } from '../realEstate';
import type { Municipality } from '../../types';

/**
 * Hypothèse de MODÈLE (PAS une constante fiscale, réf FISCAL_REFERENCE §3) : part du rendement
 * NON-ENREGISTRÉ versée en dividendes ADMISSIBLES chaque année. SOURCE UNIQUE consommée par le
 * moteur (`projection.ts`, `dividendIncome`) ET l'impôt de décembre (`taxDecember.ts`) — évite la
 * divergence « une copie bouge, l'autre non » (audit 2026-06-17, M2). Avant : `0.30` en dur aux 2 sites.
 */
export const NONREG_DIVIDEND_DISTRIBUTION_SHARE = 0.30;

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
    // [NAN-INPUT-HARDENING] un input non fini (NaN/Infinity) SAUTERAIT l'early-return ci-dessous (`NaN<=0`=false)
    // → croissance NaN propagée en silence. Rabat sur le résultat neutre (l'input était censé être sanitisé au boundary).
    if (!Number.isFinite(startVal) || !Number.isFinite(endVal)) return { newVal: 0, growth: 0, pct: 0 };
    // `rateAnnual` NaN/Infinity → `Math.pow(1+NaN/100,…)`=NaN propagerait aussi (vecteur trouvé au panel LOT 4).
    // Taux inconnu = PAS de croissance, mais on PRÉSERVE le solde (`endVal`, déjà fini ci-dessus) — pas de perte.
    if (!Number.isFinite(rateAnnual)) return { newVal: endVal, growth: 0, pct: 0 };
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
// Source: ARC, facteurs FERR prescrits (post-2015), cf docs/FISCAL_REFERENCE.md §6.
// À 95+ on plafonne à 20% (repli `RRIF_RATES[age] || RRIF_RATE_PLATEAU`).
// ⚠️ C'est bien `||` et NON `??` — le commentaire disait l'inverse (corrigé 2026-08-06). Sans
// effet aujourd'hui : la table ne contient aucun 0 et l'appelant filtre `age < 72`, donc le repli
// ne sert qu'à 95+. Mais un futur facteur à 0 basculerait sur 20 % au lieu de 0 %.
// NB 71 (5,28%) : présent pour COMPLÉTUDE (cas de conversion REER→FERR volontaire précoce).
// Le moteur ne FORCE le retrait minimum qu'à partir de 72 ans (cf taxJanuary §4) : pour une
// conversion standard à l'échéance des 71 ans, aucun minimum n'est dû l'année d'ouverture du FERR.
/** [FISC-CONST-ANCHOR-DEBT] Facteur de retrait minimum FERR au PLATEAU (95 ans et plus) : 20 %.
 *  Sert de repli quand l'âge sort de la table. Était en dur (`|| 0.20`) — et invisible au premier
 *  scan du garde, parce que `||` ne ressemble pas à un opérateur de calcul. Source : ARC, cf.
 *  docs/FISCAL_REFERENCE.md. */
export const RRIF_RATE_PLATEAU = 0.20;

export const RRIF_RATES: Record<number, number> = {
    71: 0.0528,
    72: 0.0540, 73: 0.0553, 74: 0.0567, 75: 0.0582, 76: 0.0598,
    77: 0.0617, 78: 0.0636, 79: 0.0658, 80: 0.0682, 81: 0.0708,
    82: 0.0738, 83: 0.0771, 84: 0.0808, 85: 0.0851, 86: 0.0899,
    87: 0.0955, 88: 0.1021, 89: 0.1099, 90: 0.1192, 91: 0.1306,
    92: 0.1449, 93: 0.1634, 94: 0.2000,
};

// ---- Taxe de bienvenue (droits de mutation) — SOURCE UNIQUE : services/realEstate.ts ----
// FISC-WELCOME-UNIFY : helpers.ts ne duplique PLUS les barèmes (avant : 8 tranches Montréal en dur,
// divergentes du barème provincial de realEstate.ts → bug C9 « 3 implémentations divergentes »).
// Délègue désormais à calculateWelcomeTax, qui porte les DEUX barèmes (Montréal / reste du QC).
// `municipality` non défini ⇒ repli CONSERVATEUR Montréal (cf docs/FISCAL_REFERENCE.md §8).
// La DI est conservée (le moteur injecte cette fonction dans processRealEstate) pour la testabilité.
export function welcomeTax(price: number, municipality?: Municipality): number {
    return calculateWelcomeTax(price, municipality);
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
