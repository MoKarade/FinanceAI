import { describe, it, expect } from 'vitest';
import {
  calculateFiscalReport,
  calculateGrossFromNet,
  calculateNetFromGross,
  calculateCeliRoom,
  calculateCeliAvailableRoom,
  calculateGrossWithholdingRRSP,
  calculateCapitalGainsTax,
  calculateDividendTax,
  getMarginalRate,
  FED_BRACKETS,
  QC_BRACKETS,
} from '../../services/tax';

describe('calculateFiscalReport', () => {
  it('renvoie zero pour un revenu nul', () => {
    const r = calculateFiscalReport(0, 0, 0);
    expect(r.totalTax).toBe(0);
    expect(r.netIncome).toBe(0);
  });

  it('applique le credit montant personnel de base (revenu 50k)', () => {
    const r = calculateFiscalReport(50000, 0, 0);
    // Plage attendue 2025 : impot total ~8.8k$, net ~37k$ apres RRQ+RQAP+AE
    expect(r.totalTax).toBeGreaterThan(7000);
    expect(r.totalTax).toBeLessThan(11000);
    expect(r.netIncome).toBeGreaterThan(35000);
    expect(r.netIncome).toBeLessThan(45000);
  });

  it('reduit les impots avec une cotisation REER (100k brut, 10k REER)', () => {
    const withRRSP = calculateFiscalReport(100000, 10000, 0);
    const withoutRRSP = calculateFiscalReport(100000, 0, 0);
    expect(withRRSP.totalTax).toBeLessThan(withoutRRSP.totalTax);
    // Economie attendue ~3.6k$ (taux marginal combine ~36%)
    const taxSavings = withoutRRSP.totalTax - withRRSP.totalTax;
    expect(taxSavings).toBeGreaterThan(2500);
    expect(taxSavings).toBeLessThan(4500);
  });

  it('renvoie un taux marginal coherent pour 80k$', () => {
    const r = calculateFiscalReport(80000, 0, 0);
    expect(r.marginalRate).toBeGreaterThan(0.30);
    expect(r.marginalRate).toBeLessThan(0.42);
  });

  it('renvoie les breakdowns par palier quand demande', () => {
    const r = calculateFiscalReport(150000, 0, 0);
    expect(r.fedBreakdown).toBeDefined();
    expect(r.fedBreakdown!.length).toBe(FED_BRACKETS.length);
    expect(r.qcBreakdown!.length).toBe(QC_BRACKETS.length);
  });
});

describe('calculateGrossFromNet', () => {
  it('est l\'inverse de calculateFiscalReport (tolerance 50$)', () => {
    for (const annualNet of [40000, 60000, 100000]) {
      const gross = calculateGrossFromNet(annualNet);
      const netRebuilt = calculateFiscalReport(gross, 0, 0).netIncome;
      expect(Math.abs(netRebuilt - annualNet)).toBeLessThan(50);
    }
  });

  it('renvoie 0 pour un net non positif', () => {
    expect(calculateGrossFromNet(0)).toBe(0);
    expect(calculateGrossFromNet(-1000)).toBe(0);
  });
});

describe('calculateCeliRoom', () => {
  it('cumule l\'espace depuis 2009 pour un adulte deja arrive', () => {
    // Ne en 1990, arrive 2009, calcul en 2025 -> somme 2009..2025
    const room = calculateCeliRoom(1990, 2009, 2025);
    expect(room).toBeGreaterThan(95000);
    expect(room).toBeLessThan(110000);
  });

  it('saute les annees avant 18 ans', () => {
    // Ne en 2000, arrive 2009 -> 18 ans en 2018, calcul en 2025
    const room = calculateCeliRoom(2000, 2009, 2025);
    expect(room).toBeGreaterThan(45000);
    expect(room).toBeLessThan(55000);
  });

  it('extrapole les plafonds apres 2030', () => {
    const room2030 = calculateCeliRoom(1980, 2009, 2030);
    const room2035 = calculateCeliRoom(1980, 2009, 2035);
    expect(room2035).toBeGreaterThan(room2030);
    // Au moins 5 * 7500 ajoutes (extrapolation conservative)
    expect(room2035 - room2030).toBeGreaterThanOrEqual(7500 * 5);
  });
});

describe('calculateCeliAvailableRoom', () => {
  it('soustrait le solde courant du plafond total', () => {
    const total = calculateCeliRoom(1990, 2009, 2025);
    const available = calculateCeliAvailableRoom(1990, 2009, 2025, 30000);
    expect(available).toBe(total - 30000);
  });

  it('ne renvoie jamais une valeur negative', () => {
    const available = calculateCeliAvailableRoom(1990, 2009, 2025, 999999);
    expect(available).toBe(0);
  });
});

describe('calculateGrossWithholdingRRSP', () => {
  it('utilise le palier 21% pour un retrait < 5k$', () => {
    const r = calculateGrossWithholdingRRSP(3000);
    // 3000 / (1 - 0.21) = 3797.47$
    expect(r.gross).toBeCloseTo(3797.47, 1);
    expect(r.withholding).toBeCloseTo(797.47, 1);
  });

  it('utilise le palier 30% pour un retrait > 15k$', () => {
    const r = calculateGrossWithholdingRRSP(20000);
    // 20000 / (1 - 0.30) = 28571.43$
    expect(r.gross).toBeCloseTo(28571.43, 1);
  });

  it('renvoie 0 pour un net non positif', () => {
    expect(calculateGrossWithholdingRRSP(0).gross).toBe(0);
    expect(calculateGrossWithholdingRRSP(-1000).gross).toBe(0);
  });
});

describe('calculateCapitalGainsTax', () => {
  it('applique 50% d\'inclusion sous le seuil 250k$', () => {
    const tax = calculateCapitalGainsTax(10000, 0.40, 1, 0);
    // 10k * 0.5 * 0.40 = 2000
    expect(tax).toBeCloseTo(2000, 1);
  });

  it('applique 66.67% d\'inclusion au-dessus de 250k$', () => {
    const tax = calculateCapitalGainsTax(50000, 0.40, 1, 250000);
    // 50k * 0.6667 * 0.40 = 13334
    expect(tax).toBeCloseTo(13334, 1);
  });

  it('renvoie 0 pour un gain non positif', () => {
    expect(calculateCapitalGainsTax(0, 0.40)).toBe(0);
    expect(calculateCapitalGainsTax(-1000, 0.40)).toBe(0);
  });
});

describe('calculateDividendTax', () => {
  it('applique la majoration 38% + CID 26.7%', () => {
    const tax = calculateDividendTax(10000, 0.40);
    // 13800 * 0.40 - 13800 * 0.267 = 5520 - 3685 = 1835
    expect(tax).toBeGreaterThan(1500);
    expect(tax).toBeLessThan(2200);
  });

  it('renvoie 0 pour un dividende nul', () => {
    expect(calculateDividendTax(0, 0.40)).toBe(0);
  });
});

describe('getMarginalRate', () => {
  it('renvoie un taux plus eleve pour un revenu plus eleve', () => {
    const low = getMarginalRate(40000);
    const high = getMarginalRate(150000);
    expect(high).toBeGreaterThan(low);
  });

  it('combine fed * (1 - abatement Quebec) + qc', () => {
    const r = getMarginalRate(80000);
    // Fed 0.205 * 0.835 + QC 0.19 = 0.361
    expect(r).toBeCloseTo(0.361, 2);
  });
});
