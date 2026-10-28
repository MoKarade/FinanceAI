// Logique pure immobiliere canadienne (Quebec).
// Aucune dependance React. Reutilisable par le MCP server et les tests.

import type { Municipality } from '../types';
import { formatCAD } from '../utils/format';

interface MortgageInput {
  price: number;
  downPayment: number;
  rate: number;          // % annuel
  amortization: number;  // annees
}

interface MortgagePayment {
  monthlyMortgage: number;
  monthlyInterest: number; // interet du premier mois
  totalMortgage: number;
}

interface AmortizationInput extends MortgageInput {
  renewalRate?: number;       // % annuel, applique tous les 5 ans
  propertyGrowthRate?: number; // % par an
  initialRenovations?: number;
  yearlyRenovations?: number;
  maxValue?: number;           // plafond valeur projetee (0 = aucun)
  startYear?: number;          // annee de depart pour calendarYear
}

interface AmortizationYearPoint {
  year: number;
  calendarYear: number;
  age: number;
  Solde: number;
  ValeurPropriete: number;
  Equite: number;
  InteretsCumul: number;
  PrincipalCumul: number;
  PartInteretAnnuelle: number;
  PartPrincipalAnnuelle: number;
  TauxEnVigueur: string;
  RenosCumul: number;
}

interface AmortizationResult {
  data: AmortizationYearPoint[];
  totalInterest: number;
  finalValue: number;
}

interface PurchaseCostsInput {
  price: number;
  downPayment: number;
  initialRenovations?: number;
  notaryFees?: number;
  inspectionFees?: number;
  /** FISC-WELCOME-UNIFY — municipalité du bien pour la taxe de bienvenue. Non défini ⇒ repli Montréal. */
  municipality?: Municipality;
}

interface PurchaseCosts {
  welcomeTax: number;
  notaryFees: number;
  inspectionFees: number;
  initialRenovations: number;
  totalCashNeeded: number;
}

// ---- Taxe de bienvenue / droits de mutation (FISC-WELCOME-UNIFY, source unique moteur + UI) ----
// Deux barèmes cumulatifs (cf docs/FISCAL_REFERENCE.md §8) :
//  - Montréal : surtaxe municipale, 8 tranches jusqu'à 4 % (source : Ville de Montréal, droits de
//    mutation 2026).
//  - Reste du QC : barème provincial de BASE, 3 tranches (Loi concernant les droits sur les mutations
//    immobilières, RLRQ c. D-15.1). Seuils 2026 (62 900 / 315 000, indexation 2,3438 %) — source :
//    Gazette officielle du Québec 2025-06-07 nº 23 (avis ministre Affaires municipales) ; cf FISCAL_REFERENCE §8.
//    ⚠️ Limite assumée : une municipalité peut ajouter des sur-tranches > 500 000 $ (max 3 %, Montréal au-delà) —
//    non modélisable sur le binaire montreal/reste_qc (base fiable ≤ 500 000 $, ville par ville au-delà).
const WELCOME_TAX_MONTREAL: ReadonlyArray<{ upTo: number; rate: number }> = [
  { upTo: 53700, rate: 0.005 },
  { upTo: 269300, rate: 0.010 },
  { upTo: 538500, rate: 0.015 },
  { upTo: 1077000, rate: 0.020 },
  { upTo: 2154000, rate: 0.025 },
  { upTo: 3231000, rate: 0.030 },
  { upTo: 5385000, rate: 0.035 },
  { upTo: Infinity, rate: 0.040 },
];

const WELCOME_TAX_QUEBEC: ReadonlyArray<{ upTo: number; rate: number }> = [
  { upTo: 62900, rate: 0.005 },
  { upTo: 315000, rate: 0.010 },
  { upTo: Infinity, rate: 0.015 },
];

/**
 * Taxe de bienvenue (droits de mutation) selon la municipalité du bien.
 * `municipality` non défini ⇒ repli CONSERVATEUR sur Montréal (barème le plus élevé) : état
 * transitoire (l'UI force le choix), PAS un défaut stocké. Consommée par le moteur ET l'UI.
 */
