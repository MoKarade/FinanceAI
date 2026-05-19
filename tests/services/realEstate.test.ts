import { describe, it, expect } from 'vitest';
import {
  calculateWelcomeTax,
  calculateMortgagePayment,
  calculatePurchaseCosts,
  runAmortization,
  runBuyVsRent,
  calculateB20QualifyingRate,
  calculateB20StressTest,
  calculateMinDownPayment,
  validateMortgageParameters,
  calculateSchlPremiumRate,
  calculateSchlPremium,
  calculateGstNewHomeRebate,
  calculateQstNewHomeRebate,
  calculateNewHomeRebateTotal,
  GST_REBATE_MAX,
  QST_REBATE_MAX,
  GST_REBATE_PRICE_FULL,
  GST_REBATE_PRICE_ZERO,
  QST_REBATE_PRICE_FULL,
  QST_REBATE_PRICE_ZERO,
  SCHL_PREMIUM_TIERS,
  OSFI_MQR_FLOOR,
  OSFI_MQR_BUFFER,
  OSFI_GDS_MAX,
  OSFI_TDS_MAX,
  SCHL_PRICE_THRESHOLD_TIER1,
  SCHL_PRICE_THRESHOLD_TIER2,
  SCHL_MIN_DOWN_TIER1,
  SCHL_MIN_DOWN_TIER2,
  SCHL_MIN_DOWN_TIER3,
  SCHL_AMORT_MAX_INSURED_STANDARD,
  SCHL_AMORT_MAX_INSURED_FTB_OR_NEW,
  SCHL_AMORT_MAX_CONVENTIONAL,
} from '../../services/realEstate';

describe('calculateWelcomeTax', () => {
  it('applique les paliers Quebec sur 500k$', () => {
    // 0.5% * 58900 + 1.0% * (290000 - 58900) + 1.5% * (500000 - 290000)
    // = 294.5 + 2311 + 3150 = 5755.5$
    expect(calculateWelcomeTax(500000)).toBeCloseTo(5755.5, 1);
  });

  it('applique le palier 2% au-dela de 552.3k$', () => {
    const tax = calculateWelcomeTax(700000);
    expect(tax).toBeGreaterThan(7000);
  });

  it('renvoie 0 pour un prix nul ou negatif', () => {
    expect(calculateWelcomeTax(0)).toBe(0);
    expect(calculateWelcomeTax(-1000)).toBe(0);
  });
});

describe('calculateMortgagePayment', () => {
  it('calcule la mensualite standard (400k pret a 4.5% sur 25 ans)', () => {
    const { monthlyMortgage } = calculateMortgagePayment({
      price: 500000, downPayment: 100000, rate: 4.5, amortization: 25,
    });
    // ~2218$/mois selon les calculateurs hypothecaires usuels
    expect(monthlyMortgage).toBeGreaterThan(2150);
    expect(monthlyMortgage).toBeLessThan(2300);
  });

  it('gere un taux 0 (division lineaire)', () => {
    const { monthlyMortgage } = calculateMortgagePayment({
      price: 240000, downPayment: 60000, rate: 0, amortization: 15,
    });
    // 180000 / (15 * 12) = 1000$/mois
    expect(monthlyMortgage).toBe(1000);
  });
});

describe('runAmortization', () => {
  it('rembourse le pret en entier a la fin', () => {
    const { data } = runAmortization({
      price: 500000, downPayment: 100000, rate: 4.5, amortization: 25,
    });
    expect(data).toHaveLength(25);
    // Solde final tres proche de 0 (erreur d'arrondi mensuelle acceptable)
    expect(data[24].Solde).toBeLessThanOrEqual(100);
  });

  it('augmente la valeur de la propriete avec le taux de croissance', () => {
    const { finalValue } = runAmortization({
      price: 500000, downPayment: 100000, rate: 4.5, amortization: 25, propertyGrowthRate: 3,
    });
    // 500k * 1.03^25 ~= 1.047M$
    expect(finalValue).toBeGreaterThan(1000000);
  });

  it('applique le plafond maxValue', () => {
    const { finalValue } = runAmortization({
      price: 500000, downPayment: 100000, rate: 4.5, amortization: 25,
      propertyGrowthRate: 5, maxValue: 700000,
    });
    expect(finalValue).toBeLessThanOrEqual(700000);
  });

  it('renouvelle le taux tous les 5 ans (annee 6 = renewalRate)', () => {
    const { data } = runAmortization({
      price: 500000, downPayment: 100000, rate: 3, amortization: 25, renewalRate: 6,
    });
    expect(data[5].TauxEnVigueur).toBe('6.0%');
  });
});

