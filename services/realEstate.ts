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
