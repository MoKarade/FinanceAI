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
// NB 71 (5,28%) : présent pour COMPLÉTUDE (cas de conversion REER→FERR volontaire précoce).
// Le moteur ne FORCE le retrait minimum qu'à partir de 72 ans (cf taxJanuary §4) : pour une
// conversion standard à l'échéance des 71 ans, aucun minimum n'est dû l'année d'ouverture du FERR.
/** [FISC-CONST-ANCHOR-DEBT] Facteur de retrait minimum FERR au PLATEAU : 20 %.
 *  Était en dur (`|| 0.20`) — et invisible au premier scan du garde, parce que `||` ne ressemble
 *  pas à un opérateur de calcul. Source : ARC, cf. docs/FISCAL_REFERENCE.md §6. */
export const RRIF_RATE_PLATEAU = 0.20;

/** [FISC-CONST-ANCHOR-DEBT] Âge à partir duquel le facteur FERR est FIGÉ au plateau de 20 %.
 *  La table prescrite s'arrête à 94 ; au-delà, le facteur ne bouge plus. */
export const RRIF_PLATEAU_AGE = 95;

/** [FISC-CONST-ANCHOR-DEBT] Âge du PREMIER retrait minimum FERR obligatoire.
 *  La conversion REER→FERR est due au plus tard à la fin de l'année des 71 ans, mais AUCUN minimum
 *  n'est exigible l'année d'ouverture du FERR → le premier retrait forcé tombe l'année des 72 ans.
 *  ⚠️ Nommé parce que la valeur vivait en DUR sur DEUX modules (`taxJanuary` pour la conversion,
 *  `taxDecember` pour l'assiette du crédit pension) : c'est exactement la configuration jumelle qui
 *  a permis au `0.18` de survivre à son premier ancrage. Source : ARC, cf. FISCAL_REFERENCE §6. */
export const RRIF_FIRST_WITHDRAWAL_AGE = 72;

export const RRIF_RATES: Record<number, number> = {
    71: 0.0528,
    72: 0.0540, 73: 0.0553, 74: 0.0567, 75: 0.0582, 76: 0.0598,
    77: 0.0617, 78: 0.0636, 79: 0.0658, 80: 0.0682, 81: 0.0708,
    82: 0.0738, 83: 0.0771, 84: 0.0808, 85: 0.0851, 86: 0.0899,
    87: 0.0955, 88: 0.1021, 89: 0.1099, 90: 0.1192, 91: 0.1306,
    92: 0.1449, 93: 0.1634, 94: 0.2000,
};

/**
 * [FISC-RRIF-FRACTIONAL-AGE] Facteur de retrait minimum FERR pour un âge donné.
 *
 * Remplace le repli attrape-tout `RRIF_RATES[age] || RRIF_RATE_PLATEAU`, qui avait une propriété
 * dangereuse : **tout** âge absent de la table recevait le facteur le plus PUNITIF du barème.
 * Un âge fractionnaire (72,5) sortait à 20 % au lieu de 5,40 % — 3,7× trop —, et un âge `NaN`
 * passait le filtre `age < 72` (toute comparaison avec NaN est fausse) pour ressortir lui aussi
 * à 20 %. Le retrait forcé quitte l'abri fiscal et devient imposable : se tromper là coûte de
 * l'argent RÉEL, en silence.
 *
 * ⚠️ Aucun producteur d'âge fractionnaire n'existe aujourd'hui (`Onboarding` passe par `parseInt`,
 * et `currentAge = user1?.age || 30` écarte NaN). C'est donc du DURCISSEMENT, pas la correction
 * d'un bug observable — mais un repli qui distribue le pire taux sur une entrée inattendue est une
 * forme d'échec silencieux, et le corriger ne coûte rien : sortie bit-identique sur tout âge entier.
 *
 * - âge non fini → **0** : « je ne sais pas » ne devient jamais un retrait forcé inventé
 *   (no-fake-data), et ça rejoint la convention du moteur « conjoint sans âge → jamais de FERR ».
 * - âge ≥ 95 → plateau, **explicitement** plutôt que par l'absence d'entrée dans la table.
 * - sinon → la table, à l'âge entier.
 *
 * Le dernier repli reste le plateau : il ne sert qu'aux tables PARTIELLES injectées en test — la
 * table réelle n'a aucun trou de 72 à 94, et `projection.helpers.test.ts` le PROUVE.
 */
export function rrifRateForAge(age: number, table: Record<number, number> = RRIF_RATES): number {
    if (!Number.isFinite(age)) return 0;
    if (age >= RRIF_PLATEAU_AGE) return RRIF_RATE_PLATEAU;
    const rate = table[Math.floor(age)];
    return typeof rate === 'number' ? rate : RRIF_RATE_PLATEAU;
}

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