describe('calculatePurchaseCosts', () => {
  it('somme correctement les frais (notaire + inspection par defaut)', () => {
    const r = calculatePurchaseCosts({ price: 500000, downPayment: 100000 });
    // 100k DP + welcome(~5756) + 1500 notaire + 800 inspection + 0 renos
    expect(r.totalCashNeeded).toBeCloseTo(r.welcomeTax + 102300, 0);
    expect(r.notaryFees).toBe(1500);
    expect(r.inspectionFees).toBe(800);
  });
});

describe('runBuyVsRent', () => {
  it('produit des series de longueur amortization', () => {
    const amort = runAmortization({
      price: 500000, downPayment: 100000, rate: 4.5, amortization: 25,
    });
    const result = runBuyVsRent({
      amortizationData: amort.data,
      totalCashNeeded: 108000,
      netMonthlyCost: 2500,
      maintenanceMonthly: 416,
      currentRent: 1600,
      marketReturn: 7,
      amortization: 25,
    });
    expect(result).toHaveLength(25);
    result.forEach(p => {
      expect(p.buyEquity).toBeGreaterThanOrEqual(0);
      expect(p.rentInvestNetWorth).toBeGreaterThan(0);
    });
  });
});

// ----------------------------------------------------------------------------
// §6.6 — OSFI B-20 Stress test hypothécaire
// Source: Bureau du surintendant des institutions financières, guideline B-20
// ----------------------------------------------------------------------------
describe('calculateB20QualifyingRate (§6.6)', () => {
  it('applique le buffer +2% sur taux contractuel élevé', () => {
    // Contract 4.5% → qualifying = max(6.5%, 5.25%) = 6.5%
    expect(calculateB20QualifyingRate(4.5)).toBeCloseTo(0.065, 4);
  });

  it('applique le plancher 5.25% sur taux contractuel bas', () => {
    // Contract 2.0% → qualifying = max(4.0%, 5.25%) = 5.25%
    expect(calculateB20QualifyingRate(2.0)).toBeCloseTo(OSFI_MQR_FLOOR, 4);
  });

  it('frontière exacte au plancher (contract = 3.25% → qualifying = 5.25%)', () => {
    // Contract 3.25% → contract + 2% = 5.25% exactement = floor
    expect(calculateB20QualifyingRate(3.25)).toBeCloseTo(OSFI_MQR_FLOOR, 4);
  });

  it('frontière exacte au-dessus du plancher (contract = 3.26%)', () => {
    // Contract 3.26% → contract + 2% = 5.26% > floor → utilise buffer
    expect(calculateB20QualifyingRate(3.26)).toBeCloseTo(0.0526, 4);
  });

  it('renvoie le plancher pour taux invalide (NaN, négatif, 0)', () => {
    expect(calculateB20QualifyingRate(NaN)).toBe(OSFI_MQR_FLOOR);
    expect(calculateB20QualifyingRate(-1)).toBe(OSFI_MQR_FLOOR);
    expect(calculateB20QualifyingRate(0)).toBe(OSFI_MQR_FLOOR);
  });
});

