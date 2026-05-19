// Logique pure immobiliere canadienne (Quebec).
// Aucune dependance React. Reutilisable par le MCP server et les tests.

export interface MortgageInput {
  price: number;
  downPayment: number;
  rate: number;          // % annuel
  amortization: number;  // annees
}

export interface MortgagePayment {
  monthlyMortgage: number;
  monthlyInterest: number; // interet du premier mois
  totalMortgage: number;
}

export interface AmortizationInput extends MortgageInput {
  renewalRate?: number;       // % annuel, applique tous les 5 ans
  propertyGrowthRate?: number; // % par an
  initialRenovations?: number;
  yearlyRenovations?: number;
  maxValue?: number;           // plafond valeur projetee (0 = aucun)
  startYear?: number;          // annee de depart pour calendarYear
}

export interface AmortizationYearPoint {
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

export interface AmortizationResult {
  data: AmortizationYearPoint[];
  totalInterest: number;
  finalValue: number;
}

export interface PurchaseCostsInput {
  price: number;
  downPayment: number;
  initialRenovations?: number;
  notaryFees?: number;
  inspectionFees?: number;
}

export interface PurchaseCosts {
  welcomeTax: number;
  notaryFees: number;
  inspectionFees: number;
  initialRenovations: number;
  totalCashNeeded: number;
}

export interface BuyVsRentInput {
  amortizationData: AmortizationYearPoint[];
  totalCashNeeded: number;
  netMonthlyCost: number;       // hypotheque + taxes + chauffage - revenu locatif
  maintenanceMonthly: number;
  currentRent: number;          // loyer mensuel au depart
  marketReturn: number;         // % par an (TSX, etc.)
  amortization: number;
  rentIndexation?: number;      // hausse annuelle du loyer (defaut 3%)
}

export interface BuyVsRentYear {
  year: number;
  buyEquity: number;
  rentInvestNetWorth: number;
}

/**
 * Taxe de bienvenue (droits de mutation) au Quebec.
 * Paliers 2025 :
 *  - 0%-58 900$ : 0.5%
 *  - 58 900$-290 000$ : 1.0%
 *  - 290 000$-552 300$ : 1.5%
 *  - > 552 300$ : 2.0%
 */
export const calculateWelcomeTax = (price: number): number => {
  if (price <= 0) return 0;
  let tax = 0;
  let v = price;
  if (v > 552300) { tax += (v - 552300) * 0.02; v = 552300; }
  if (v > 290000) { tax += (v - 290000) * 0.015; v = 290000; }
  if (v > 58900)  { tax += (v - 58900) * 0.01; v = 58900; }
  tax += v * 0.005;
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

  const { monthlyMortgage: initialPayment, totalMortgage } = calculateMortgagePayment({
    price, downPayment, rate, amortization,
  });

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
      Equite: Math.max(0, Math.round(propertyValue - Math.max(0, balance))),
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

export interface B20StressTestInput {
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

export interface B20StressTestResult {
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
export const SCHL_MIN_DOWN_TIER2 = 0.10;
export const SCHL_MIN_DOWN_TIER3 = 0.20;
export const SCHL_AMORT_MAX_INSURED_STANDARD = 25;       // ans
export const SCHL_AMORT_MAX_INSURED_FTB_OR_NEW = 30;     // 1er acheteur OU résidence neuve (depuis août 2024)
export const SCHL_AMORT_MAX_CONVENTIONAL = 30;           // ≥ 20% MDP

/**
 * Calcule la mise de fonds MINIMUM requise pour un prix d'achat donné (SCHL).
 *
 * Paliers 2026 :
 *  - prix ≤ 500 000$ : 5% du prix
 *  - 500 000 < prix ≤ 1 500 000 : 5% sur premier 500k$ + 10% au-delà
 *  - prix > 1 500 000 : 20% (assurance SCHL non disponible)
 */
export const calculateMinDownPayment = (price: number): number => {
  if (!Number.isFinite(price) || price <= 0) return 0;
  if (price <= SCHL_PRICE_THRESHOLD_TIER1) {
    return price * SCHL_MIN_DOWN_TIER1;
  }
  if (price <= SCHL_PRICE_THRESHOLD_TIER2) {
    return SCHL_PRICE_THRESHOLD_TIER1 * SCHL_MIN_DOWN_TIER1
      + (price - SCHL_PRICE_THRESHOLD_TIER1) * SCHL_MIN_DOWN_TIER2;
  }
  return price * SCHL_MIN_DOWN_TIER3;
};

export interface MortgageValidationInput {
  price: number;
  downPayment: number;
  amortization: number;
  /** Premier acheteur : permet amortissement 30 ans même en assuré (depuis août 2024). */
  isFirstTimeBuyer?: boolean;
  /** Résidence neuve (construction récente) : idem ci-dessus. */
  isNewConstruction?: boolean;
}

export interface MortgageValidationResult {
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
    && safePrice <= SCHL_PRICE_THRESHOLD_TIER2;
  const minDownPayment = calculateMinDownPayment(safePrice);

  if (safePrice <= 0) {
    errors.push('Prix d\'achat invalide ou nul.');
  } else if (safePrice > SCHL_PRICE_THRESHOLD_TIER2 && downPaymentRatio < SCHL_MIN_DOWN_TIER3) {
    // Cas prix > 1.5M$ : un seul message ciblé (pas de doublon avec
    // "mise de fonds insuffisante" qui serait redondant).
    errors.push(
      `Prix > 1,5M$ : assurance SCHL non disponible. Mise de fonds doit être ≥ 20% ` +
      `(actuellement ${(downPaymentRatio * 100).toFixed(1)}%, soit ${Math.round(safeDown).toLocaleString('fr-CA')}$)`,
    );
  } else if (safeDown < minDownPayment) {
    errors.push(
      `Mise de fonds insuffisante : ${Math.round(safeDown).toLocaleString('fr-CA')}$ ` +
      `< minimum SCHL ${Math.round(minDownPayment).toLocaleString('fr-CA')}$ ` +
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

/**
 * Couts d'achat totaux pour un achat immobilier au Quebec :
 * mise de fonds + taxe de bienvenue + notaire + inspection + renovations initiales.
 */
export const calculatePurchaseCosts = ({
  price, downPayment,
  initialRenovations = 0,
  notaryFees = 1500,
  inspectionFees = 800,
}: PurchaseCostsInput): PurchaseCosts => {
  const welcomeTax = calculateWelcomeTax(price);
  const totalCashNeeded = downPayment + welcomeTax + notaryFees + inspectionFees + initialRenovations;
  return { welcomeTax, notaryFees, inspectionFees, initialRenovations, totalCashNeeded };
};

/**
 * Comparaison Acheter vs Louer+Investir sur la duree d'amortissement.
 * - Cote Acheter : equite issue du schema d'amortissement (transmise via amortizationData).
 * - Cote Louer : la mise de fonds + frais sont investis a marketReturn ;
 *   la difference annuelle (cout d'achat - cout location) est aussi investie si positive ;
 *   le loyer croit de rentIndexation % par an (defaut 3%).
 */
export const runBuyVsRent = ({
  amortizationData, totalCashNeeded,
  netMonthlyCost, maintenanceMonthly, currentRent, marketReturn, amortization,
  rentIndexation = 3,
}: BuyVsRentInput): BuyVsRentYear[] => {
  const data: BuyVsRentYear[] = [];
  let rentScenarioNetWorth = totalCashNeeded;
  let currentRentCost = currentRent;
  const indexFactor = 1 + (rentIndexation / 100);

  for (let year = 1; year <= amortization; year++) {
    const rentAnnualCost = currentRentCost * 12;
    const buyAnnualCost = netMonthlyCost * 12 + maintenanceMonthly * 12;
    const differenceToInvest = (buyAnnualCost - rentAnnualCost);
    rentScenarioNetWorth *= (1 + marketReturn / 100);
    if (differenceToInvest > 0) rentScenarioNetWorth += differenceToInvest;
    const buyEquity = amortizationData[year - 1]?.Equite || 0;
    currentRentCost *= indexFactor;
    data.push({
      year,
      buyEquity: Math.round(buyEquity),
      rentInvestNetWorth: Math.round(rentScenarioNetWorth),
    });
  }
  return data;
};
