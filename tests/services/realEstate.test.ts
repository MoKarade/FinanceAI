import { describe, it, expect } from 'vitest';
import {
  calculateWelcomeTax,
  calculateMortgagePayment,
  calculatePurchaseCosts,
  runAmortization,
  runBuyVsRent,
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