describe('calculateB20StressTest (§6.6)', () => {
  it('passes pour un profil normal (revenu élevé, prêt modéré)', () => {
    const result = calculateB20StressTest({
      contractRate: 4.5,
      loanAmount: 300000,
      amortization: 25,
      monthlyHousingChargesExclMortgage: 600,    // taxes + chauffage
      monthlyGrossIncome: 10000,                   // 120k$/an
      otherDebtMonthly: 0,
    });
    expect(result.passes).toBe(true);
    expect(result.gds).toBeLessThan(OSFI_GDS_MAX);
    expect(result.tds).toBeLessThan(OSFI_TDS_MAX);
    expect(result.failReason).toBeUndefined();
  });

  it('échoue sur GDS pour un prêt trop élevé vs revenu', () => {
    const result = calculateB20StressTest({
      contractRate: 4.5,
      loanAmount: 500000,
      amortization: 25,
      monthlyHousingChargesExclMortgage: 800,
      monthlyGrossIncome: 5000,                    // 60k$/an — trop bas
      otherDebtMonthly: 0,
    });
    expect(result.passes).toBe(false);
    expect(result.gds).toBeGreaterThan(OSFI_GDS_MAX);
    expect(result.failReason).toContain('GDS');
  });

  it('échoue sur TDS quand GDS passe mais autres dettes excèdent', () => {
    // Params calibrés pour que GDS ≤ 39% et TDS > 44%.
    // Loan 150k @ 4.5%, 25 ans, qualifying 6.5% → PMT ~1 014$/mois.
    // Housing excl: 250$. Income 6000$. GDS = (1014+250)/6000 = 21% (passe).
    // Other debt 2000$. TDS = (1264 + 2000)/6000 = 54.4% > 44% (fail).
    const result = calculateB20StressTest({
      contractRate: 4.5,
      loanAmount: 150000,
      amortization: 25,
      monthlyHousingChargesExclMortgage: 250,
      monthlyGrossIncome: 6000,
      otherDebtMonthly: 2000,
    });
    expect(result.gds).toBeLessThanOrEqual(OSFI_GDS_MAX); // garantit GDS pas en cause
    expect(result.tds).toBeGreaterThan(OSFI_TDS_MAX);
    expect(result.passes).toBe(false);
    expect(result.failReason).toContain('TDS');
    expect(result.failReason).not.toContain('GDS');
  });

  it('calcule le qualifying PMT au qualifying rate (pas au contract rate)', () => {
    const result = calculateB20StressTest({
      contractRate: 4.5,
      loanAmount: 400000,
      amortization: 25,
      monthlyHousingChargesExclMortgage: 0,
      monthlyGrossIncome: 10000,
    });
    // qualifying = 6.5%, 400k$ sur 25 ans → ~2 700$/mois (vs 2 224$ au taux contractuel)
    expect(result.qualifyingRate).toBeCloseTo(0.065, 4);
    expect(result.qualifyingMonthlyPmt).toBeGreaterThan(2600);
    expect(result.qualifyingMonthlyPmt).toBeLessThan(2800);
  });

  it('protège contre revenu 0 (pas division par 0)', () => {
    const result = calculateB20StressTest({
      contractRate: 4.5,
      loanAmount: 100000,
      amortization: 25,
      monthlyHousingChargesExclMortgage: 200,
      monthlyGrossIncome: 0,
    });
    expect(Number.isFinite(result.gds)).toBe(true);
    expect(Number.isFinite(result.tds)).toBe(true);
    expect(result.passes).toBe(false);
  });

  it('loan = 0 produit qualifyingPmt = 0 (cas dégénéré)', () => {
    const result = calculateB20StressTest({
      contractRate: 4.5,
      loanAmount: 0,
      amortization: 25,
      monthlyHousingChargesExclMortgage: 0,
      monthlyGrossIncome: 10000,
    });
    expect(result.qualifyingMonthlyPmt).toBe(0);
    expect(result.passes).toBe(true);
  });

  it('utilise OSFI_MQR_BUFFER constant (validation cohérence)', () => {
    expect(OSFI_MQR_BUFFER).toBe(0.02);
    expect(OSFI_MQR_FLOOR).toBe(0.0525);
    expect(OSFI_GDS_MAX).toBe(0.39);
    expect(OSFI_TDS_MAX).toBe(0.44);
  });

  // ---- Tests review-fixes (tdd-guide + silent-failure-hunter) ----

  it('amortization = 0 produit qualifyingPmt = 0 sans NaN (guard division par 0)', () => {
    const result = calculateB20StressTest({
      contractRate: 4.5,
      loanAmount: 300000,
      amortization: 0,
      monthlyHousingChargesExclMortgage: 500,
      monthlyGrossIncome: 10000,
    });
    expect(result.qualifyingMonthlyPmt).toBe(0);
    expect(Number.isFinite(result.gds)).toBe(true);
    expect(Number.isFinite(result.tds)).toBe(true);
  });

  it('frontière GDS exactement 39% : passes = true (strict > dans le code)', () => {
    // Calibrer : qualifyingPmt + housing = 39% du revenu exactement
    // Revenu 10 000$ × 39% = 3 900$. Housing excl = 1000$. Donc qualifyingPmt = 2 900$.
    // Trouver loan tel que PMT @6.5% sur 25 ans = 2 900$ : loan ≈ 429 295$.
    const result = calculateB20StressTest({
      contractRate: 4.5,
      loanAmount: 429295,
      amortization: 25,
      monthlyHousingChargesExclMortgage: 1000,
      monthlyGrossIncome: 10000,
    });
    // Le code utilise `gds > OSFI_GDS_MAX` (strict). À 39% pile, passes = true.
    expect(result.gds).toBeCloseTo(OSFI_GDS_MAX, 2);
    expect(result.passes).toBe(true);
  });

  it('snapshot — 4.5% sur 400k$ × 25 ans → qualifyingPmt ≈ 2 700.83$ (composition mensuelle)', () => {
    // Fige la valeur exacte du qualifying PMT pour détecter toute dérive
    // de formule. Valeur calculée à composition MENSUELLE simple (rate/12).
    // Si on bascule sur composition semi-annuelle canadienne (Loi sur les
    // intérêts), la valeur attendue baissera légèrement (~2698$).
    const result = calculateB20StressTest({
      contractRate: 4.5,
      loanAmount: 400000,
      amortization: 25,
      monthlyHousingChargesExclMortgage: 0,
      monthlyGrossIncome: 10000,
    });
    expect(result.qualifyingMonthlyPmt).toBeCloseTo(2700.83, 1);
    expect(result.qualifyingRate).toBeCloseTo(0.065, 4);
  });

  it('frontière contractRate = 5.25% : qualifying = 7.25% (buffer + floor)', () => {
    // À 5.25% contractuel, buffer donne 7.25% > floor 5.25%. Vérifie qu'on
    // utilise bien le résultat du buffer (pas le floor).
    expect(calculateB20QualifyingRate(5.25)).toBeCloseTo(0.0725, 4);
  });
});