export const calculateWelcomeTax = (price: number, municipality?: Municipality): number => {
  if (price <= 0) return 0;
  const brackets = municipality === 'reste_qc' ? WELCOME_TAX_QUEBEC : WELCOME_TAX_MONTREAL;
  let tax = 0;
  let previousLimit = 0;
  for (const bracket of brackets) {
    if (price <= previousLimit) break;
    const taxableInBracket = Math.min(price, bracket.upTo) - previousLimit;
    tax += taxableInBracket * bracket.rate;
    previousLimit = bracket.upTo;
  }
  return tax;
};

/**
 * Calcule le paiement hypothecaire mensuel par la formule standard
 * d'amortissement constant : P = (r * L * (1+r)^n) / ((1+r)^n - 1)
 * Si le taux est 0, on retombe sur une division lineaire.
 */
export const calculateMortgagePayment = ({
  price, downPayment, rate, amortization,
}: MortgageInput): MortgagePayment => {
  const totalMortgage = Math.max(0, price - downPayment);
  const monthlyRate = rate / 100 / 12;
  const n = amortization * 12;
  const monthlyMortgage = monthlyRate > 0
    ? (monthlyRate * totalMortgage * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1)
    : (n > 0 ? totalMortgage / n : 0);
  return {
    totalMortgage,
    monthlyMortgage,
    monthlyInterest: totalMortgage * monthlyRate,
  };
};

/**
 * Schema d'amortissement annuel avec :
 *  - renouvellement automatique du taux tous les 5 ans (renewalRate)
 *  - appreciation annuelle de la propriete (propertyGrowthRate)
 *  - plafond optionnel de valeur (maxValue > 0)
 *  - renovations annuelles cumulees pour reference
 */
export const runAmortization = (input: AmortizationInput): AmortizationResult => {
  const {
    price, downPayment, rate, amortization,
    renewalRate = rate,
    propertyGrowthRate = 3,
    initialRenovations = 0,
    yearlyRenovations = 0,
    maxValue = 0,
    startYear = new Date().getFullYear(),
  } = input;

  // [IMMO-3-FORMULES] La prime SCHL est FINANCÉE : elle s'ajoute au principal emprunté, elle
  // n'ajoute AUCUNE valeur au bien. `pastPurchaseInit` le faisait déjà (`principal += premium`),
  // pas cette fonction — d'où deux courbes d'équité concurrentes sur le MÊME écran, l'historique
  // surestimant l'équité parce qu'il amortissait une dette trop petite.
  // ⚠️ `propertyValue` reste ancré sur `price` (+ rénovations) plus bas : gonfler le prix pour
  // financer la prime ferait monter la valeur du bien du même montant et INVERSERAIT le signe de
  // l'écart — mesuré en écrivant ce lot.
  // ⚠️ `calculateSchlPremium` rend `required: false` au-delà de 20 % de mise de fonds : le cas
  // conventionnel reste bit-identique, aucune prime n'est inventée.
  const schl = calculateSchlPremium({ price, downPayment });
  const { monthlyMortgage: paymentSansPrime, totalMortgage: mortgageSansPrime } = calculateMortgagePayment({
    price, downPayment, rate, amortization,
  });
  const totalMortgage = mortgageSansPrime + (schl.required ? schl.premium : 0);
  const initialPayment = totalMortgage === mortgageSansPrime
    ? paymentSansPrime
    : calculateMortgagePayment({ price: totalMortgage, downPayment: 0, rate, amortization }).monthlyMortgage;

  const data: AmortizationYearPoint[] = [];
  let balance = totalMortgage;
  let totalInterestPaid = 0;
  let totalPrincipalPaid = 0;
  let currentMonthlyPayment = initialPayment;
  let currentRate = rate / 100 / 12;
  let propertyValue = price + initialRenovations;

  for (let year = 1; year <= amortization; year++) {
    let yearInterest = 0;
    let yearPrincipal = 0;

    // Renouvellement tous les 5 ans (debut annee 6, 11, 16, ...)
    if (year > 1 && (year - 1) % 5 === 0) {
      currentRate = renewalRate / 100 / 12;
      const remainingMonths = (amortization - year + 1) * 12;
      if (currentRate > 0) {
        currentMonthlyPayment = (currentRate * balance * Math.pow(1 + currentRate, remainingMonths))
          / (Math.pow(1 + currentRate, remainingMonths) - 1);
      }
    }

    for (let m = 0; m < 12; m++) {
      if (balance <= 0) break;
      const interest = balance * currentRate;
      const principal = currentMonthlyPayment - interest;
      balance -= principal;
      yearInterest += interest;
      yearPrincipal += principal;
    }
    totalInterestPaid += yearInterest;
    totalPrincipalPaid += yearPrincipal;

    const rawValue = propertyValue * (1 + (propertyGrowthRate / 100));
    propertyValue = (maxValue > 0 && rawValue > maxValue) ? maxValue : rawValue;

    data.push({
      year,
      calendarYear: startYear + year,
      age: year,
      Solde: Math.max(0, Math.round(balance)),
      ValeurPropriete: Math.round(propertyValue),
      // [IMMO-CLAMP-EQUITE-NEGATIVE] L'équité peut être NÉGATIVE (décision de Marc, 2026-09-03) :
      // un bien qui vaut moins que son hypothèque (« underwater » — marché en baisse, mise de fonds
      // minimale + prime SCHL financée) est un DÉFICIT, pas un zéro. Le `Math.max(0, …)` externe qui
      // vivait ici affichait « ni dette ni valeur » et retirait le déficit du patrimoine passé,
      // exactement au moment où l'information compte le plus (`no-fake-data` : un zéro crédible est
      // pire qu'un chiffre juste qui dérange). Tous les consommateurs recensés sont ADDITIFS
      // (buildPastPrefix, dailyPastLedger, FutureHistorySection) : une valeur négative y est bien
      // formée. ⚠️ Le clamp INTERNE sur le solde reste : un solde négatif est un artefact de
      // sur-remboursement du dernier mois (le PMT dépasse le restant dû), pas une créance.
      Equite: Math.round(propertyValue - Math.max(0, balance)),
      InteretsCumul: Math.round(totalInterestPaid),
      PrincipalCumul: Math.round(totalPrincipalPaid),
      PartInteretAnnuelle: Math.round(yearInterest),
      PartPrincipalAnnuelle: Math.round(yearPrincipal),
      TauxEnVigueur: (currentRate * 12 * 100).toFixed(1) + '%',
      RenosCumul: Math.round(yearlyRenovations * year),
    });
  }

  return { data, totalInterest: totalInterestPaid, finalValue: propertyValue };
};

