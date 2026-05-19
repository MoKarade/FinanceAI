import { describe, it, expect } from 'vitest';
import {
  calculateWelcomeTax,
  calculateMortgagePayment,
  calculatePurchaseCosts,
  runAmortization,
  runBuyVsRent,
  calculateB20QualifyingRate,
  calculateB20StressTest,
  OSFI_MQR_FLOOR,
  OSFI_MQR_BUFFER,
  OSFI_GDS_MAX,
  OSFI_TDS_MAX,
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