// ----------------------------------------------------------------------------
// §6.8 — SCHL : validation mise de fonds + amortissement max
// Source: Société canadienne d'hypothèques et de logement
// ----------------------------------------------------------------------------
describe('calculateMinDownPayment (§6.8)', () => {
  it('applique 5% sous le seuil tier 1 (500k$)', () => {
    expect(calculateMinDownPayment(400000)).toBe(400000 * SCHL_MIN_DOWN_TIER1);
  });

  it('frontière exacte tier 1 : 500k$ = 25 000$ minimum', () => {
    expect(calculateMinDownPayment(SCHL_PRICE_THRESHOLD_TIER1))
      .toBe(SCHL_PRICE_THRESHOLD_TIER1 * SCHL_MIN_DOWN_TIER1);
  });

  it('applique 5%+10% sur tranche 500k-1.5M$', () => {
    // 800k$ : 5% × 500k + 10% × 300k = 25 000 + 30 000 = 55 000$
    const result = calculateMinDownPayment(800000);
    expect(result).toBe(25000 + 30000);
  });

  it('applique 20% pour prix > 1.5M$ (assurance SCHL non disponible)', () => {
    expect(calculateMinDownPayment(2000000)).toBe(2000000 * SCHL_MIN_DOWN_TIER3);
  });

  it('frontière exacte tier 2 : 1.5M$ = 5%×500k + 10%×1M = 125 000$', () => {
    expect(calculateMinDownPayment(SCHL_PRICE_THRESHOLD_TIER2)).toBe(25000 + 100000);
  });

  it('renvoie 0 pour prix invalide', () => {
    expect(calculateMinDownPayment(0)).toBe(0);
    expect(calculateMinDownPayment(-1000)).toBe(0);
    expect(calculateMinDownPayment(NaN)).toBe(0);
  });
});