// ============================================
// OSFI B-20 — Stress test hypothécaire (audit §6.6)
// Source: Bureau du surintendant des institutions financières (OSFI), guideline B-20.
//  - MQR floor 5.25% + buffer +2 points = qualifying rate
//  - GDS max 39% (Gross Debt Service ratio)
//  - TDS max 44% (Total Debt Service ratio)
// https://www.osfi-bsif.gc.ca/en/supervision/financial-institutions/banks/minimum-qualifying-rate-uninsured-mortgages
// ============================================

export const OSFI_MQR_FLOOR = 0.0525;        // 5.25% — plancher du qualifying rate
export const OSFI_MQR_BUFFER = 0.02;          // +2 points au-dessus du taux contractuel
export const OSFI_GDS_MAX = 0.39;             // Gross Debt Service max — 39% du revenu brut mensuel
export const OSFI_TDS_MAX = 0.44;             // Total Debt Service max — 44%

interface B20StressTestInput {
  /** Taux contractuel de l'hypothèque (% annuel, ex: 4.5 pour 4.5%) */
  contractRate: number;
  /** Montant emprunté (prix - mise de fonds) */
  loanAmount: number;
  /** Période d'amortissement (années) */
  amortization: number;
  /** Charges logement mensuelles HORS hypothèque (taxes/12 + chauffage + 50% condo) */
  monthlyHousingChargesExclMortgage: number;
  /** Revenu brut mensuel familial (toutes sources) */
  monthlyGrossIncome: number;
  /** Paiements mensuels d'autres dettes (cartes, auto, prêt étudiant) */
  otherDebtMonthly?: number;
}

