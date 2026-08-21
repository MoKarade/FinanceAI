import { describe, it, expect } from 'vitest';
import {
  QC_FEDERAL_ABATEMENT_RATE,
  calculateFiscalReport,
  calculateGrossFromNet,
  calculateCeliRoom,
  calculateCeliAvailableRoom,
  calculateGrossWithholdingRRSP,
  withholdingForGrossRRSP,
  rrqAdjustmentFactor,
  psvDeferralFactor,
  calculateCapitalGainsTax,
  calculateDividendTax,
  calculateAgeAndPensionCredits,
  calculateRamqPremium,
  calculateFSSPremium,
  calculateGISBenefit,
  getMarginalRate,
  FED_BRACKETS,
  QC_BRACKETS,
  BASIC_PERSONAL_AMOUNT_FED,
  BASIC_PERSONAL_AMOUNT_QC,
  RRQ_MAX,
  RQAP_MAX,
  AE_MAX_QC,
  OAS_CLAWBACK_THRESHOLD_2026,
  AGE_AMOUNT_FED_2026,
  AGE_AMOUNT_FED_THRESHOLD_2026,
  PENSION_INCOME_AMOUNT_FED,
  AGE_AMOUNT_QC_2026,
  RETIREMENT_INCOME_AMOUNT_QC_2026,
  QC_LINE_361_THRESHOLD_2026,
  LIVING_ALONE_AMOUNT_QC_2026,
  FED_NONREFUNDABLE_RATE,
  QC_NONREFUNDABLE_RATE,
  FSS_THRESHOLD_ZERO,
  FSS_THRESHOLD_FLAT,
  FSS_THRESHOLD_RAMP,
  FSS_THRESHOLD_MAX,
  FSS_FLAT_AMOUNT,
  FSS_MAX_PREMIUM,
  GIS_MAX_MONTHLY_SINGLE_2026,
  GIS_MAX_MONTHLY_COUPLE_2026,
  GIS_INCOME_THRESHOLD_SINGLE,
  GIS_INCOME_THRESHOLD_COUPLE,
  GIS_CLAWBACK_RATE,
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

  it('ITEM 2b — très hauts revenus (taux moyen > 50%) : la borne haute s\'étend', () => {
    // À ces nets, le brut requis dépasse 2×net (taux moyen QC > 50%). Avec l'ancienne
    // borne figée à 2×net, le brut était sous-estimé de plusieurs milliers à >100k$.
    for (const targetNet of [600000, 1000000, 2000000]) {
      const gross = calculateGrossFromNet(targetNet);
      const netRebuilt = calculateFiscalReport(gross, 0, 0).netIncome;
      expect(Math.abs(netRebuilt - targetNet)).toBeLessThan(50);
      expect(gross).toBeGreaterThan(targetNet * 2); // preuve que la borne 2×net est dépassée
    }
  });
});
describe('[GROSSFROMNET-ANNEE-FIGEE] l’inversion suit le barème de l’ANNÉE demandée', () => {
    // ⚠️ Le défaut : `calculateGrossFromNet` inversait toujours le barème 2026 (le défaut de
    // `calculateFiscalReport`) pendant que le moteur indexait par `startYear`/`loopYear`. Dès
    // janvier 2027 le brut déduit aurait été surestimé — MESURÉ 334 à 903 $ selon le revenu, et la
    // dérive s'accumule (~2 %/an d'indexation des paliers).

    it('un barème plus TARDIF demande MOINS de brut pour le même net (paliers indexés)', () => {
        const net = 60000;
        const b2026 = calculateGrossFromNet(net, 2026);
        const b2030 = calculateGrossFromNet(net, 2030);
        // Le sens est le discriminant : indexer les paliers allège l'impôt, donc il faut MOINS de
        // brut pour atteindre le même net. Un `year` ignoré rendrait les deux STRICTEMENT égaux.
        expect(b2030).toBeLessThan(b2026);
        // ⚠️ ENCADRÉ, pas un plancher lâche : le `> 100 $` d'origine laissait passer une
        // indexation ramenée à 0,15 %/an (marge 13×). L'écart MESURÉ est 1 377 $ pour +2 %/an sur
        // 4 ans — l'encadrement teste donc vraiment le TAUX, pas juste son signe.
        expect(b2026 - b2030).toBeGreaterThan(1200);
        expect(b2026 - b2030).toBeLessThan(1600);
    });

    it('chaque année inverse VRAIMENT son propre barème (aller-retour)', () => {
        for (const year of [2026, 2027, 2030]) {
            const brut = calculateGrossFromNet(48000, year);
            const net = calculateFiscalReport(brut, 0, 0, year).netIncome;
            // Tolérance = la garantie de la dichotomie (< 1 $), jamais plus serrée.
            expect(Math.abs(net - 48000), `barème ${year}`).toBeLessThan(1);
        }
    });

    it('le défaut est NEUTRE : sans année, comportement d’avant à l’identique', () => {
        // Rétrocompat bit-identique — c'est ce qui rend le paramètre sans risque de migration.
        expect(calculateGrossFromNet(60000)).toBe(calculateGrossFromNet(60000, 2026));
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
  // §7.E.2 — Taux QC décomposés (5/10/15% féd + 14% QC = 19/24/29% combiné)
  // au lieu de l'ancienne approximation 21/26/30%.
  it('utilise le palier 19% (bracket 1) pour un retrait <= 5k$', () => {
    const r = calculateGrossWithholdingRRSP(3000);
    // 3000 / (1 - 0.19) = 3703.70$
    expect(r.gross).toBeCloseTo(3703.70, 1);
    expect(r.withholding).toBeCloseTo(703.70, 1);
    expect(r.bracket).toBe(1);
  });

  it('utilise le palier 29% (bracket 3) pour un retrait > 15k$', () => {
    const r = calculateGrossWithholdingRRSP(20000);
    // 20000 / (1 - 0.29) = 28169.01$
    expect(r.gross).toBeCloseTo(28169.01, 1);
    expect(r.bracket).toBe(3);
  });

  it('renvoie 0 pour un net non positif', () => {
    expect(calculateGrossWithholdingRRSP(0).gross).toBe(0);
    expect(calculateGrossWithholdingRRSP(-1000).gross).toBe(0);
  });

  // Couverture (audit) — bornes exactes des tranches (gross 5 000$ / 15 000$).
  // La logique borne sur le GROSS (pas le net) : on choisit le 1er palier dont
  // le gross reconstitué reste ≤ son plafond. Les valeurs net ci-dessous placent
  // le gross PILE sur la borne, puis 1$ au-dessus pour franchir la tranche.
  describe('bornes de tranche (gross 5 000$ / 15 000$)', () => {
    it('gross PILE à 5 000$ → reste bracket 1 (≤ 5 000), retenue 19% = 950$', () => {
      // net = 5000 * (1 - 0.19) = 4050 → gross = 4050 / 0.81 = 5000 exactement.
      const r = calculateGrossWithholdingRRSP(4050);
      expect(r.gross).toBeCloseTo(5000, 2);
      expect(r.bracket).toBe(1);
      expect(r.withholding).toBeCloseTo(950, 2); // 5000 × 19%
    });

    it('juste au-dessus de 5 000$ de gross → bascule bracket 2 (24%)', () => {
      const r = calculateGrossWithholdingRRSP(4051);
      // bracket 1 donnerait 4051/0.81 = 5001.2 > 5000 → on retombe sur bracket 2.
      expect(r.bracket).toBe(2);
      // gross recalculé en bracket 2 : 4051 / (1 - 0.24) = 5330.26$.
      expect(r.gross).toBeCloseTo(5330.26, 1);
      expect(r.withholding).toBeCloseTo(5330.26 * 0.24, 1);
    });

    it('milieu de bracket 2 : retenue 24%', () => {
      const r = calculateGrossWithholdingRRSP(8000);
      // 8000 / (1 - 0.24) = 10526.32$, withholding = 2526.32$.
      expect(r.bracket).toBe(2);
      expect(r.gross).toBeCloseTo(10526.32, 1);
      expect(r.withholding).toBeCloseTo(2526.32, 1);
    });

    it('gross PILE à 15 000$ → reste bracket 2 (≤ 15 000), retenue 24% = 3 600$', () => {
      // net = 15000 * (1 - 0.24) = 11400 → gross = 11400 / 0.76 = 15000 exactement.
      const r = calculateGrossWithholdingRRSP(11400);
      expect(r.gross).toBeCloseTo(15000, 2);
      expect(r.bracket).toBe(2);
      expect(r.withholding).toBeCloseTo(3600, 2); // 15000 × 24%
    });

    it('juste au-dessus de 15 000$ de gross → bascule bracket 3 (29%)', () => {
      const r = calculateGrossWithholdingRRSP(11401);
      expect(r.bracket).toBe(3);
      // gross recalculé en bracket 3 : 11401 / (1 - 0.29) = 16057.75$.
      expect(r.gross).toBeCloseTo(16057.75, 1);
      expect(r.withholding).toBeCloseTo(16057.75 * 0.29, 1);
    });
  });
});

// withholdingForGrossRRSP : INVERSE de calculateGrossWithholdingRRSP — prend un BRUT (gross) connu
// (ex. meltdown REER, FERR) et applique la retenue à la source par tranche du brut mensuel
// (RRSP_WITHHOLDING_QC : 19/24/29 %). Tranche sélectionnée directement sur le brut (≤5000, ≤15000, +).
describe('withholdingForGrossRRSP (retenue à partir du brut)', () => {
  it('brut ≤ 5 000$ → bracket 1, retenue 19 %', () => {
    const r = withholdingForGrossRRSP(3000);
    expect(r.bracket).toBe(1);
    expect(r.rate).toBeCloseTo(0.19, 5);
    expect(r.withholding).toBeCloseTo(3000 * 0.19, 5); // 570
  });

  it('borne PILE à 5 000$ → reste bracket 1 (19 %)', () => {
    const r = withholdingForGrossRRSP(5000);
    expect(r.bracket).toBe(1);
    expect(r.withholding).toBeCloseTo(5000 * 0.19, 5); // 950
  });

  it('juste au-dessus de 5 000$ → bracket 2 (24 %)', () => {
    const r = withholdingForGrossRRSP(5000.01);
    expect(r.bracket).toBe(2);
    expect(r.rate).toBeCloseTo(0.24, 5);
    expect(r.withholding).toBeCloseTo(5000.01 * 0.24, 5);
  });

  it('borne PILE à 15 000$ → reste bracket 2 (24 %)', () => {
    const r = withholdingForGrossRRSP(15000);
    expect(r.bracket).toBe(2);
    expect(r.withholding).toBeCloseTo(15000 * 0.24, 5); // 3600
  });

  it('juste au-dessus de 15 000$ → bracket 3 (29 %)', () => {
    const r = withholdingForGrossRRSP(15000.01);
    expect(r.bracket).toBe(3);
    expect(r.rate).toBeCloseTo(0.29, 5);
    expect(r.withholding).toBeCloseTo(15000.01 * 0.29, 5);
  });

  it('brut nul ou négatif → retenue 0 (garde)', () => {
    expect(withholdingForGrossRRSP(0).withholding).toBe(0);
    expect(withholdingForGrossRRSP(-1000).withholding).toBe(0);
  });
});

// Facteurs de report/anticipation des rentes — source unique (avant : dupliqués dans
// retirementIncome.ts + setupSimulation.ts). Verrouille les bornes officielles 2026 : RRQ report
// jusqu'à 72 ans (×1,588, depuis 2024), anticipation à 60 ans (×0,64) ; PSV report à 70 (×1,36).
// Cf docs/FISCAL_REFERENCE.md §6.
describe('rrqAdjustmentFactor (report/anticipation RRQ)', () => {
  it('à 65 ans (0 mois) → 1,0 (aucun ajustement)', () => {
    expect(rrqAdjustmentFactor(0)).toBeCloseTo(1.0, 10);
  });
  it('report à 70 ans (+60 mois) → 1,42', () => {
    expect(rrqAdjustmentFactor(60)).toBeCloseTo(1.42, 10);
  });
  it('report à 72 ans (+84 mois) → 1,588 (report étendu à 72 depuis 2024)', () => {
    expect(rrqAdjustmentFactor(84)).toBeCloseTo(1.588, 10);
  });
  it('report plafonné à 84 mois (72 ans) : au-delà reste 1,588', () => {
    expect(rrqAdjustmentFactor(96)).toBeCloseTo(1.588, 10);
  });
  it('anticipation 5 ans (−60 mois, = 60 ans) → 0,64', () => {
    expect(rrqAdjustmentFactor(-60)).toBeCloseTo(0.64, 10);
  });
  it('anticipation plafonnée à −60 mois : en deçà reste 0,64', () => {
    expect(rrqAdjustmentFactor(-72)).toBeCloseTo(0.64, 10);
  });
});

describe('psvDeferralFactor (report PSV, pas d\'anticipation)', () => {
  it('à 65 ans ou avant → 1,0 (la PSV ne s\'anticipe pas)', () => {
    expect(psvDeferralFactor(0)).toBeCloseTo(1.0, 10);
    expect(psvDeferralFactor(-24)).toBeCloseTo(1.0, 10);
  });
  it('report 5 ans (+60 mois, = 70 ans) → 1,36', () => {
    expect(psvDeferralFactor(60)).toBeCloseTo(1.36, 10);
  });
  it('report plafonné à 60 mois : au-delà reste 1,36', () => {
    expect(psvDeferralFactor(72)).toBeCloseTo(1.36, 10);
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

  it('ITEM 2d — progressiveGrossTax override remplace le calcul plat (gross-up × marginal)', () => {
    // Majoré = 10000 × 1.38 = 13800. CID éligible = 13800 × (CID_féd_effectif + CID_QC).
    // [FISC-DTC-ABATEMENT-ORDER] Le CID FÉDÉRAL vaut (1 − 16,5 %) au Québec : c'est un crédit
    // non remboursable fédéral, soustrait AVANT l'abattement (comme BPA et crédits d'âge), donc
    // sa valeur effective est réduite d'autant. Le retrancher à 100 % le sur-créditait.
    // DISCRIMINANT : sur le code d'avant, `cid` valait 3686,33 et cette assertion échoue.
    const cid = 13800 * (0.150198 * (1 - QC_FEDERAL_ABATEMENT_RATE) + 0.117);
    const flat = calculateDividendTax(10000, 0.40, 'eligible');
    // Override : impôt brut progressif imposé (6000) → tax = 6000 − CID.
    const prog = calculateDividendTax(10000, 0.40, 'eligible', 6000);
    expect(prog).toBeCloseTo(6000 - cid, 2);
    expect(prog).toBeGreaterThan(flat);
    // Override nul/négatif → clampé (jamais d'impôt négatif).
    expect(calculateDividendTax(10000, 0.40, 'eligible', 0)).toBe(0);
  });
});

describe('getMarginalRate', () => {
  it('GUARD-NAN : un income NON FINI est rabattu sur le 1er palier, pas sur le taux MAX', () => {
    // Avant la garde : NaN ne matche aucun palier → fallback `|| 0.33` = taux fédéral MAX (silencieux).
    // Après : Number.isFinite faux → safeIncome=0 → 1er palier (= taux d'un revenu nul, le plus bas).
    const lowest = getMarginalRate(0);
    const max = getMarginalRate(1_000_000);
    for (const bad of [NaN, Infinity, -Infinity]) {
      const r = getMarginalRate(bad);
      expect(Number.isFinite(r)).toBe(true);
      expect(r).toBe(lowest);   // dégradation prévisible (1er palier), pas le taux max
      expect(r).toBeLessThan(max);
    }
  });

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

  it('RRQ max 2026 ≈ 4 479,30$ (taux 6,30% x (MGA 74 600 - exemption 3 500))', () => {
    // Vérifié 2026-05 (Revenu Québec) : taux 6,30% (5,30% base + 1% volet 1), MGA 74 600$
    expect(RRQ_MAX).toBeCloseTo(4479.30, 2);
  });

  it('RQAP max 2026 = 442,90 $', () => {
    expect(RQAP_MAX).toBeCloseTo(442.90, 2);
  });

  it('AE QC max 2026 = 895,70 $', () => {
    expect(AE_MAX_QC).toBeCloseTo(895.70, 2);
  });

  it('Seuil recuperation PSV (OAS clawback) 2026 = 95323', () => {
    expect(OAS_CLAWBACK_THRESHOLD_2026).toBe(95323);
  });

  it('Credit age federal (ligne 30100) 2026 = 9208, seuil 46432', () => {
    expect(AGE_AMOUNT_FED_2026).toBe(9208);
    expect(AGE_AMOUNT_FED_THRESHOLD_2026).toBe(46432);
  });

  it('Montant en raison de l age Quebec (ligne 361) 2026 = 3986', () => {
    expect(AGE_AMOUNT_QC_2026).toBe(3986);
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
    // Revenu sous le seuil unique 2026 (42 955$) pour exclure la réduction.
    const incomeBelowAllThresholds = 20000;
    const at64 = calculateAgeAndPensionCredits({ age: 64, eligiblePensionIncome: 0, familyIncome: incomeBelowAllThresholds }, incomeBelowAllThresholds);
    const at65 = calculateAgeAndPensionCredits({ age: 65, eligiblePensionIncome: 0, familyIncome: incomeBelowAllThresholds }, incomeBelowAllThresholds);
    expect(at64.fedCredit).toBe(0);
    expect(at64.qcCredit).toBe(0);
    expect(at65.fedCredit).toBeCloseTo(AGE_AMOUNT_FED_2026 * FED_NONREFUNDABLE_RATE, 2);
    // Solo (pas de conjoint) : âge + « personne vivant seule » (pension = 0 → composante retraite nulle).
    expect(at65.qcCredit).toBeCloseTo((AGE_AMOUNT_QC_2026 + LIVING_ALONE_AMOUNT_QC_2026) * QC_NONREFUNDABLE_RATE, 2);
  });

  it('age 65+ sans pension : crédit âge actif, composante pension QC nulle', () => {
    const { fedCredit, qcCredit } = calculateAgeAndPensionCredits(
      { age: 68, eligiblePensionIncome: 0, hasSpouse: false, familyIncome: 25000 },
      25000,
    );
    expect(fedCredit).toBeCloseTo(AGE_AMOUNT_FED_2026 * FED_NONREFUNDABLE_RATE, 2);
    // Composante revenu retraite QC = 0 (pension = 0) ; solo → montant « personne vivant seule » inclus.
    expect(qcCredit).toBeCloseTo((AGE_AMOUNT_QC_2026 + LIVING_ALONE_AMOUNT_QC_2026) * QC_NONREFUNDABLE_RATE, 2);
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

  // [FISC-PENSION-CREDIT-REAL] (GO Marc A3, 2026-08-20) — le montant fédéral est GELÉ à
  // 2 000 $ NOMINAUX : en espace RÉEL (realDeflator > 1) il doit DÉCROÎTRE en 1/realDeflator.
  // Avant le fix c'était l'unique terme du barème réel traité à plat (sweep 1 920 cas, #556).
  describe('[FISC-PENSION-CREDIT-REAL] crédit pension fédéral en espace réel', () => {
    // Composante pension isolée par DIFFÉRENCE (avec vs sans pension) — le crédit d'âge s'annule.
    const pensionComponent2 = (pension: number, deflator: number): number => {
      const { fedCredit: avec } = calculateAgeAndPensionCredits(
        { age: 70, eligiblePensionIncome: pension }, 40000, 2046, deflator);
      const { fedCredit: sans } = calculateAgeAndPensionCredits(
        { age: 70, eligiblePensionIncome: 0 }, 40000, 2046, deflator);
      return avec - sans;
    };
    const pensionComponent = (year: number, deflator: number): number => {
      const { fedCredit: avec } = calculateAgeAndPensionCredits(
        { age: 70, eligiblePensionIncome: 10000 }, 40000, year, deflator);
      const { fedCredit: sans } = calculateAgeAndPensionCredits(
        { age: 70, eligiblePensionIncome: 0 }, 40000, year, deflator);
      return avec - sans;
    };

    it('NOMINAL (realDeflator = 1) : strictement l\'ancien comportement, 2 000 × 15 %', () => {
      expect(pensionComponent(2046, 1)).toBeCloseTo(300, 6);
    });

    it('RÉEL à 20 ans (deflator 1,02^20) : le montant gelé vaut 1 345,94 $ réels → crédit 201,89 $', () => {
      // MESURÉ (pas déduit) : 2 000 / 1,02^20 × 15 % = 201,8915… — l'ancien code rendait 300,00
      // (2 000 réels constants = sous-imposition ≤ 250,50 $/pers/an, sens NON conservateur).
      const deflator = Math.pow(1.02, 20);
      expect(pensionComponent(2046, deflator)).toBeCloseTo(201.89, 2);
      expect(pensionComponent(2046, deflator)).not.toBeCloseTo(300, 0); // ancre négative : l'à-plat
    });

    it('ZONE DE BASCULE : pension entre le montant déflaté et le montant nominal (discriminant)', () => {
      // [Revue #680] Le premier jet testait pension 800 $ < LES DEUX caps — vert avant ET après,
      // non discriminant. La vraie frontière du fix : pension STRICTEMENT entre 2 000/d et 2 000.
      // À d = 2, pension 1 500 $ : nouveau = min(1 000, 1 500) × 15 % = 150 ; l'ANCIEN code
      // rendait min(2 000, 1 500) × 15 % = 225 (mesuré, ancre négative).
      expect(pensionComponent2(1500, 2)).toBeCloseTo(150, 6);
      expect(pensionComponent2(1500, 2)).not.toBeCloseTo(225, 0);
    });

    it('deflator corrompu (0 / NaN / négatif) → repli sur 1, jamais Infinity ni NaN', () => {
      // [Revue #680, 3 agents] La garde de getIndexedBracketsForYear est reprise À CE SITE :
      // sans elle, 2000/0 = Infinity → min(Infinity, pension) crédite la pension ENTIÈRE — un
      // nombre FINI plausible qu'aucune garde aval ne voit (incident inflationFactor = 0 documenté
      // au dépôt). NB : bracketRealIndex.test passe NaN mais SANS ageOpts — cette ligne n'était
      // exercée par AUCUN test de corruption.
      for (const bad of [0, Number.NaN, -1]) {
        expect(pensionComponent2(10000, bad)).toBeCloseTo(300, 6); // = nominal (repli sur 1)
      }
    });
  });

  it('applique la ligne 361 QC à plein pour 65+ sous le seuil sans conjoint (montant vivant seul inclus)', () => {
    const familyIncome = QC_LINE_361_THRESHOLD_2026 - 1000;
    const pension = RETIREMENT_INCOME_AMOUNT_QC_2026;
    const { qcCredit } = calculateAgeAndPensionCredits(
      { age: 70, eligiblePensionIncome: pension, hasSpouse: false, familyIncome },
      familyIncome,
    );
    // Solo 65+ sous le seuil : âge + revenu de retraite + « personne vivant seule », aucune réduction.
    const expectedAmount = AGE_AMOUNT_QC_2026 + RETIREMENT_INCOME_AMOUNT_QC_2026 + LIVING_ALONE_AMOUNT_QC_2026;
    expect(qcCredit).toBeCloseTo(expectedAmount * QC_NONREFUNDABLE_RATE, 2);
  });

  it('TP1G-VIVANT-SEUL : le solo (vivant seul) obtient PLUS de crédit que le couple au même revenu', () => {
    // Sous le seuil UNIQUE 2026 (aucune réduction), le solo gagne le montant « personne vivant seule »
    // (2 172 × 14 % ≈ 304 $) que le couple n'a pas → l'ancienne assertion (withSpouse > noSpouse, via un
    // seuil couple plus haut) s'INVERSE : c'est le montant vivant seul qui domine désormais.
    const familyIncome = QC_LINE_361_THRESHOLD_2026 - 1000;
    const { qcCredit: withSpouse } = calculateAgeAndPensionCredits(
      { age: 70, eligiblePensionIncome: 3000, hasSpouse: true, familyIncome },
      familyIncome,
    );
    const { qcCredit: noSpouse } = calculateAgeAndPensionCredits(
      { age: 70, eligiblePensionIncome: 3000, hasSpouse: false, familyIncome },
      familyIncome,
    );
    expect(noSpouse).toBeGreaterThan(withSpouse);
    expect(noSpouse - withSpouse).toBeCloseTo(LIVING_ALONE_AMOUNT_QC_2026 * QC_NONREFUNDABLE_RATE, 2);
  });

  it('réduit la ligne 361 QC de 18.75% du revenu excédentaire (montant vivant seul inclus)', () => {
    const excess = 10000;
    const familyIncome = QC_LINE_361_THRESHOLD_2026 + excess;
    const { qcCredit } = calculateAgeAndPensionCredits(
      { age: 70, eligiblePensionIncome: RETIREMENT_INCOME_AMOUNT_QC_2026, hasSpouse: false, familyIncome },
      familyIncome,
    );
    const grossLine361 = AGE_AMOUNT_QC_2026 + RETIREMENT_INCOME_AMOUNT_QC_2026 + LIVING_ALONE_AMOUNT_QC_2026;
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

  it('annule exactement le crédit ligne 361 QC bien au-dessus du seuil familial (assertion stricte)', () => {
    // Sous le seuil UNIQUE 2026 (42 955) + montant vivant seul, l'extinction QC recule à ~92 k$ :
    // grossLine361 = 3 986 + 3 058 + 2 172 = 9 216 ; extinction à 42 955 + 9 216/0,1875 ≈ 92 107$.
    // À 100 000$ : excès = 57 045 × 18,75% = 10 696 >> 9 216 → qcCredit = max(0, …) × 14% = 0.
    const { qcCredit, fedCredit } = calculateAgeAndPensionCredits(
      { age: 70, eligiblePensionIncome: 80000, hasSpouse: false, familyIncome: 100000 },
      100000,
    );
    expect(qcCredit).toBe(0);
    // Le crédit fédéral âge est quasi éteint à 100 000$ ; il reste surtout le crédit pension.
    expect(fedCredit).toBeGreaterThan(250);
    expect(fedCredit).toBeLessThan(600);
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
    // Re-baseline TP1G-VIVANT-SEUL : à 30 000$ (< seuil unique 42 955), la ligne 361 n'est PAS réduite
    // et inclut le montant « personne vivant seule » (2 172$) → crédit QC plus élevé → impôt ~299$
    // (avant : ~690$, ligne 361 réduite + sans vivant seul). Baisse VOULUE d'un crédit plus généreux au solo.
    expect(r.totalTax).toBeGreaterThan(150);
    expect(r.totalTax).toBeLessThan(500);
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
      { revenu: 0, gains: 0, divers: 0, reer: 0, donCredit: 0 },
    );
    expect(result.newTaxCurrentYear.divers).toBeGreaterThan(0);
    expect(result.logs.some(l => l.includes('RAMQ'))).toBe(true);
  });

  it('exempte la prime RAMQ si ramqExempt = true (couverture privée)', () => {
    const result = processDecemberTaxFiling(
      11,
      { ...baseCtx, ramqExempt: true, childrenCount: 0 },
      helpers,
      { revenu: 0, gains: 0, divers: 0, reer: 0, donCredit: 0 },
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
      { revenu: 0, gains: 0, divers: 0, reer: 0, donCredit: 0 },
    );
    // Pas de prime RAMQ car revenu net (10k$) < seuil exemption (19 500$)
    expect(result.logs.some(l => l.includes('RAMQ'))).toBe(false);
  });
});

// ----------------------------------------------------------------------------
// §6.1 — FSS : Cotisation au Fonds des services de santé (ligne 446)
// Source: Revenu Québec Annexe F
// ----------------------------------------------------------------------------
describe('calculateFSSPremium (§6.1)', () => {
  // FA-8 (2026-06-11) — barème FSS 2026 (18 500/33 500/64 355/149 355, Revenu Québec/CFFP).
  // Tests paramétriques sur les constantes : ils suivent FISCAL_REFERENCE §5.
  it('renvoie 0 sous le seuil minimum (< 18 500$)', () => {
    expect(calculateFSSPremium(10000)).toBe(0);
    expect(calculateFSSPremium(FSS_THRESHOLD_ZERO - 1)).toBe(0);
  });

  it('applique 1% sur tranche 18 500 - 33 500$', () => {
    // Revenu 25 000$ : excès = 25 000 - 18 500 = 6 500$ × 1% = 65.00$
    const excess = 25000 - FSS_THRESHOLD_ZERO;
    expect(calculateFSSPremium(25000)).toBeCloseTo(excess * 0.01, 2);
  });

  it('applique 150$ fixe entre 33 500$ et 64 355$', () => {
    expect(calculateFSSPremium(40000)).toBe(FSS_FLAT_AMOUNT);
    expect(calculateFSSPremium(60000)).toBe(FSS_FLAT_AMOUNT);
  });

  it('applique 150$ + 1% sur tranche 64 355 - 149 355$', () => {
    // Revenu 80 000$ : 150 + (80 000 - 64 355) × 1% = 150 + 156.45 = 306.45$
    const excess = 80000 - FSS_THRESHOLD_RAMP;
    expect(calculateFSSPremium(80000)).toBeCloseTo(FSS_FLAT_AMOUNT + excess * 0.01, 2);
  });

  it('plafonne à 1 000$ pour revenus élevés (≥ 149 355$)', () => {
    expect(calculateFSSPremium(200000)).toBe(FSS_MAX_PREMIUM);
    expect(calculateFSSPremium(FSS_THRESHOLD_MAX)).toBeCloseTo(FSS_MAX_PREMIUM, 0);
  });

  it('frontière exacte seuil zéro (18 500$) → 0', () => {
    expect(calculateFSSPremium(FSS_THRESHOLD_ZERO)).toBe(0);
  });

  it('frontière exacte seuil flat (33 500$) → 150$', () => {
    // À 33 500$ exactement, on est au passage du palier 1% au palier 150$ fixe.
    // Le code utilise <=, donc 33 500$ donne (33 500 - 18 500) × 1% = 150$ exactement.
    expect(calculateFSSPremium(FSS_THRESHOLD_FLAT)).toBeCloseTo(FSS_FLAT_AMOUNT, 0);
  });

  it('frontière exacte seuil ramp (64 355$) → 150$', () => {
    expect(calculateFSSPremium(FSS_THRESHOLD_RAMP)).toBeCloseTo(FSS_FLAT_AMOUNT, 0);
  });

  it('guard NaN/Infinity/négatif → 0', () => {
    expect(calculateFSSPremium(NaN)).toBe(0);
    expect(calculateFSSPremium(Infinity)).toBe(0);
    expect(calculateFSSPremium(-1000)).toBe(0);
  });

  it('indexation par année — seuils augmentent en 2030 vs 2026', () => {
    // Revue FA-8 (m3) — revenu 21 000$ : AU-DESSUS du seuil zéro dans les DEUX années
    // (2026 : 18 500$ ; 2030 indexé ≈ 20 025$) → deux cotisations POSITIVES prouvant
    // l'indexation progressive (robuste à un léger changement d'hypothèse d'indexation).
    const p2026 = calculateFSSPremium(21000, 2026);
    const p2030 = calculateFSSPremium(21000, 2030);
    expect(p2026).toBeGreaterThan(0);
    expect(p2030).toBeGreaterThan(0);
    expect(p2030).toBeLessThan(p2026);
  });
});

describe('processDecemberTaxFiling intègre FSS §6.1', () => {
  const retiredCtx = {
    m: 12,
    loopYear: 2026,
    isRetired: true,
    enableMonteCarlo: false,
    yearsElapsed: 5,
    inflationFactor: 1,
    activeUsersCount: 1,
    grossMarcBaseAnnual: 0,
    grossAnnaBaseAnnual: 0,
    simSalaryGrowth: 0,
    optimizeSourceDeductions: false,
    incomeRetirementMonthly: 4000,  // 48 000$/an → palier flat FSS 150$
    nonReg: 0,
    baseNonRegRate: 0,
    accRrspYear: 0,
    accFhsaYear: 0,
    smithInterestDeductibleYear: 0,
    accRentesYear: 0,
    accRetraitsReerYear: 0,
    accCapitalGainsYear: 0,
    ramqExempt: true,  // isoler le test FSS sans bruit RAMQ
  };
  const helpers2 = {
    calculateFiscalReport: calcReport,
    getMarginalRate: getMarg,
    calculateDividendTax: calcDiv,
  };

  it('applique la cotisation FSS pour un retraité avec revenu > seuil', () => {
    const result = processDecemberTaxFiling(
      11,
      retiredCtx,
      helpers2,
      { revenu: 0, gains: 0, divers: 0, reer: 0, donCredit: 0 },
    );
    expect(result.newTaxCurrentYear.divers).toBeGreaterThan(0);
    expect(result.logs.some(l => l.includes('FSS'))).toBe(true);
  });

  it('aucune FSS pour un retraité sous le seuil', () => {
    const result = processDecemberTaxFiling(
      11,
      { ...retiredCtx, incomeRetirementMonthly: 1000 },  // 12k$ < 18 500$ (FSS_THRESHOLD_ZERO 2026)
      helpers2,
      { revenu: 0, gains: 0, divers: 0, reer: 0, donCredit: 0 },
    );
    expect(result.logs.some(l => l.includes('FSS'))).toBe(false);
  });

  it('aucune FSS pour un actif (mode salarié couvert par employeur)', () => {
    const result = processDecemberTaxFiling(
      11,
      {
        ...retiredCtx,
        isRetired: false,
        incomeRetirementMonthly: 0,
        grossMarcBaseAnnual: 60000,  // revenu actif élevé
      },
      helpers2,
      { revenu: 0, gains: 0, divers: 0, reer: 0, donCredit: 0 },
    );
    // Mode actif → pas de FSS individuel
    expect(result.logs.some(l => l.includes('FSS'))).toBe(false);
  });
});

// ----------------------------------------------------------------------------
// §6.3 — SRG (Supplément de revenu garanti)
// Source: Service Canada, barème Q1 2026
// ----------------------------------------------------------------------------
describe('calculateGISBenefit (§6.3)', () => {
  it('verse le maximum célibataire si revenu autre = 0', () => {
    expect(calculateGISBenefit(0, false)).toBeCloseTo(GIS_MAX_MONTHLY_SINGLE_2026, 1);
  });

  it('verse le maximum couple par adulte si revenu = 0', () => {
    expect(calculateGISBenefit(0, true)).toBeCloseTo(GIS_MAX_MONTHLY_COUPLE_2026, 1);
  });

  it('clawback 50% : revenu 12 000$/an réduit SRG mensuel de 500$', () => {
    // 12 000 × 50% / 12 = 500$/mois de réduction
    const reduced = calculateGISBenefit(12000, false);
    const expected = GIS_MAX_MONTHLY_SINGLE_2026 - 500;
    expect(reduced).toBeCloseTo(expected, 1);
  });

  it('annule SRG au-delà du seuil célibataire (22 512$)', () => {
    expect(calculateGISBenefit(GIS_INCOME_THRESHOLD_SINGLE, false)).toBe(0);
    expect(calculateGISBenefit(30000, false)).toBe(0);
  });

  it('annule SRG au-delà du seuil couple combiné (29 760$)', () => {
    expect(calculateGISBenefit(GIS_INCOME_THRESHOLD_COUPLE, true)).toBe(0);
    expect(calculateGISBenefit(40000, true)).toBe(0);
  });

  it('couple paie moins par adulte que célibataire au même revenu', () => {
    const single = calculateGISBenefit(10000, false);
    const couple = calculateGISBenefit(10000, true);
    expect(couple).toBeLessThan(single);
  });

  it('guard NaN/Infinity/négatif → 0', () => {
    expect(calculateGISBenefit(NaN, false)).toBe(0);
    expect(calculateGISBenefit(Infinity, false)).toBe(0);
    expect(calculateGISBenefit(-1000, false)).toBe(0);
  });

  it('guard entrées invalides — valeurs exactes spec : NaN célibataire, Infinity couple, -1 célibataire', () => {
    // Garde ligne 395 : !Number.isFinite(otherIncomeAnnual) || otherIncomeAnnual < 0
    // Indépendante de hasSpouseWithOAS → Infinity doit retourner 0 quelle que soit la modalité.
    expect(calculateGISBenefit(NaN, false)).toBe(0);       // NaN célibataire
    expect(calculateGISBenefit(Infinity, true)).toBe(0);   // Infinity couple (spec)
    expect(calculateGISBenefit(-1, false)).toBe(0);        // négatif strict (1$ de moins que 0)
  });

  it('cohérence — clawback rate exposé à 50%', () => {
    expect(GIS_CLAWBACK_RATE).toBe(0.50);
  });

  it('indexation par année — max augmente en 2030 vs 2026', () => {
    const max2026 = calculateGISBenefit(0, false, 2026);
    const max2030 = calculateGISBenefit(0, false, 2030);
    expect(max2030).toBeGreaterThan(max2026);
  });
});