describe('validateMortgageParameters (§6.8)', () => {
  it('valide un achat conforme (400k$ × 10% MDP × 25 ans assuré)', () => {
    const r = validateMortgageParameters({
      price: 400000,
      downPayment: 40000,
      amortization: 25,
    });
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
    expect(r.insured).toBe(true);
    expect(r.maxAmortizationAllowed).toBe(SCHL_AMORT_MAX_INSURED_STANDARD);
  });

  it('rejette une mise de fonds insuffisante', () => {
    const r = validateMortgageParameters({
      price: 500000,
      downPayment: 10000,  // 2% < 5% min
      amortization: 25,
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('Mise de fonds insuffisante'))).toBe(true);
  });

  it('exige 20% min si prix > 1.5M$ (assurance SCHL non dispo)', () => {
    const r = validateMortgageParameters({
      price: 2000000,
      downPayment: 200000,  // 10% < 20% requis
      amortization: 25,
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('1,5M$'))).toBe(true);
  });

  it('limite amortissement à 25 ans pour assuré standard (pas FTB ni neuf)', () => {
    const r = validateMortgageParameters({
      price: 400000,
      downPayment: 40000,  // 10% → assuré
      amortization: 30,
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('Amortissement 30 ans'))).toBe(true);
  });

  it('permet 30 ans en assuré pour premier acheteur', () => {
    const r = validateMortgageParameters({
      price: 400000,
      downPayment: 40000,
      amortization: 30,
      isFirstTimeBuyer: true,
    });
    expect(r.valid).toBe(true);
    expect(r.maxAmortizationAllowed).toBe(SCHL_AMORT_MAX_INSURED_FTB_OR_NEW);
  });

  it('permet 30 ans en assuré pour résidence neuve', () => {
    const r = validateMortgageParameters({
      price: 400000,
      downPayment: 40000,
      amortization: 30,
      isNewConstruction: true,
    });
    expect(r.valid).toBe(true);
  });

  it('permet 30 ans en conventionnel (MDP ≥ 20%)', () => {
    const r = validateMortgageParameters({
      price: 500000,
      downPayment: 100000,  // 20% exact → conventionnel
      amortization: 30,
    });
    expect(r.valid).toBe(true);
    expect(r.insured).toBe(false);
    expect(r.maxAmortizationAllowed).toBe(SCHL_AMORT_MAX_CONVENTIONAL);
  });

  it('détecte plusieurs erreurs cumulées (MDP + amortissement)', () => {
    const r = validateMortgageParameters({
      price: 600000,
      downPayment: 5000,   // 0.8% < 5% min
      amortization: 35,    // > 25 ans max assuré
    });
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('un seul message d\'erreur pour prix > 1.5M$ + MDP < 5% (pas de doublon)', () => {
    // Fix audit code-reviewer HIGH 1 : prix > 1.5M$ et MDP 1% devrait
    // produire UNIQUEMENT le message ">1,5M$", pas aussi "MDP insuffisante".
    const r = validateMortgageParameters({
      price: 2000000,
      downPayment: 20000,  // 1% — très insuffisant à plusieurs niveaux
      amortization: 25,
    });
    expect(r.valid).toBe(false);
    // Un seul message d'erreur ciblé (le plus précis : >1,5M$).
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain('1,5M$');
  });

  it('frontière exacte prix = 1.5M$ + MDP minimum (125 000$) : assuré, valide', () => {
    const r = validateMortgageParameters({
      price: 1500000,
      downPayment: 125000,  // 5%×500k + 10%×1M = 125k exact
      amortization: 25,
    });
    expect(r.valid).toBe(true);
    expect(r.insured).toBe(true);
  });

  it('frontière MDP = 20% exact (price × 0.20) : conventionnel malgré arrondi flottant', () => {
    // price * 0.20 peut donner 19.9999...% en flottant. Le guard epsilon doit
    // classer ce cas comme conventionnel (insured = false).
    const price = 500000;
    const r = validateMortgageParameters({
      price,
      downPayment: price * 0.20,  // 100 000$ — exactement 20%
      amortization: 30,
    });
    expect(r.valid).toBe(true);
    expect(r.insured).toBe(false);
    expect(r.maxAmortizationAllowed).toBe(SCHL_AMORT_MAX_CONVENTIONAL);
  });

  it('price = 0 : erreur explicite "Prix d\'achat invalide"', () => {
    const r = validateMortgageParameters({
      price: 0,
      downPayment: 10000,
      amortization: 25,
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('invalide'))).toBe(true);
  });

  it('protège contre paramètres invalides (NaN, négatifs)', () => {
    const r = validateMortgageParameters({
      price: NaN,
      downPayment: -1000,
      amortization: NaN,
    });
    expect(Number.isFinite(r.downPaymentRatio)).toBe(true);
    expect(Number.isFinite(r.minDownPayment)).toBe(true);
  });
});

// ----------------------------------------------------------------------------
// §6.5 — SCHL : prime d'assurance hypothécaire (LTV > 80%)
// Source: Société canadienne d'hypothèques et de logement
// ----------------------------------------------------------------------------
describe('calculateSchlPremiumRate (§6.5)', () => {
  it('retourne 0.60% pour LTV ≤ 65%', () => {
    expect(calculateSchlPremiumRate(0.60)).toBe(0.0060);
    expect(calculateSchlPremiumRate(0.65)).toBe(0.0060);
  });

  it('retourne 1.70% pour 65% < LTV ≤ 75%', () => {
    expect(calculateSchlPremiumRate(0.70)).toBe(0.0170);
    expect(calculateSchlPremiumRate(0.75)).toBe(0.0170);
  });

  it('retourne 2.40% pour 75% < LTV ≤ 80%', () => {
    expect(calculateSchlPremiumRate(0.78)).toBe(0.0240);
  });

  it('retourne 2.80% pour 80% < LTV ≤ 85%', () => {
    expect(calculateSchlPremiumRate(0.83)).toBe(0.0280);
  });

  it('retourne 3.10% pour 85% < LTV ≤ 90%', () => {
    expect(calculateSchlPremiumRate(0.88)).toBe(0.0310);
  });

  it('retourne 4.00% pour 90% < LTV ≤ 95%', () => {
    expect(calculateSchlPremiumRate(0.94)).toBe(0.0400);
    expect(calculateSchlPremiumRate(0.95)).toBe(0.0400);
  });

  it('retourne 0 pour LTV > 95% (assurance non disponible)', () => {
    expect(calculateSchlPremiumRate(0.97)).toBe(0);
  });

  it('retourne 0 pour LTV invalide (NaN, négatif, 0)', () => {
    expect(calculateSchlPremiumRate(NaN)).toBe(0);
    expect(calculateSchlPremiumRate(-0.1)).toBe(0);
    expect(calculateSchlPremiumRate(0)).toBe(0);
  });
});

describe('calculateSchlPremium (§6.5)', () => {
  it('prime requise si MDP < 20% (LTV > 80%)', () => {
    // 400k$ × 10% MDP = 40k$. Loan = 360k$. LTV = 90%. Prime 3.10%.
    const r = calculateSchlPremium({ price: 400000, downPayment: 40000 });
    expect(r.required).toBe(true);
    expect(r.available).toBe(true);
    expect(r.ltv).toBeCloseTo(0.90, 4);
    expect(r.rate).toBe(0.0310);
    expect(r.premium).toBeCloseTo(360000 * 0.0310, 1);
  });

  it('aucune prime pour conventionnel (MDP ≥ 20%)', () => {
    const r = calculateSchlPremium({ price: 500000, downPayment: 100000 });
    expect(r.required).toBe(false);
    expect(r.available).toBe(true);
    expect(r.premium).toBe(0);
  });

  it('frontière MDP = 20% exact : pas de prime (LTV = 80% ≤ 80%)', () => {
    const r = calculateSchlPremium({ price: 500000, downPayment: 100000 });
    expect(r.ltv).toBeCloseTo(0.80, 4);
    expect(r.required).toBe(false);
  });

  it('frontière MDP = 19.99% : prime requise', () => {
    // 500k × 19.99% = 99 950$. LTV = 80.01% → palier 2.80%
    const r = calculateSchlPremium({ price: 500000, downPayment: 99950 });
    expect(r.required).toBe(true);
    expect(r.rate).toBe(0.0280);
  });

  it('assurance non disponible pour prix > 1.5M$', () => {
    const r = calculateSchlPremium({ price: 2000000, downPayment: 200000 });
    expect(r.available).toBe(false);
    expect(r.required).toBe(false);
    expect(r.premium).toBe(0);
  });

  it('assurance non disponible pour LTV > 95% (MDP < 5%)', () => {
    const r = calculateSchlPremium({ price: 400000, downPayment: 10000 });
    expect(r.ltv).toBeCloseTo(0.975, 4);
    expect(r.available).toBe(false);
    expect(r.required).toBe(false);
  });

  it('snapshot — 500k × 5% MDP → prime 4.00% × 475k = 19 000$', () => {
    const r = calculateSchlPremium({ price: 500000, downPayment: 25000 });
    expect(r.ltv).toBeCloseTo(0.95, 4);
    expect(r.rate).toBe(0.0400);
    expect(r.premium).toBe(19000);
  });

  it('guard NaN/négatif : retourne ltv 0 sans crash', () => {
    const r = calculateSchlPremium({ price: NaN, downPayment: -1000 });
    expect(Number.isFinite(r.ltv)).toBe(true);
    expect(Number.isFinite(r.premium)).toBe(true);
    expect(r.required).toBe(false);
  });

  it('cohérence avec SCHL_PREMIUM_TIERS (6 paliers exposés)', () => {
    expect(SCHL_PREMIUM_TIERS.length).toBe(6);
    expect(SCHL_PREMIUM_TIERS[0].maxLtv).toBe(0.65);
    expect(SCHL_PREMIUM_TIERS[5].maxLtv).toBe(0.95);
  });
});

// ----------------------------------------------------------------------------
// §6.7 — TPS/TVQ remboursement résidence neuve
// Sources: ARC RC4028 (TPS) + Revenu Québec (TVQ)
// ----------------------------------------------------------------------------
describe('calculateGstNewHomeRebate (§6.7)', () => {
  it('applique 36% de la TPS pour prix ≤ 350 000$', () => {
    // 300k × 5% × 36% = 5 400$
    expect(calculateGstNewHomeRebate(300000)).toBeCloseTo(5400, 1);
  });

  it('atteint le rebate max à 350 000$ exactement (6 300$)', () => {
    expect(calculateGstNewHomeRebate(GST_REBATE_PRICE_FULL)).toBeCloseTo(GST_REBATE_MAX, 1);
  });

  it('décroît linéairement entre 350k et 450k$', () => {
    // À 400k : transitionRatio = (450 - 400) / 100 = 0.5 → 6300 × 0.5 = 3150$
    expect(calculateGstNewHomeRebate(400000)).toBeCloseTo(GST_REBATE_MAX * 0.5, 1);
  });

  it('retourne 0 pour prix ≥ 450 000$', () => {
    expect(calculateGstNewHomeRebate(450000)).toBe(0);
    expect(calculateGstNewHomeRebate(500000)).toBe(0);
  });

  it('retourne 0 pour prix invalide', () => {
    expect(calculateGstNewHomeRebate(0)).toBe(0);
    expect(calculateGstNewHomeRebate(NaN)).toBe(0);
    expect(calculateGstNewHomeRebate(-1000)).toBe(0);
  });
});

describe('calculateQstNewHomeRebate (§6.7)', () => {
  it('applique 50% de la TVQ pour prix ≤ 200 000$', () => {
    // 150k × 9.975% × 50% = 7 481.25$
    expect(calculateQstNewHomeRebate(150000)).toBeCloseTo(7481.25, 1);
  });

  it('atteint le rebate max à 200 000$ exactement', () => {
    expect(calculateQstNewHomeRebate(QST_REBATE_PRICE_FULL)).toBeCloseTo(QST_REBATE_MAX, 1);
  });

  it('décroît linéairement entre 200k et 300k$', () => {
    // À 250k : transitionRatio = 0.5 → max × 0.5
    expect(calculateQstNewHomeRebate(250000)).toBeCloseTo(QST_REBATE_MAX * 0.5, 1);
  });

  it('retourne 0 pour prix ≥ 300 000$', () => {
    expect(calculateQstNewHomeRebate(300000)).toBe(0);
    expect(calculateQstNewHomeRebate(400000)).toBe(0);
  });
});

describe('calculateNewHomeRebateTotal (§6.7)', () => {
  it('retourne 0 si pas résidence neuve', () => {
    expect(calculateNewHomeRebateTotal(300000, false)).toBe(0);
  });

  it('combine TPS + TVQ pour résidence neuve à 150k$', () => {
    const expected = calculateGstNewHomeRebate(150000) + calculateQstNewHomeRebate(150000);
    expect(calculateNewHomeRebateTotal(150000, true)).toBeCloseTo(expected, 2);
  });

  it('retourne TPS rebate seulement si prix > seuil TVQ (300k)', () => {
    // Prix 400k : TPS rebate partiel ≈ 3150$, TVQ rebate = 0
    const r = calculateNewHomeRebateTotal(400000, true);
    expect(r).toBeCloseTo(calculateGstNewHomeRebate(400000), 1);
    expect(calculateQstNewHomeRebate(400000)).toBe(0);
  });

  it('snapshot — 300k neuve : 5 400$ TPS + 0$ TVQ = 5 400$ total', () => {
    expect(calculateNewHomeRebateTotal(300000, true)).toBeCloseTo(5400, 1);
  });
});