interface B20StressTestResult {
  /** Taux de qualification en DÉCIMAL (ex: 0.065 = 6.5%). Différent de B20StressTestInput.contractRate qui est en pourcentage. */
  qualifyingRate: number;
  qualifyingMonthlyPmt: number; // PMT mensuel calculé au qualifying rate
  totalHousingPmt: number;      // qualifying PMT + housing charges
  gds: number;                  // ratio GDS (0-1)
  tds: number;                  // ratio TDS (0-1)
  passes: boolean;              // true si GDS ≤ 39% ET TDS ≤ 44%
  failReason?: string;          // raison si fail
}

/**
 * Calcule le qualifying rate selon OSFI B-20 :
 *   `qualifyingRate = max(contractRate + 2 pts, 5.25%)`
 *
 * @param contractRate Taux contractuel en % annuel (ex: 4.5 pour 4.5%).
 * @returns Qualifying rate en décimal (ex: 0.065).
 */
export const calculateB20QualifyingRate = (contractRate: number): number => {
  if (!Number.isFinite(contractRate) || contractRate <= 0) return OSFI_MQR_FLOOR;
  const contractDecimal = contractRate / 100;
  return Math.max(contractDecimal + OSFI_MQR_BUFFER, OSFI_MQR_FLOOR);
};

/**
 * Effectue le stress test hypothécaire OSFI B-20.
 *
 * Vérifie que l'emprunteur peut servir le prêt au qualifying rate, en
 * respectant les ratios GDS (max 39%) et TDS (max 44%).
 *
 * @returns { qualifyingRate, qualifyingMonthlyPmt, gds, tds, passes, failReason }
 */
export const calculateB20StressTest = (input: B20StressTestInput): B20StressTestResult => {
  const {
    contractRate,
    loanAmount,
    amortization,
    monthlyHousingChargesExclMortgage,
    monthlyGrossIncome,
    otherDebtMonthly = 0,
  } = input;

  const qualifyingRate = calculateB20QualifyingRate(contractRate);
  const monthlyQualifyingRate = qualifyingRate / 12;
  const n = amortization * 12;

  let qualifyingMonthlyPmt = 0;
  if (loanAmount > 0 && n > 0) {
    qualifyingMonthlyPmt = monthlyQualifyingRate > 0
      ? (monthlyQualifyingRate * loanAmount * Math.pow(1 + monthlyQualifyingRate, n))
        / (Math.pow(1 + monthlyQualifyingRate, n) - 1)
      : loanAmount / n;
  }

  const totalHousingPmt = qualifyingMonthlyPmt + Math.max(0, monthlyHousingChargesExclMortgage);
  const safeIncome = Math.max(1, monthlyGrossIncome); // évite division par 0

  const gds = totalHousingPmt / safeIncome;
  const tds = (totalHousingPmt + Math.max(0, otherDebtMonthly)) / safeIncome;

  const gdsFail = gds > OSFI_GDS_MAX;
  const tdsFail = tds > OSFI_TDS_MAX;
  const passes = !gdsFail && !tdsFail;

  let failReason: string | undefined;
  if (!passes) {
    const reasons: string[] = [];
    if (gdsFail) reasons.push(`GDS ${(gds * 100).toFixed(1)}% > 39%`);
    if (tdsFail) reasons.push(`TDS ${(tds * 100).toFixed(1)}% > 44%`);
    failReason = reasons.join(' + ');
  }

  return {
    qualifyingRate,
    qualifyingMonthlyPmt,
    totalHousingPmt,
    gds,
    tds,
    passes,
    failReason,
  };
};

// ============================================
// SCHL — Validation mise de fonds + amortissement (audit §6.8)
// Source: Société canadienne d'hypothèques et de logement (SCHL).
//  - Mise de fonds min: 5% (≤500k$), 5%+10% (500k-1.5M$), 20% (>1.5M$)
//  - Amortissement max assuré: 25 ans (30 ans pour 1er acheteur ou résidence
//    neuve depuis août 2024)
//  - Amortissement max conventionnel (>20% MDP): 30 ans
// https://www.schl-cmhc.gc.ca/buying/mortgage-loan-insurance
// ============================================

