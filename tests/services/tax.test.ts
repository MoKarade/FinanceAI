import { describe, it, expect } from 'vitest';
import {
  calculateFiscalReport,
  calculateGrossFromNet,
  calculateCeliRoom,
  calculateCeliAvailableRoom,
  calculateGrossWithholdingRRSP,
  calculateCapitalGainsTax,
  calculateDividendTax,
  calculateAgeAndPensionCredits,
  calculateRamqPremium,
  getMarginalRate,
  FED_BRACKETS,
  QC_BRACKETS,
  BASIC_PERSONAL_AMOUNT_FED,
  BASIC_PERSONAL_AMOUNT_QC,
  RRQ_MAX,
  RQAP_MAX,
  AE_MAX_QC,
  AGE_AMOUNT_FED_2026,
  AGE_AMOUNT_FED_THRESHOLD_2026,
  PENSION_INCOME_AMOUNT_FED,
  AGE_AMOUNT_QC_2026,
  RETIREMENT_INCOME_AMOUNT_QC_2026,
  QC_LINE_361_THRESHOLD_SINGLE,
  QC_LINE_361_THRESHOLD_COUPLE,
  FED_NONREFUNDABLE_RATE,
  QC_NONREFUNDABLE_RATE,
  RAMQ_EXEMPTION_SINGLE_2026,
  RAMQ_EXEMPTION_COUPLE_2026,
  RAMQ_EXEMPTION_SINGLE_CHILD_1,
  RAMQ_MAX_PREMIUM_2026,
  RAMQ_RATE_SINGLE_BRACKET1,
  RAMQ_RATE_SINGLE_BRACKET2,
  RAMQ_BRACKET1_AMOUNT,
} from '../../services/tax';
import { processDecemberTaxFiling } from '../../services/projection/taxDecember';
import { calculateFiscalReport as calcReport, getMarginalRate as getMarg, calculateDividendTax as calcDiv } from '../../services/tax';