export const SCHL_PRICE_THRESHOLD_TIER1 = 500000;       // 5% sous ce seuil
export const SCHL_PRICE_THRESHOLD_TIER2 = 1500000;      // 5%+10% jusqu'à ce seuil; 20%+ au-delà
export const SCHL_MIN_DOWN_TIER1 = 0.05;
const SCHL_MIN_DOWN_TIER2 = 0.10;
export const SCHL_MIN_DOWN_TIER3 = 0.20;
export const SCHL_AMORT_MAX_INSURED_STANDARD = 25;       // ans
export const SCHL_AMORT_MAX_INSURED_FTB_OR_NEW = 30;     // 1er acheteur OU résidence neuve (depuis août 2024)
export const SCHL_AMORT_MAX_CONVENTIONAL = 30;           // ≥ 20% MDP

/**
 * Calcule la mise de fonds MINIMUM requise pour un prix d'achat donné (SCHL).
 *
 * Paliers 2026 :
 *  - prix ≤ 500 000$ : 5% du prix
 *  - 500 000 < prix < 1 500 000 : 5% sur premier 500k$ + 10% au-delà
 *  - prix ≥ 1 500 000 : 20% (assurance SCHL non disponible)
 *
 * [SCHL-1500K-BOUNDARY] (lot 190) La borne haute est STRICTE : l'assurance SCHL vise un prix
 * d'achat « inférieur à 1 500 000 $ » (FISCAL_REFERENCE, « ≥ 1 500 000 $ → 20 % »). Le code écrivait
 * `<=` — au prix EXACT de 1,5 M$, la mise de fonds minimale valait 125 000 $ (8,33 %) au lieu de
 * 300 000 $ (20 %), et `validateMortgageParameters` déclarait le prêt ASSURABLE. Quatre sites
 * alignés (ici, `insured`, la branche d'erreur « prix > 1,5 M$ » et `aboveMaxPrice`) : une borne
 * écrite à quatre endroits ne peut être juste que si elle a le même sens partout.
 */
export const calculateMinDownPayment = (price: number): number => {
  if (!Number.isFinite(price) || price <= 0) return 0;
  if (price <= SCHL_PRICE_THRESHOLD_TIER1) {
    return price * SCHL_MIN_DOWN_TIER1;
  }
  if (price < SCHL_PRICE_THRESHOLD_TIER2) {
    return SCHL_PRICE_THRESHOLD_TIER1 * SCHL_MIN_DOWN_TIER1
      + (price - SCHL_PRICE_THRESHOLD_TIER1) * SCHL_MIN_DOWN_TIER2;
  }
  return price * SCHL_MIN_DOWN_TIER3;
};

interface MortgageValidationInput {
  price: number;
  downPayment: number;
  amortization: number;
  /** Premier acheteur : permet amortissement 30 ans même en assuré (depuis août 2024). */
  isFirstTimeBuyer?: boolean;
  /** Résidence neuve (construction récente) : idem ci-dessus. */
  isNewConstruction?: boolean;
}

interface MortgageValidationResult {
  valid: boolean;
  errors: string[];
  /** Ratio mise de fonds / prix (0-1). */
  downPaymentRatio: number;
  /** Mise de fonds minimum requise par SCHL. */
  minDownPayment: number;
  /** Amortissement maximum autorisé selon le profil. */
  maxAmortizationAllowed: number;
  /** True si la mise de fonds est < 20% → prêt assuré (assurance SCHL obligatoire). */
  insured: boolean;
}

/**
 * Valide les paramètres d'un prêt hypothécaire selon les règles SCHL :
 *  - Mise de fonds ≥ minimum requis selon le prix
 *  - Amortissement ≤ maximum autorisé selon le statut (assuré/conventionnel,
 *    premier acheteur, résidence neuve)
 *  - Si prix > 1.5M$, la mise de fonds DOIT être ≥ 20% (assurance non disponible).
 *
 * Retourne `{valid, errors[]}` avec messages détaillés pour debug.
 */
export const validateMortgageParameters = (input: MortgageValidationInput): MortgageValidationResult => {
  const { price, downPayment, amortization, isFirstTimeBuyer = false, isNewConstruction = false } = input;
  const errors: string[] = [];

  const safePrice = Math.max(0, Number.isFinite(price) ? price : 0);
  const safeDown = Math.max(0, Number.isFinite(downPayment) ? downPayment : 0);
  const safeAmort = Math.max(0, Number.isFinite(amortization) ? amortization : 0);

  const downPaymentRatio = safePrice > 0 ? safeDown / safePrice : 0;
  // Guard epsilon flottant : 20% exact (price × 0.20) peut donner 19.9999...
  // à cause de l'arithmétique flottante. On considère ≥ 20% si on est à
  // 1e-9 près du seuil.
  const insured = downPaymentRatio < (SCHL_MIN_DOWN_TIER3 - 1e-9)
    && safePrice < SCHL_PRICE_THRESHOLD_TIER2; // [SCHL-1500K-BOUNDARY] borne STRICTE
  const minDownPayment = calculateMinDownPayment(safePrice);

  if (safePrice <= 0) {
    errors.push('Prix d\'achat invalide ou nul.');
  } else if (safePrice >= SCHL_PRICE_THRESHOLD_TIER2 && downPaymentRatio < SCHL_MIN_DOWN_TIER3) {
    // Cas prix ≥ 1.5M$ ([SCHL-1500K-BOUNDARY] : borne STRICTE, 1,5 M$ exact n'est plus assurable) :
    // un seul message ciblé (pas de doublon avec
    // "mise de fonds insuffisante" qui serait redondant).
    errors.push(
      `Prix > 1,5M$ : assurance SCHL non disponible. Mise de fonds doit être ≥ 20% ` +
      `(actuellement ${(downPaymentRatio * 100).toFixed(1)}%, soit ${formatCAD(Math.round(safeDown))})`,
    );
  } else if (safeDown < minDownPayment) {
    errors.push(
      `Mise de fonds insuffisante : ${formatCAD(Math.round(safeDown))} ` +
      `< minimum SCHL ${formatCAD(Math.round(minDownPayment))} ` +
      `(${(downPaymentRatio * 100).toFixed(1)}% du prix)`,
    );
  }

  let maxAmortizationAllowed: number;
  if (insured) {
    maxAmortizationAllowed = (isFirstTimeBuyer || isNewConstruction)
      ? SCHL_AMORT_MAX_INSURED_FTB_OR_NEW
      : SCHL_AMORT_MAX_INSURED_STANDARD;
  } else {
    maxAmortizationAllowed = SCHL_AMORT_MAX_CONVENTIONAL;
  }

  if (safeAmort > maxAmortizationAllowed) {
    const reason = insured
      ? `assuré ${(isFirstTimeBuyer || isNewConstruction) ? '(1er acheteur/neuf, max 30 ans)' : '(max 25 ans)'}`
      : 'conventionnel (max 30 ans)';
    errors.push(`Amortissement ${safeAmort} ans > maximum ${maxAmortizationAllowed} ans en ${reason}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    downPaymentRatio,
    minDownPayment,
    maxAmortizationAllowed,
    insured,
  };
};

// ============================================
// SCHL — Prime d'assurance hypothécaire (audit §6.5)
// Source: Société canadienne d'hypothèques et de logement.
// Applicable si MDP < 20% (prêt assuré). La prime est ajoutée au principal du prêt.
//
// Barème 2026 par tranche LTV (Loan-to-Value = loan / price) :
//  - LTV ≤ 65%        : 0.60%
//  - 65% < LTV ≤ 75%  : 1.70%
//  - 75% < LTV ≤ 80%  : 2.40%
//  - 80% < LTV ≤ 85%  : 2.80%
//  - 85% < LTV ≤ 90%  : 3.10%
//  - 90% < LTV ≤ 95%  : 4.00%
//  - LTV > 95% ou prix > 1.5M$ : non disponible
//
// https://www.schl-cmhc.gc.ca/buying/mortgage-loan-insurance
// ============================================

interface SchlPremiumTier {
  maxLtv: number;     // 0-1 (ex: 0.65 pour LTV ≤ 65%)
  rate: number;       // 0-1 (ex: 0.006 pour 0.60%)
}

export const SCHL_PREMIUM_TIERS: readonly SchlPremiumTier[] = [
  { maxLtv: 0.65, rate: 0.0060 },
  { maxLtv: 0.75, rate: 0.0170 },
  { maxLtv: 0.80, rate: 0.0240 },
  { maxLtv: 0.85, rate: 0.0280 },
  { maxLtv: 0.90, rate: 0.0310 },
  { maxLtv: 0.95, rate: 0.0400 },
];

/**
 * Calcule le taux de prime SCHL applicable selon le ratio LTV (Loan-to-Value).
 *
 * @param ltv Ratio loan / price (0-1)
 * @returns Taux de prime (0-1), ou 0 si LTV > 95% (assurance non disponible)
 */
export const calculateSchlPremiumRate = (ltv: number): number => {
  if (!Number.isFinite(ltv) || ltv <= 0) return 0;
  for (const tier of SCHL_PREMIUM_TIERS) {
    if (ltv <= tier.maxLtv) return tier.rate;
  }
  return 0;  // LTV > 95% : assurance non disponible
};

interface SchlPremiumInput {
  price: number;
  downPayment: number;
  /** Premier acheteur : peut majorer ou exempter selon programme (non implémenté ici). */
  isFirstTimeBuyer?: boolean;
}

interface SchlPremiumResult {
  ltv: number;
  rate: number;
  /** Prime à ajouter au principal du prêt (price - downPayment + premium). */
  premium: number;
  /** True si le prêt nécessite une assurance SCHL (LTV > 80% et price < 1.5M$ — borne STRICTE, [SCHL-1500K-BOUNDARY]). */
  required: boolean;
  /** True si l'assurance est DISPONIBLE (LTV ≤ 95% et price < 1.5M$ — borne STRICTE, [SCHL-1500K-BOUNDARY]). */
  available: boolean;
}

/**
 * Calcule la prime SCHL d'assurance hypothécaire pour un achat donné.
 *
 * Prime due si MDP < 20% (LTV > 80%). Pour MDP ≥ 20%, prêt conventionnel
 * (prime = 0). Pour prix > 1.5M$ ou LTV > 95%, assurance non disponible.
 *
 * @returns { ltv, rate, premium, required, available }
 */
export const calculateSchlPremium = (input: SchlPremiumInput): SchlPremiumResult => {
  const safePrice = Math.max(0, Number.isFinite(input.price) ? input.price : 0);
  const safeDown = Math.max(0, Number.isFinite(input.downPayment) ? input.downPayment : 0);
  const baseLoan = Math.max(0, safePrice - safeDown);
  const ltv = safePrice > 0 ? baseLoan / safePrice : 0;

  const aboveMaxLtv = ltv > 0.95;
  const aboveMaxPrice = safePrice >= SCHL_PRICE_THRESHOLD_TIER2; // [SCHL-1500K-BOUNDARY] borne STRICTE
  const available = !aboveMaxLtv && !aboveMaxPrice && safePrice > 0;
  const required = ltv > 0.80 && available;

  if (!required) {
    return { ltv, rate: 0, premium: 0, required: false, available };
  }

  const rate = calculateSchlPremiumRate(ltv);
  const premium = baseLoan * rate;
  return { ltv, rate, premium, required: true, available };
};

// ============================================
// TPS/TVQ résidence neuve — remboursements (audit §6.7)
// Sources:
//  - ARC TPS neuf : https://www.canada.ca/fr/agence-revenu/services/formulaires-publications/publications/rc4028.html
//  - Revenu Québec TVQ neuf : https://www.revenuquebec.ca/fr/citoyens/situations-particulieres/votre-residence/achat-construction-renovation-residence/remboursement-de-la-tvq-pour-achat-ou-construction-residence-neuve/
//
// TPS (fédéral) : taux 5%
//  - Prix ≤ 350 000$ : remboursement 36% de la TPS payée (max 6 300$)
//  - 350 000 - 450 000$ : décroît linéairement à 0
//  - > 450 000$ : 0% remboursement
//
// TVQ (provincial QC) : taux 9.975%
//  - Prix ≤ 200 000$ : remboursement 50% de la TVQ payée (max 9 975$)
//  - 200 000 - 300 000$ (?) : barème spécifique
//  - À noter : le rebate TVQ a été modifié plusieurs fois ; cette implémentation
//    suit le barème 2026 standard.
// ============================================

const GST_RATE = 0.05;
const QST_RATE = 0.09975;

export const GST_REBATE_PRICE_FULL = 350000;    // jusqu'à ce prix : rebate plein
const GST_REBATE_PRICE_ZERO = 450000;    // au-delà : zéro rebate
const GST_REBATE_RATE_FULL = 0.36;       // 36% de la TPS payée
export const GST_REBATE_MAX = GST_REBATE_PRICE_FULL * GST_RATE * GST_REBATE_RATE_FULL;  // 6 300$

export const QST_REBATE_PRICE_FULL = 200000;
const QST_REBATE_PRICE_ZERO = 300000;
const QST_REBATE_RATE_FULL = 0.50;       // 50% de la TVQ payée
export const QST_REBATE_MAX = QST_REBATE_PRICE_FULL * QST_RATE * QST_REBATE_RATE_FULL;  // ~9 975$

/**
 * Calcule le remboursement TPS pour l'achat d'une résidence neuve.
 *
 * Source: ARC RC4028. Le remboursement est de 36% de la TPS payée pour les
 * résidences ≤ 350 000$, décroissant linéairement à 0 pour 450 000$+.
 *
 * @param price Prix d'achat avant taxes
 * @returns Montant du remboursement TPS (0 à ~6 300$)
 */
export const calculateGstNewHomeRebate = (price: number): number => {
  if (!Number.isFinite(price) || price <= 0) return 0;
  if (price <= GST_REBATE_PRICE_FULL) {
    return price * GST_RATE * GST_REBATE_RATE_FULL;
  }
  if (price >= GST_REBATE_PRICE_ZERO) {
    return 0;
  }
  // Phase de transition linéaire entre 350k et 450k
  // Formule ARC : rebate × ((450 000 - prix) / 100 000)
  const transitionRatio = (GST_REBATE_PRICE_ZERO - price) / (GST_REBATE_PRICE_ZERO - GST_REBATE_PRICE_FULL);
  return GST_REBATE_MAX * transitionRatio;
};

/**
 * Calcule le remboursement TVQ pour l'achat d'une résidence neuve au Québec.
 *
 * Source: Revenu Québec. Remboursement 50% de la TVQ pour résidences ≤ 200 000$,
 * décroissant linéairement à 0 pour 300 000$+.
 *
 * @param price Prix d'achat avant taxes
 * @returns Montant du remboursement TVQ (0 à ~9 975$)
 */
export const calculateQstNewHomeRebate = (price: number): number => {
  if (!Number.isFinite(price) || price <= 0) return 0;
  if (price <= QST_REBATE_PRICE_FULL) {
    return price * QST_RATE * QST_REBATE_RATE_FULL;
  }
  if (price >= QST_REBATE_PRICE_ZERO) {
    return 0;
  }
  const transitionRatio = (QST_REBATE_PRICE_ZERO - price) / (QST_REBATE_PRICE_ZERO - QST_REBATE_PRICE_FULL);
  return QST_REBATE_MAX * transitionRatio;
};

/**
 * Calcule le remboursement TOTAL (TPS + TVQ) pour une résidence neuve.
 * Si l'achat n'est PAS une résidence neuve, retourne 0.
 *
 * Note : ce remboursement vient en RÉDUCTION du coût total à l'achat
 * (l'acheteur paie taxes pleines puis se fait rembourser après).
 */
export const calculateNewHomeRebateTotal = (price: number, isNewConstruction: boolean): number => {
  if (!isNewConstruction) return 0;
  return calculateGstNewHomeRebate(price) + calculateQstNewHomeRebate(price);
};

/**
 * Couts d'achat totaux pour un achat immobilier au Quebec :
 * mise de fonds + taxe de bienvenue + notaire + inspection + renovations initiales.
 */
export const calculatePurchaseCosts = ({
  price, downPayment,
  initialRenovations = 0,
  notaryFees = 1500,
  inspectionFees = 800,
  municipality,
}: PurchaseCostsInput): PurchaseCosts => {
  const welcomeTax = calculateWelcomeTax(price, municipality);
  const totalCashNeeded = downPayment + welcomeTax + notaryFees + inspectionFees + initialRenovations;
  return { welcomeTax, notaryFees, inspectionFees, initialRenovations, totalCashNeeded };
};