describe('calculateFiscalReport', () => {
  it('renvoie zero pour un revenu nul', () => {
    const r = calculateFiscalReport(0, 0, 0);
    expect(r.totalTax).toBe(0);
    expect(r.netIncome).toBe(0);
  });

  it('applique le credit montant personnel de base (revenu 50k)', () => {
    const r = calculateFiscalReport(50000, 0, 0);
    // Plage attendue 2026 : impot total ~8.3k$, net ~38k$ apres RRQ+RQAP+AE
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

  it('applique 50% d\'inclusion uniforme même au-dessus de 250k$ (annulation mars 2025)', () => {
    const tax = calculateCapitalGainsTax(50000, 0.40, 1, 250000);
    // 50k * 0.5 * 0.40 = 10000 (proposition 66.67% retirée par le gouvernement)
    expect(tax).toBeCloseTo(10000, 1);
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

  it('combine fed * (1 - abatement Quebec) + qc pour 80k$ (2026)', () => {
    // 80k $ : Fed 2026 entre 58523 et 117045 = 20.5%, QC entre 54345 et 108680 = 19%
    // Fed effectif = 0.205 * (1 - 0.165) = 0.171175 ; total = 0.361175
    const r = getMarginalRate(80000);
    expect(r).toBeCloseTo(0.361, 2);
  });
});

// ----------------------------------------------------------------------------
// REGRESSION 2026 : verification des barèmes officiels ARC + Revenu Québec
// ----------------------------------------------------------------------------
describe('Barèmes fiscaux 2026 (régression)', () => {
  it('1ère tranche fédérale est 14% (baisse vs 15% en 2025)', () => {
    expect(FED_BRACKETS[0].rate).toBe(0.14);
  });

  it('seuils fédéraux 2026 conformes à l\'ARC', () => {
    expect(FED_BRACKETS[0].upTo).toBe(58523);
    expect(FED_BRACKETS[1].upTo).toBe(117045);
    expect(FED_BRACKETS[2].upTo).toBe(181440);
    expect(FED_BRACKETS[3].upTo).toBe(258482);
  });

  it('seuils Québec 2026 conformes à Revenu Québec', () => {
    expect(QC_BRACKETS[0].upTo).toBe(54345);
    expect(QC_BRACKETS[1].upTo).toBe(108680);
    expect(QC_BRACKETS[2].upTo).toBe(132245);
  });

  it('BPA fédéral 2026 = 16 452 $', () => {
    expect(BASIC_PERSONAL_AMOUNT_FED).toBe(16452);
  });

  it('BPA Québec 2026 = 18 952 $', () => {
    expect(BASIC_PERSONAL_AMOUNT_QC).toBe(18952);
  });

  it('RRQ max 2026 ≈ 4 569,60$ (taux 6.4% x (MPE 74 900 - exemption 3 500))', () => {
    // Correction audit fiscal: taux 2026 = 6.4% (5.4% base + 1% volet 1), MPE = 74 900$
    expect(RRQ_MAX).toBeCloseTo(4569.60, 2);
  });

  it('RQAP max 2026 = 442,90 $', () => {
    expect(RQAP_MAX).toBeCloseTo(442.90, 2);
  });

  it('AE QC max 2026 = 895,70 $', () => {
    expect(AE_MAX_QC).toBeCloseTo(895.70, 2);
  });
});

// ----------------------------------------------------------------------------
// §6.2 — Crédits 65+ et revenu de retraite (fed + QC)
// Sources : ARC ligne 30100/31400 + Revenu Québec ligne 361 (indexation 2026)
// ----------------------------------------------------------------------------
describe('calculateAgeAndPensionCredits (§6.2)', () => {
  it('renvoie 0 pour une personne < 65 ans sans pension', () => {
    const { fedCredit, qcCredit } = calculateAgeAndPensionCredits(
      { age: 60, eligiblePensionIncome: 0 },
      50000,
    );
    expect(fedCredit).toBe(0);
    expect(qcCredit).toBe(0);
  });

  it('refuse le crédit pension fédéral pour < 65 ans (ARC ligne 31400 cas standard)', () => {
    // ARC restreint le crédit pension à 65+ pour FERR, REER converti, pension privée.
    // Les exceptions invalidité < 65 ans ne sont pas modélisées dans FinanceAI.
    const { fedCredit } = calculateAgeAndPensionCredits(
      { age: 64, eligiblePensionIncome: 3000 },
      40000,
    );
    expect(fedCredit).toBe(0);
  });

  it('frontière âge : 65 ans active les crédits, 64 ans non (off-by-one guard)', () => {
    // Revenu sous le seuil QC (27 835$ sans conjoint) pour exclure la réduction.
    const incomeBelowAllThresholds = 20000;
    const at64 = calculateAgeAndPensionCredits({ age: 64, eligiblePensionIncome: 0, familyIncome: incomeBelowAllThresholds }, incomeBelowAllThresholds);
    const at65 = calculateAgeAndPensionCredits({ age: 65, eligiblePensionIncome: 0, familyIncome: incomeBelowAllThresholds }, incomeBelowAllThresholds);
    expect(at64.fedCredit).toBe(0);
    expect(at64.qcCredit).toBe(0);
    expect(at65.fedCredit).toBeCloseTo(AGE_AMOUNT_FED_2026 * FED_NONREFUNDABLE_RATE, 2);
    expect(at65.qcCredit).toBeCloseTo(AGE_AMOUNT_QC_2026 * QC_NONREFUNDABLE_RATE, 2);
  });

  it('age 65+ sans pension : crédit âge actif, composante pension QC nulle', () => {
    const { fedCredit, qcCredit } = calculateAgeAndPensionCredits(
      { age: 68, eligiblePensionIncome: 0, hasSpouse: false, familyIncome: 25000 },
      25000,
    );
    expect(fedCredit).toBeCloseTo(AGE_AMOUNT_FED_2026 * FED_NONREFUNDABLE_RATE, 2);
    // Composante revenu retraite QC = 0 puisque pension = 0
    expect(qcCredit).toBeCloseTo(AGE_AMOUNT_QC_2026 * QC_NONREFUNDABLE_RATE, 2);
  });

  it('protège contre NaN dans eligiblePensionIncome (silent-failure guard)', () => {
    const { fedCredit, qcCredit } = calculateAgeAndPensionCredits(
      { age: 70, eligiblePensionIncome: NaN, hasSpouse: false, familyIncome: 25000 },
      25000,
    );
    expect(Number.isFinite(fedCredit)).toBe(true);
    expect(Number.isFinite(qcCredit)).toBe(true);
    // Avec pension = 0 (fallback NaN→0), pas de composante pension
    expect(fedCredit).toBeCloseTo(AGE_AMOUNT_FED_2026 * FED_NONREFUNDABLE_RATE, 2);
  });

  it('applique le crédit âge fédéral à plein si revenu net ≤ seuil 2026', () => {
    const { fedCredit } = calculateAgeAndPensionCredits(
      { age: 70, eligiblePensionIncome: 0 },
      AGE_AMOUNT_FED_THRESHOLD_2026 - 1000,
    );
    // 8 966$ × 15% = 1 344,90$
    expect(fedCredit).toBeCloseTo(AGE_AMOUNT_FED_2026 * FED_NONREFUNDABLE_RATE, 2);
  });

  it('réduit le crédit âge fédéral de 15% du revenu excédentaire', () => {
    const excess = 10000;
    const { fedCredit } = calculateAgeAndPensionCredits(
      { age: 70, eligiblePensionIncome: 0 },
      AGE_AMOUNT_FED_THRESHOLD_2026 + excess,
    );
    const expectedAmount = AGE_AMOUNT_FED_2026 - excess * 0.15;
    expect(fedCredit).toBeCloseTo(expectedAmount * FED_NONREFUNDABLE_RATE, 2);
  });

  it('annule le crédit âge fédéral pour un revenu très élevé', () => {
    const veryHigh = AGE_AMOUNT_FED_THRESHOLD_2026 + AGE_AMOUNT_FED_2026 / 0.15 + 5000;
    const { fedCredit } = calculateAgeAndPensionCredits(
      { age: 70, eligiblePensionIncome: 0 },
      veryHigh,
    );
    expect(fedCredit).toBe(0);
  });

  it('plafonne le crédit pension fédéral à 2 000$ × 15%', () => {
    const { fedCredit: low } = calculateAgeAndPensionCredits(
      { age: 70, eligiblePensionIncome: 1500 },
      40000,
    );
    const { fedCredit: high } = calculateAgeAndPensionCredits(
      { age: 70, eligiblePensionIncome: 10000 },
      40000,
    );
    expect(high - low).toBeCloseTo((PENSION_INCOME_AMOUNT_FED - 1500) * FED_NONREFUNDABLE_RATE, 2);
  });

  it('applique la ligne 361 QC à plein pour 65+ sous le seuil sans conjoint', () => {
    const familyIncome = QC_LINE_361_THRESHOLD_SINGLE - 1000;
    const pension = RETIREMENT_INCOME_AMOUNT_QC_2026;
    const { qcCredit } = calculateAgeAndPensionCredits(
      { age: 70, eligiblePensionIncome: pension, hasSpouse: false, familyIncome },
      familyIncome,
    );
    const expectedAmount = AGE_AMOUNT_QC_2026 + RETIREMENT_INCOME_AMOUNT_QC_2026;
    expect(qcCredit).toBeCloseTo(expectedAmount * QC_NONREFUNDABLE_RATE, 2);
  });

  it('utilise le seuil couple (45 270$) quand hasSpouse = true', () => {
    const familyIncome = QC_LINE_361_THRESHOLD_COUPLE - 1000;
    const { qcCredit: withSpouse } = calculateAgeAndPensionCredits(
      { age: 70, eligiblePensionIncome: 3000, hasSpouse: true, familyIncome },
      familyIncome,
    );
    const { qcCredit: noSpouse } = calculateAgeAndPensionCredits(
      { age: 70, eligiblePensionIncome: 3000, hasSpouse: false, familyIncome },
      familyIncome,
    );
    expect(withSpouse).toBeGreaterThan(noSpouse);
  });

  it('réduit la ligne 361 QC de 18.75% du revenu excédentaire', () => {
    const excess = 10000;
    const familyIncome = QC_LINE_361_THRESHOLD_SINGLE + excess;
    const { qcCredit } = calculateAgeAndPensionCredits(
      { age: 70, eligiblePensionIncome: RETIREMENT_INCOME_AMOUNT_QC_2026, hasSpouse: false, familyIncome },
      familyIncome,
    );
    const grossLine361 = AGE_AMOUNT_QC_2026 + RETIREMENT_INCOME_AMOUNT_QC_2026;
    const reduction = excess * 0.1875;
    const expectedAmount = Math.max(0, grossLine361 - reduction);
    expect(qcCredit).toBeCloseTo(expectedAmount * QC_NONREFUNDABLE_RATE, 2);
  });
});

describe('calculateFiscalReport avec ageOpts (§6.2 intégration)', () => {
  it('réduit l\'impôt total pour un retraité 67 ans vs un actif jeune au même revenu', () => {
    const income = 35000;
    const baseline = calculateFiscalReport(income, 0, 0);
    const senior = calculateFiscalReport(income, 0, 0, 2026, false, {
      age: 67,
      eligiblePensionIncome: income,
      hasSpouse: false,
      familyIncome: income,
    });
    expect(senior.totalTax).toBeLessThan(baseline.totalTax);
    const saving = baseline.totalTax - senior.totalTax;
    expect(saving).toBeGreaterThan(800);
    expect(saving).toBeLessThan(3000);
  });

  it('ne change rien sans ageOpts (rétrocompatibilité)', () => {
    const r1 = calculateFiscalReport(50000, 0, 0);
    const r2 = calculateFiscalReport(50000, 0, 0, 2026);
    const r3 = calculateFiscalReport(50000, 0, 0, 2026, false);
    expect(r1.totalTax).toBe(r2.totalTax);
    expect(r2.totalTax).toBe(r3.totalTax);
  });

  it('annule exactement le crédit ligne 361 QC au-dessus du seuil familial (assertion stricte)', () => {
    // À 80 000$ sans conjoint : excès = 80 000 - 27 835 = 52 165$
    // réduction = 52 165 × 18.75% = 9 781$ >> grossLine361 (3 986 + 3 058 = 7 044$)
    // donc qcCredit = max(0, 7 044 - 9 781) × 14% = 0
    const { qcCredit, fedCredit } = calculateAgeAndPensionCredits(
      { age: 70, eligiblePensionIncome: 80000, hasSpouse: false, familyIncome: 80000 },
      80000,
    );
    expect(qcCredit).toBe(0);
    // Le crédit fédéral âge est réduit (excès = 80 000 - 46 432 = 33 568$ × 15% = 5 035$
    // de réduction sur le 8 966$ d'âge max, soit ageAmountFed restant ≈ 3 931$).
    // Plus le crédit pension 2 000$ → fedAmount = ~5 931$ × 15% ≈ 890$.
    expect(fedCredit).toBeGreaterThan(800);
    expect(fedCredit).toBeLessThan(950);
  });

  it('régression — retraité 70 ans, 30 000$ revenu pension, sans conjoint (valeur figée)', () => {
    // Snapshot pour détecter toute dérive future des constantes/calculs §6.2.
    // Si ce test casse, vérifier si l'écart est intentionnel (indexation,
    // changement ARC/Revenu Québec) ou si c'est une régression.
    const r = calculateFiscalReport(30000, 0, 0, 2026, false, {
      age: 70,
      eligiblePensionIncome: 30000,
      hasSpouse: false,
      familyIncome: 30000,
    });
    // Fenêtre 500-1000$ : crédits §6.2 (fed âge plein + pension 2k + ligne 361
    // partiellement réduite par excès 30k-27.8k) ramènent l'impôt à ~690$.
    expect(r.totalTax).toBeGreaterThan(500);
    expect(r.totalTax).toBeLessThan(1000);
    expect(r.netIncome).toBeGreaterThan(25000);
    expect(r.netIncome).toBeLessThan(30000);
  });
});

// ----------------------------------------------------------------------------
// §6.4 — RAMQ : prime régime public assurance médicaments
// Sources : RAMQ + Revenu Québec ligne 447, Annexe K (2026 max 766$)
// ----------------------------------------------------------------------------
describe('calculateRamqPremium (§6.4)', () => {
  it('renvoie 0 pour un revenu sous le seuil d\'exemption célibataire', () => {
    const premium = calculateRamqPremium(RAMQ_EXEMPTION_SINGLE_2026 - 1000);
    expect(premium).toBe(0);
  });

  it('renvoie 0 pour un revenu sous le seuil d\'exemption couple', () => {
    const premium = calculateRamqPremium(RAMQ_EXEMPTION_COUPLE_2026 - 1000, { hasSpouse: true });
    expect(premium).toBe(0);
  });

  it('applique le taux du palier 1 célibataire (7.65%) sur l\'excès', () => {
    const excess = 3000; // inférieur au palier 1 (5000$)
    const premium = calculateRamqPremium(RAMQ_EXEMPTION_SINGLE_2026 + excess);
    expect(premium).toBeCloseTo(excess * RAMQ_RATE_SINGLE_BRACKET1, 2);
  });

  it('cumule palier 1 + palier 2 célibataire', () => {
    const excess = RAMQ_BRACKET1_AMOUNT + 3000; // 5000 dans bracket1 + 3000 dans bracket2
    const premium = calculateRamqPremium(RAMQ_EXEMPTION_SINGLE_2026 + excess);
    const expected = RAMQ_BRACKET1_AMOUNT * RAMQ_RATE_SINGLE_BRACKET1 + 3000 * RAMQ_RATE_SINGLE_BRACKET2;
    expect(premium).toBeCloseTo(expected, 2);
  });

  it('plafonne à 766$/adulte (max 2026)', () => {
    const premium = calculateRamqPremium(200000, { hasSpouse: false });
    expect(premium).toBe(RAMQ_MAX_PREMIUM_2026);
  });

  it('couple paie moins par adulte que célibataire (taux plus bas)', () => {
    const familyIncome = 40000;
    const single = calculateRamqPremium(familyIncome, { hasSpouse: false });
    const couplePerAdult = calculateRamqPremium(familyIncome, { hasSpouse: true });
    expect(couplePerAdult).toBeLessThan(single);
  });

  it('renvoie 0 si exempt = true (couverture privée)', () => {
    const premium = calculateRamqPremium(80000, { exempt: true });
    expect(premium).toBe(0);
  });

  it('relève le seuil d\'exemption avec enfants', () => {
    const incomeAt35k = 35000;
    // 35k$ > seuil single (19 500$) → prime non nulle sans enfants
    const noChildren = calculateRamqPremium(incomeAt35k, { hasSpouse: false, childrenCount: 0 });
    // Avec 2+ enfants : seuil = 19 500 + 7 895 = 27 395$, excès = 7 605$, prime > 0 mais plus faible
    const twoChildren = calculateRamqPremium(incomeAt35k, { hasSpouse: false, childrenCount: 2 });
    expect(twoChildren).toBeLessThan(noChildren);
  });

  it('guard NaN — revenu invalide retourne 0 sans pollution', () => {
    expect(calculateRamqPremium(NaN)).toBe(0);
    expect(calculateRamqPremium(Infinity)).toBe(0);
    expect(calculateRamqPremium(-1000)).toBe(0);
  });

  it('régression — célibataire 35 000$ atteint le plafond 766$ (snapshot 2026)', () => {
    // 35 000 - 19 500 = 15 500$ excès → palier 1 (5 000 × 7.65%) + palier 2
    // (9 600 × 11.48%) = 382.50 + 1 101.96 = 1 484.46$ → plafonné à 766$ max.
    const premium = calculateRamqPremium(35000, { hasSpouse: false });
    expect(premium).toBe(RAMQ_MAX_PREMIUM_2026);
  });

  // ---- Fixes review agents (tdd-guide + silent-failure-hunter) ----

  it('frontière exacte : revenu = seuil single (19 500$) → prime = 0', () => {
    expect(calculateRamqPremium(RAMQ_EXEMPTION_SINGLE_2026)).toBe(0);
  });

  it('frontière exacte : revenu = seuil couple (31 610$) → prime = 0', () => {
    expect(calculateRamqPremium(RAMQ_EXEMPTION_COUPLE_2026, { hasSpouse: true })).toBe(0);
  });

  it('childrenCount = 1 : palier intermédiaire distinct de 0 et 2+', () => {
    // À 25 000$ revenu single :
    // - 0 enfant : excess = 25 000 - 19 500 = 5 500$ → prime > 0
    // - 1 enfant : excess = 25 000 - (19 500 + 4 105) = 1 395$ → prime plus basse
    // - 2 enfants : excess = 25 000 - (19 500 + 7 895) = -2 395 → prime = 0
    const p0 = calculateRamqPremium(25000, { hasSpouse: false, childrenCount: 0 });
    const p1 = calculateRamqPremium(25000, { hasSpouse: false, childrenCount: 1 });
    const p2 = calculateRamqPremium(25000, { hasSpouse: false, childrenCount: 2 });
    expect(p1).toBeGreaterThan(0);
    expect(p1).toBeLessThan(p0);
    expect(p2).toBe(0);
    // Le bonus pour 1 enfant = RAMQ_EXEMPTION_SINGLE_CHILD_1 (4 105$)
    expect(p1).toBeCloseTo((5500 - RAMQ_EXEMPTION_SINGLE_CHILD_1) * RAMQ_RATE_SINGLE_BRACKET1, 2);
  });

  it('frontière bracket1/bracket2 : excès exactement 5 000$ ne touche pas bracket2', () => {
    const premium = calculateRamqPremium(RAMQ_EXEMPTION_SINGLE_2026 + RAMQ_BRACKET1_AMOUNT);
    expect(premium).toBeCloseTo(RAMQ_BRACKET1_AMOUNT * RAMQ_RATE_SINGLE_BRACKET1, 2);
  });

  it('exempt = true bloque tout calcul même avec revenu très élevé et 3 enfants', () => {
    const premium = calculateRamqPremium(500000, { exempt: true, hasSpouse: true, childrenCount: 3 });
    expect(premium).toBe(0);
  });
});

// ----------------------------------------------------------------------------
// §6.4 — Intégration processDecemberTaxFiling : la prime RAMQ est bien appliquée
// ----------------------------------------------------------------------------
describe('processDecemberTaxFiling intègre la prime RAMQ (§6.4)', () => {
  const baseCtx = {
    m: 12,
    loopYear: 2026,
    isRetired: false,
    enableMonteCarlo: false,
    yearsElapsed: 0,
    inflationFactor: 1,
    activeUsersCount: 1,
    grossMarcBaseAnnual: 40000,
    grossAnnaBaseAnnual: 0,
    simSalaryGrowth: 0,
    optimizeSourceDeductions: false,
    incomeRetirementMonthly: 0,
    nonReg: 0,
    baseNonRegRate: 0,
    accRrspYear: 0,
    accFhsaYear: 0,
    smithInterestDeductibleYear: 0,
    accRentesYear: 0,
    accRetraitsReerYear: 0,
    accCapitalGainsYear: 0,
  };
  const helpers = {
    calculateFiscalReport: calcReport,
    getMarginalRate: getMarg,
    calculateDividendTax: calcDiv,
  };

  it('applique la prime RAMQ à taxCurrent.divers pour un actif non-exempt', () => {
    const result = processDecemberTaxFiling(
      11,  // décembre
      { ...baseCtx, ramqExempt: false, childrenCount: 0 },
      helpers,
      { revenu: 0, gains: 0, divers: 0, reer: 0 },
    );
    expect(result.newTaxCurrentYear.divers).toBeGreaterThan(0);
    expect(result.logs.some(l => l.includes('RAMQ'))).toBe(true);
  });

  it('exempte la prime RAMQ si ramqExempt = true (couverture privée)', () => {
    const result = processDecemberTaxFiling(
      11,
      { ...baseCtx, ramqExempt: true, childrenCount: 0 },
      helpers,
      { revenu: 0, gains: 0, divers: 0, reer: 0 },
    );
    expect(result.newTaxCurrentYear.divers).toBe(0);
    expect(result.logs.some(l => l.includes('RAMQ'))).toBe(false);
  });

  it('soustrait les déductions REER du familyNetIncome mode actif', () => {
    // Avec 40k$ brut + 30k$ REER → revenu net = 10k$ → sous seuil 19 500$ → prime 0
    const result = processDecemberTaxFiling(
      11,
      { ...baseCtx, ramqExempt: false, childrenCount: 0, accRrspYear: 30000 },
      helpers,
      { revenu: 0, gains: 0, divers: 0, reer: 0 },
    );
    // Pas de prime RAMQ car revenu net (10k$) < seuil exemption (19 500$)
    expect(result.logs.some(l => l.includes('RAMQ'))).toBe(false);
  });
});
