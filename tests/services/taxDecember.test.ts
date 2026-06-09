// tests/services/taxDecember.test.ts
//
// Tests de CARACTÉRISATION du module fiscal le plus dense du moteur :
// services/projection/taxDecember.ts (money-critical, aucun test direct avant).
//
// Objectif : figer le comportement ACTUEL (non-régression), pas un idéal
// théorique. On privilégie des INVARIANTS robustes (signes, monotonie, seuils)
// + quelques valeurs PINNÉES déterministes.
//
// Les 3 helpers de processDecemberTaxFiling (calculateFiscalReport,
// getMarginalRate, calculateDividendTax) sont INJECTÉS → on les STUB pour des
// montants exacts indépendants des tables fiscales réelles.
// RAMQ et FSS utilisent les VRAIES fonctions (calculateRamqPremium /
// calculateFSSPremium, non injectées). En 2026 l'inflationFactor = 1, donc les
// seuils valent leur valeur de base — les bornes choisies sont donc fiables.

import { describe, it, expect } from 'vitest';
import {
    computeOasClawback,
    processTaxLossHarvesting,
    processDecemberTaxFiling,
    type DecemberContext,
    type DecemberHelpers,
} from '../../services/projection/taxDecember';
import {
    OAS_CLAWBACK_THRESHOLD_2026,
    CAPITAL_GAINS_INCLUSION_STANDARD,
    RAMQ_EXEMPTION_SINGLE_2026,
    FSS_THRESHOLD_ZERO,
    FSS_THRESHOLD_FLAT,
    calculateFiscalReport,
    getMarginalRate,
    calculateDividendTax,
    getDividendGrossUpRate,
    type FiscalReport,
} from '../../utils/tax';

const DECEMBER = 11; // currentMonthIndex de décembre

// ──────────────────────────────────────────────────────────────────────────
// computeOasClawback — récupération PSV prévue (annuelle)
// ──────────────────────────────────────────────────────────────────────────

describe('computeOasClawback — gate « décembre, m>0, retraité 65+ »', () => {
    it('mois ≠ décembre → clawback nul', () => {
        const r = computeOasClawback(5, 24, true, 70, 1, 200000, 0, 0, 800, 0);
        expect(r.clawbackAnnual).toBe(0);
        expect(r.logMsg).toBeUndefined();
    });

    it('m === 0 (tout premier mois) → clawback nul', () => {
        const r = computeOasClawback(DECEMBER, 0, true, 70, 1, 200000, 0, 0, 800, 0);
        expect(r.clawbackAnnual).toBe(0);
    });

    it('non-retraité → clawback nul même au-dessus du seuil', () => {
        const r = computeOasClawback(DECEMBER, 24, false, 70, 1, 200000, 0, 0, 800, 0);
        expect(r.clawbackAnnual).toBe(0);
    });

    it('âge < 65 → clawback nul même au-dessus du seuil', () => {
        const r = computeOasClawback(DECEMBER, 24, true, 60, 1, 200000, 0, 0, 800, 0);
        expect(r.clawbackAnnual).toBe(0);
    });
});

describe('computeOasClawback — seuil de revenu de pension', () => {
    it('SOUS le seuil → clawback nul', () => {
        // revenu pension annuel = 5000 × 12 = 60 000 < 95 323
        const r = computeOasClawback(DECEMBER, 24, true, 70, 1, 5000, 0, 0, 800, 0);
        expect(r.clawbackAnnual).toBe(0);
    });

    it('exactement AU seuil → clawback nul (comparaison <=)', () => {
        // incomeRetirementMonthly × 12 = seuil exact, accRetraits/accRentes = 0
        const monthly = OAS_CLAWBACK_THRESHOLD_2026 / 12;
        const r = computeOasClawback(DECEMBER, 24, true, 70, 1, monthly, 0, 0, 800, 0);
        expect(r.clawbackAnnual).toBe(0);
    });

    it('AU-DESSUS du seuil → clawback strictement positif + log d\'avertissement', () => {
        // 10 000 × 12 = 120 000 > 95 323 → excès ~24 677 × 15% ~3702, plafonné par psv (9600)
        const r = computeOasClawback(DECEMBER, 24, true, 70, 1, 10000, 0, 0, 800, 0);
        expect(r.clawbackAnnual).toBeGreaterThan(0);
        expect(r.logMsg).toContain('PSV Clawback');
    });

    it('clawback PINNÉ = 15% de l\'excès quand sous le plafond PSV', () => {
        // m=24, simInflation absente côté appel ⇒ on passe 0 pour figer psvAnnualBase = 800×12 = 9600.
        // revenu pension = 8000×12 = 96 000 → excès = 96 000 - 95 323 = 677 → 15% = 101.55
        const r = computeOasClawback(DECEMBER, 24, true, 70, 1, 8000, 0, 0, 800, 0);
        const excess = 96000 - OAS_CLAWBACK_THRESHOLD_2026;
        expect(r.clawbackAnnual).toBeCloseTo(excess * 0.15, 5);
    });

    it('clawback PLAFONNÉ par la PSV de base (min(psvAnnual, excès×15%))', () => {
        // revenu pension très élevé (50 000×12 = 600 000) → excès×15% ≫ psv.
        // psvAnnualBase = 500 × 12 × (1+0)^... = 6000 → clawback plafonné à 6000.
        const r = computeOasClawback(DECEMBER, 24, true, 70, 1, 50000, 0, 0, 500, 0);
        expect(r.clawbackAnnual).toBeCloseTo(6000, 5);
    });

    it('monotone : revenu de pension ↑ → clawback ↑ (jusqu\'au plafond)', () => {
        const low = computeOasClawback(DECEMBER, 24, true, 70, 1, 8500, 0, 0, 5000, 0).clawbackAnnual;
        const high = computeOasClawback(DECEMBER, 24, true, 70, 1, 9000, 0, 0, 5000, 0).clawbackAnnual;
        expect(high).toBeGreaterThan(low);
    });

    it('agrège revenu mensuel + retraits REER + rentes pour franchir le seuil', () => {
        // mensuel seul = 60 000 < seuil, mais + 50 000 retraits + 10 000 rentes = 120 000 > seuil
        const r = computeOasClawback(DECEMBER, 24, true, 70, 1, 5000, 50000, 10000, 5000, 0);
        expect(r.clawbackAnnual).toBeGreaterThan(0);
    });

    it('seuil indexé par l\'inflation NOMINALE du revenu (simInflation), PAS expenseMultiplier', () => {
        // BONUS FIX (Marc, 2026-06) — le seuil PSV suit désormais l'inflation nominale du
        // revenu (Math.pow(1+simInflation/100, m/12)), pas l'inflation des dépenses.
        // Preuve 1 : expenseMultiplier n'a plus AUCUN effet (5e arg), à simInflation égal.
        const mult1 = computeOasClawback(DECEMBER, 24, true, 70, 1.0, 100000 / 12, 0, 0, 5000, 0);
        const mult2 = computeOasClawback(DECEMBER, 24, true, 70, 1.2, 100000 / 12, 0, 0, 5000, 0);
        expect(mult2.clawbackAnnual).toBeCloseTo(mult1.clawbackAnnual, 5);

        // Preuve 2 : c'est bien simInflation (dernier arg) qui relève le seuil.
        // revenu nominal = 100 000. Sans inflation (seuil 95 323) → clawback > 0.
        // Avec simInflation=10 % sur m=24 (2 ans) → seuil ≈ 95 323 × 1.21 ≈ 115 341 > 100 000 → nul.
        const noInfl = computeOasClawback(DECEMBER, 24, true, 70, 1, 100000 / 12, 0, 0, 5000, 0);
        const withInfl = computeOasClawback(DECEMBER, 24, true, 70, 1, 100000 / 12, 0, 0, 5000, 10);
        expect(noInfl.clawbackAnnual).toBeGreaterThan(0);
        expect(withInfl.clawbackAnnual).toBe(0);
    });
});

// ──────────────────────────────────────────────────────────────────────────
// processTaxLossHarvesting — cristallisation de perte (décembre)
// ──────────────────────────────────────────────────────────────────────────

describe('processTaxLossHarvesting — gate & déclencheurs', () => {
    it('mois ≠ décembre → rien', () => {
        const r = processTaxLossHarvesting(5, 24, 100000, 80000, -20);
        expect(r).toEqual({ harvestedLoss: 0, acbDelta: 0 });
    });

    it('m === 0 → rien', () => {
        const r = processTaxLossHarvesting(DECEMBER, 0, 100000, 80000, -20);
        expect(r).toEqual({ harvestedLoss: 0, acbDelta: 0 });
    });

    it('rendement Non-Reg POSITIF → pas de récolte (rien à cristalliser)', () => {
        const r = processTaxLossHarvesting(DECEMBER, 24, 100000, 80000, +12);
        expect(r.harvestedLoss).toBe(0);
        expect(r.logMsg).toBeUndefined();
    });

    it('rendement nul → pas de récolte', () => {
        const r = processTaxLossHarvesting(DECEMBER, 24, 100000, 80000, 0);
        expect(r.harvestedLoss).toBe(0);
    });

    it('solde Non-Reg nul ou négatif → pas de récolte', () => {
        const r = processTaxLossHarvesting(DECEMBER, 24, 0, 0, -20);
        expect(r.harvestedLoss).toBe(0);
    });

    it('rendement NÉGATIF avec solde positif → récolte positive + log', () => {
        const r = processTaxLossHarvesting(DECEMBER, 24, 100000, 80000, -20);
        expect(r.harvestedLoss).toBeGreaterThan(0);
        expect(r.logMsg).toContain('TLH');
    });

    it('perte récoltée PINNÉE = (solde × 50%) × |taux| / 100', () => {
        // fakeSell = 100 000 × 0.5 = 50 000 ; dropRate = 0.20 → harvestedLoss = 10 000
        const r = processTaxLossHarvesting(DECEMBER, 24, 100000, 80000, -20);
        expect(r.harvestedLoss).toBeCloseTo(50000 * 0.20, 5);
    });

    it('perte plus profonde → récolte plus grande (monotone en |taux|)', () => {
        const shallow = processTaxLossHarvesting(DECEMBER, 24, 100000, 80000, -10).harvestedLoss;
        const deep = processTaxLossHarvesting(DECEMBER, 24, 100000, 80000, -30).harvestedLoss;
        expect(deep).toBeGreaterThan(shallow);
    });

    it('acbDelta PINNÉ avec ACB ≥ solde (proportion plafonnée à 1)', () => {
        // proportion = min(1, 80000/100000)=0.8 ; fakeSell=50000 ; dropRate=0.2
        // acbDelta = -(50000×0.8) + 50000×(1-0.2) = -40000 + 40000 = 0
        const r = processTaxLossHarvesting(DECEMBER, 24, 100000, 80000, -20);
        expect(r.acbDelta).toBeCloseTo(0, 5);
    });
});

// ──────────────────────────────────────────────────────────────────────────
// processDecemberTaxFiling — régularisation annuelle d'impôt
// ──────────────────────────────────────────────────────────────────────────

// Stub déterministe : impôt = 25% du brut réel ; retenue = même 25%.
// getMarginalRate fixe à 40% ; calculateDividendTax = div × marginal.
const STUB_RATE = 0.25;
const STUB_MARGINAL = 0.40;

const makeHelpers = (overrides: Partial<DecemberHelpers> = {}): DecemberHelpers => ({
    // Impôt = taux × (brut - déductions). On lit le 2e arg (deductions) pour que
    // l'effet T1213 (retenue avec vs sans déductions) soit réellement discriminant.
    calculateFiscalReport: ((gross: number, deductions: number) =>
        ({ totalTax: Math.max(0, gross - (deductions ?? 0)) * STUB_RATE } as unknown as FiscalReport)) as DecemberHelpers['calculateFiscalReport'],
    getMarginalRate: () => STUB_MARGINAL,
    calculateDividendTax: (annualDiv: number, marginalRate: number) => annualDiv * marginalRate,
    ...overrides,
});

const ZERO_TAX = { revenu: 0, gains: 0, divers: 0, reer: 0 };

const baseCtx = (o: Partial<DecemberContext> = {}): DecemberContext => ({
    m: 24,
    loopYear: 2026,
    isRetired: false,
    enableMonteCarlo: false,
    yearsElapsed: 0,
    inflationFactor: 1,
    activeUsersCount: 1,
    grossMarcBaseAnnual: 0,
    grossAnnaBaseAnnual: 0,
    simSalaryGrowth: 0,
    optimizeSourceDeductions: undefined,
    incomeRetirementMonthly: 0,
    nonReg: 0,
    baseNonRegRate: 0,
    accRrspYear: 0,
    accFhsaYear: 0,
    smithInterestDeductibleYear: 0,
    accRentesYear: 0,
    accRetraitsReerYear: 0,
    accCapitalGainsYear: 0,
    age: 40,
    childrenCount: 0,
    ramqExempt: true, // par défaut on neutralise RAMQ pour isoler les autres blocs
    ...o,
});

describe('processDecemberTaxFiling — gate « décembre, m>0 »', () => {
    it('mois ≠ décembre → renvoie l\'état initial inchangé, aucun log', () => {
        const init = { revenu: 123, gains: 45, divers: 6, reer: 7 };
        const r = processDecemberTaxFiling(5, baseCtx(), makeHelpers(), init);
        expect(r.newTaxCurrentYear).toEqual(init);
        expect(r.logs).toEqual([]);
    });

    it('m === 0 → renvoie l\'état initial inchangé', () => {
        const init = { revenu: 123, gains: 45, divers: 6, reer: 7 };
        const r = processDecemberTaxFiling(DECEMBER, baseCtx({ m: 0 }), makeHelpers(), init);
        expect(r.newTaxCurrentYear).toEqual(init);
        expect(r.logs).toEqual([]);
    });

    it('ne mute pas l\'objet taxCurrentYear initial (immutabilité)', () => {
        const init = { revenu: 0, gains: 0, divers: 0, reer: 0 };
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ grossMarcBaseAnnual: 120000, optimizeSourceDeductions: false }),
            makeHelpers(),
            init,
        );
        expect(init).toEqual({ revenu: 0, gains: 0, divers: 0, reer: 0 });
        expect(r.newTaxCurrentYear).not.toBe(init);
    });
});

describe('processDecemberTaxFiling — actif : régularisation salariale (T1213)', () => {
    it('sans optimisation (retenue employeur sans déductions) : régularisation ≈ -8% de l\'impôt', () => {
        // Sans déductions : impôt réel = retenue brute = 120000×0.25 = 30000.
        // estimatedWithholding = 30000 × 0.92 = 27600 → revenu = 30000 - 27600 = 2400.
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ grossMarcBaseAnnual: 120000, optimizeSourceDeductions: false }),
            makeHelpers(),
            ZERO_TAX,
        );
        expect(r.newTaxCurrentYear.revenu).toBeCloseTo(2400, 5);
    });

    it('avec optimisation T1213 : la retenue suit l\'impôt réel (avec déductions)', () => {
        // optimizeSourceDeductions=true → taxEmployer = taxReal.
        // Déductions 20000 au plus haut salaire. impôt réel = (120000-20000)×0.25 = 25000.
        // withholding = 25000 × 0.92 = 23000 → revenu = 25000 - 23000 = 2000.
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ grossMarcBaseAnnual: 120000, accRrspYear: 20000, optimizeSourceDeductions: true }),
            makeHelpers(),
            ZERO_TAX,
        );
        expect(r.newTaxCurrentYear.revenu).toBeCloseTo(2000, 5);
    });

    it('monotone : brut salarial ↑ → impôt de régularisation ↑', () => {
        const low = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ grossMarcBaseAnnual: 60000, optimizeSourceDeductions: false }),
            makeHelpers(),
            ZERO_TAX,
        ).newTaxCurrentYear.revenu;
        const high = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ grossMarcBaseAnnual: 200000, optimizeSourceDeductions: false }),
            makeHelpers(),
            ZERO_TAX,
        ).newTaxCurrentYear.revenu;
        expect(high).toBeGreaterThan(low);
    });

    it('régularisation plancher : jamais sous -100 000 (remboursement borné)', () => {
        // calculateFiscalReport stubé à 0 → totalAnnualTax=0, withholding=0 → revenu=max(-100000, 0)=0.
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ grossMarcBaseAnnual: 0, optimizeSourceDeductions: false }),
            makeHelpers({ calculateFiscalReport: () => ({ totalTax: 0 } as unknown as FiscalReport) }),
            ZERO_TAX,
        );
        expect(r.newTaxCurrentYear.revenu).toBeGreaterThanOrEqual(-100000);
    });
});

describe('processDecemberTaxFiling — retraité : impôt marginal réel réconcilié', () => {
    // FIX FISCAL (Marc, 2026-06) — l'ancien comportement n'ajoutait que 5 % du vrai
    // impôt (« 95 % retenu à la source »), MAIS il n'existe aucune retenue mensuelle
    // pour les retraités. Le nouveau comportement régularise au taux marginal RÉEL :
    //   complément .revenu = vrai impôt annuel − retenue déjà captée dans .reer.
    // La somme (.reer + complément) == vrai impôt annuel, en miroir de la phase active.

    it('sans retenue REER préalable : régularise au VRAI impôt total (≈100 %, plus 5 %)', () => {
        // pension = 5000×12 = 60000, aucun retrait REER, .reer initial = 0.
        // Stub linéaire 25 % → vrai impôt = 60000×0.25 = 15000. Réconciliation = 15000 − 0 = 15000.
        // (Avant le fix : seulement 750. Le retraité était sous-imposé d'un facteur ~20.)
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ isRetired: true, incomeRetirementMonthly: 5000 }),
            makeHelpers(),
            ZERO_TAX,
        );
        expect(r.newTaxCurrentYear.revenu).toBeCloseTo(15000, 5);
    });

    it('retraits REER inclus dans l\'assiette imposable retraité', () => {
        // pension 60000 + retraits REER 40000 = assiette 100000. Stub 25 % → vrai impôt 25000.
        // .reer initial = 0 (aucune retenue préalable simulée ici) → réconciliation = 25000.
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ isRetired: true, incomeRetirementMonthly: 5000, accRetraitsReerYear: 40000 }),
            makeHelpers(),
            ZERO_TAX,
        );
        expect(r.newTaxCurrentYear.revenu).toBeCloseTo(25000, 5);
    });

    it('Phase 2 — retraits REER attribués PAR CONJOINT : la concentration paie plus (progressivité)', () => {
        // Stub PROGRESSIF (20 % jusqu'à 50k, 45 % au-delà) pour révéler l'effet du split.
        // Couple retraité, pension nulle, 100 000 $ de retraits REER dans l'année.
        const progressive = makeHelpers({
            calculateFiscalReport: ((gross: number) =>
                ({ totalTax: gross <= 50000 ? gross * 0.2 : 10000 + (gross - 50000) * 0.45 } as unknown as FiscalReport)
            ) as DecemberHelpers['calculateFiscalReport'],
        });
        const coupleRetired = (byUser?: number[]): Partial<DecemberContext> => ({
            isRetired: true, activeUsersCount: 2, incomeRetirementMonthly: 0,
            incomeRetirementPerUserMonthly: [0, 0], age: 70, ageSpouse: 70,
            accRetraitsReerYear: 100000, accRetraitsReerYearByUser: byUser,
        });
        // Split ÉGAL (attribution absente) : 50k chacun → 10k + 10k = 20 000.
        const equal = processDecemberTaxFiling(DECEMBER, baseCtx(coupleRetired(undefined)), progressive, ZERO_TAX);
        expect(equal.newTaxCurrentYear.revenu).toBeCloseTo(20000, 5);
        // Tout sur UN conjoint (100k / 0) : 32 500 + 0 → impôt combiné PLUS élevé, plus exact.
        const concentrated = processDecemberTaxFiling(DECEMBER, baseCtx(coupleRetired([100000, 0])), progressive, ZERO_TAX);
        expect(concentrated.newTaxCurrentYear.revenu).toBeCloseTo(32500, 5);
        expect(concentrated.newTaxCurrentYear.revenu).toBeGreaterThan(equal.newTaxCurrentYear.revenu);

        // Garde-fou (audit) : si l'attribution NE somme PAS au total (retrait non attribué en amont),
        // on retombe sur le split égal CONSERVATEUR (20 000 $) au lieu de taxer 60k sous-compté (→14 500,
        // sous-imposition). Σ([60000,0])=60000 ≠ accRetraitsReerYear=100000 → repli.
        const undercounted = processDecemberTaxFiling(DECEMBER, baseCtx(coupleRetired([60000, 0])), progressive, ZERO_TAX);
        expect(undercounted.newTaxCurrentYear.revenu).toBeCloseTo(20000, 5);
    });

    it('Phase 3 — fractionnement 65+ : à 72 ans, retraits RIF concentrés → transfert ≤50 % baisse l\'impôt', () => {
        const progressive = makeHelpers({
            calculateFiscalReport: ((gross: number) =>
                ({ totalTax: gross <= 50000 ? gross * 0.2 : 10000 + (gross - 50000) * 0.45 } as unknown as FiscalReport)
            ) as DecemberHelpers['calculateFiscalReport'],
        });
        const ctx = (age: number): Partial<DecemberContext> => ({
            isRetired: true, activeUsersCount: 2, incomeRetirementMonthly: 0,
            incomeRetirementPerUserMonthly: [0, 0], incomeRetirementDbPerUserMonthly: [0, 0],
            age, ageSpouse: age, accRetraitsReerYear: 100000, accRetraitsReerYearByUser: [100000, 0],
        });
        // À 72 ans, 100k de retraits sont du revenu FERR/RIF ADMISSIBLE concentré sur un conjoint.
        // L'optimiseur transfère ≤ 50 % (50k) → [50k, 50k] → impôt 20 000 (vs 32 500 sans fractionnement).
        const at72 = processDecemberTaxFiling(DECEMBER, baseCtx(ctx(72)), progressive, ZERO_TAX);
        expect(at72.newTaxCurrentYear.revenu).toBeCloseTo(20000, 5);
        // Contre-preuve : à 70 ans, les retraits REER ne sont PAS encore RIF (conversion FERR à 72) →
        // rien d'admissible → aucun fractionnement → reste 32 500 (Phase 2).
        const at70 = processDecemberTaxFiling(DECEMBER, baseCtx(ctx(70)), progressive, ZERO_TAX);
        expect(at70.newTaxCurrentYear.revenu).toBeCloseTo(32500, 5);
        expect(at72.newTaxCurrentYear.revenu).toBeLessThan(at70.newTaxCurrentYear.revenu);
    });

    it('MÉCANISME de réconciliation : crédite la retenue déjà captée dans .reer (pas de double-comptage)', () => {
        // pension 60000 + retraits REER 40000 = assiette 100000. Stub 25 % → vrai impôt 25000.
        // La retenue à la source déjà prélevée pendant l'année (.reer = 8000) est CRÉDITÉE :
        //   complément .revenu = 25000 − 8000 = 17000.
        // Total impôt retraité de l'année = .reer (8000, payé en avril) + complément (17000)
        //                                  = 25000 = vrai impôt → AUCUN double-comptage.
        const reerWithheld = 8000;
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ isRetired: true, incomeRetirementMonthly: 5000, accRetraitsReerYear: 40000 }),
            makeHelpers(),
            { ...ZERO_TAX, reer: reerWithheld },
        );
        expect(r.newTaxCurrentYear.revenu).toBeCloseTo(17000, 5);
        // Le bucket .reer n'est PAS modifié par la régularisation revenu (il sera payé tel quel).
        expect(r.newTaxCurrentYear.reer).toBeCloseTo(reerWithheld, 5);
        // Invariant clé : .reer + complément.revenu == vrai impôt annuel (25000).
        expect(r.newTaxCurrentYear.reer + r.newTaxCurrentYear.revenu).toBeCloseTo(25000, 5);
    });

    it('retenue REER supérieure à l\'impôt réel → complément négatif (remboursement en avril)', () => {
        // pension 60000 → vrai impôt 15000 (stub 25 %). Retenue déjà captée 18000 (> impôt).
        // complément = 15000 − 18000 = -3000 → remboursé en avril. Total = 18000 − 3000 = 15000.
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ isRetired: true, incomeRetirementMonthly: 5000 }),
            makeHelpers(),
            { ...ZERO_TAX, reer: 18000 },
        );
        expect(r.newTaxCurrentYear.revenu).toBeCloseTo(-3000, 5);
        expect(r.newTaxCurrentYear.reer + r.newTaxCurrentYear.revenu).toBeCloseTo(15000, 5);
    });

    it('aucun ajustement si l\'assiette imposable est nulle', () => {
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ isRetired: true, incomeRetirementMonthly: 0, accRentesYear: 0, accRetraitsReerYear: 0 }),
            makeHelpers(),
            ZERO_TAX,
        );
        expect(r.newTaxCurrentYear.revenu).toBe(0);
    });

    it('VRAI barème : retraité avec pension 60 000$ paie ~le vrai impôt (milliers de $), PAS 750$', () => {
        // Régression money-critical : au vrai barème QC+fed (crédits d'âge/pension 70 ans,
        // célibataire), l'impôt sur 60 000$ de pension est de l'ordre de ~9 000-10 000$,
        // PAS ~750$ (l'ancien 5 % du stub). On vérifie l'ordre de grandeur réel.
        const realHelpers: DecemberHelpers = { calculateFiscalReport, getMarginalRate, calculateDividendTax };
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ isRetired: true, incomeRetirementMonthly: 5000, age: 70, activeUsersCount: 1, ramqExempt: true }),
            realHelpers,
            ZERO_TAX,
        );
        // Vrai impôt attendu ≈ 9 772$ (cf utils/tax). Bornes larges mais excluant l'ancien bug.
        expect(r.newTaxCurrentYear.revenu).toBeGreaterThan(5000);
        expect(r.newTaxCurrentYear.revenu).toBeLessThan(13000);
        // Et surtout : loin au-dessus de l'ancien ~750$ (preuve que le bug est corrigé).
        expect(r.newTaxCurrentYear.revenu).toBeGreaterThan(2000);
    });

    it('actif vs retraité : même brut/pension → régularisations DIFFÉRENTES', () => {
        const actif = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ isRetired: false, grossMarcBaseAnnual: 60000, optimizeSourceDeductions: false }),
            makeHelpers(),
            ZERO_TAX,
        ).newTaxCurrentYear.revenu;
        const retraite = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ isRetired: true, incomeRetirementMonthly: 5000 }),
            makeHelpers(),
            ZERO_TAX,
        ).newTaxCurrentYear.revenu;
        expect(actif).not.toBeCloseTo(retraite, 1);
    });
});

describe('processDecemberTaxFiling — gains en capital (palier 250k)', () => {
    it('aucun gain → bloc gains nul', () => {
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ accCapitalGainsYear: 0, grossMarcBaseAnnual: 60000, optimizeSourceDeductions: false }),
            makeHelpers(),
            ZERO_TAX,
        );
        // revenu peut être non nul (salarial), mais gains doit rester 0.
        expect(r.newTaxCurrentYear.gains).toBe(0);
    });

    it('gain positif → impôt sur gains = gain × 50% × impôt incrémental (stub linéaire)', () => {
        // accCapitalGainsYear=100000 → taxable 50000. Stub calculateFiscalReport linéaire
        // (STUB_RATE=25%) → incrément = 50000 × 0.25 = 12500. (B-AUDIT-2 : gains désormais
        // imposés par impôt incrémental empilé, pas par un taux marginal plat.)
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ accCapitalGainsYear: 100000, grossMarcBaseAnnual: 60000, optimizeSourceDeductions: false }),
            makeHelpers(),
            ZERO_TAX,
        );
        expect(r.newTaxCurrentYear.gains).toBeCloseTo(100000 * CAPITAL_GAINS_INCLUSION_STANDARD * STUB_RATE, 5);
        expect(r.logs.some((l) => l.includes('Gains Cap'))).toBe(true);
    });

    it('CARACTÉRISATION : gain > 250k garde le MÊME taux d\'inclusion 50% (pas de palier supérieur)', () => {
        // Inclusion uniforme 50% (annulation du 66.67% mars 2025). Stub linéaire 25% :
        // 300 000 × 0.50 × 0.25 = 37 500. (L'empilement progressif réel est testé à part
        // avec le vrai barème ; ici le stub est linéaire pour figer un montant exact.)
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ accCapitalGainsYear: 300000, grossMarcBaseAnnual: 60000, optimizeSourceDeductions: false }),
            makeHelpers(),
            ZERO_TAX,
        );
        expect(r.newTaxCurrentYear.gains).toBeCloseTo(300000 * 0.50 * STUB_RATE, 5);
    });

    it('linéaire : double le gain → double l\'impôt sur gains (inclusion plate)', () => {
        const g1 = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ accCapitalGainsYear: 100000, grossMarcBaseAnnual: 60000, optimizeSourceDeductions: false }),
            makeHelpers(),
            ZERO_TAX,
        ).newTaxCurrentYear.gains;
        const g2 = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ accCapitalGainsYear: 200000, grossMarcBaseAnnual: 60000, optimizeSourceDeductions: false }),
            makeHelpers(),
            ZERO_TAX,
        ).newTaxCurrentYear.gains;
        expect(g2).toBeCloseTo(2 * g1, 5);
    });
});

describe('processDecemberTaxFiling — gains en capital EMPILÉS sur le barème réel (B-AUDIT-2)', () => {
    // Avec le VRAI barème progressif : un gros gain qui franchit des paliers doit être
    // imposé PLUS que (gain imposable × taux marginal du revenu de base). L'ancien calcul
    // (taux marginal plat sur le revenu AVANT gain) sous-estimait cet impôt.
    const realHelpers: DecemberHelpers = { calculateFiscalReport, getMarginalRate, calculateDividendTax };

    it('gros gain franchissant des paliers → impôt > gain × taux marginal de base (empilement)', () => {
        const baseIncome = 50000;   // revenu modeste
        const accGains = 400000;    // taxable 200k empilé sur 50k → franchit plusieurs paliers
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ accCapitalGainsYear: accGains, grossMarcBaseAnnual: baseIncome, optimizeSourceDeductions: false }),
            realHelpers,
            ZERO_TAX,
        );
        const taxableGains = accGains * CAPITAL_GAINS_INCLUSION_STANDARD;
        const flatNaive = taxableGains * getMarginalRate(baseIncome, 2026); // ancien calcul plat
        expect(r.newTaxCurrentYear.gains).toBeGreaterThan(flatNaive);
    });

    it('cohérence : petit gain dans le même palier → ≈ gain × taux marginal (pas de sur-imposition)', () => {
        const baseIncome = 60000;
        const accGains = 4000; // taxable 2000, reste dans le même palier
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ accCapitalGainsYear: accGains, grossMarcBaseAnnual: baseIncome, optimizeSourceDeductions: false }),
            realHelpers,
            ZERO_TAX,
        );
        const taxableGains = accGains * CAPITAL_GAINS_INCLUSION_STANDARD;
        const flat = taxableGains * getMarginalRate(baseIncome, 2026);
        expect(r.newTaxCurrentYear.gains).toBeCloseTo(flat, 0); // même palier → empilé ≈ plat
    });
});

describe('processDecemberTaxFiling — crédits d\'âge PAR conjoint (B-AUDIT-3)', () => {
    // Le stub calculateFiscalReport ignore les ageOpts → on utilise le VRAI barème,
    // seul à appliquer les crédits d'âge/pension. Avant le fix, ctx.age (Marc) servait
    // aux DEUX conjoints ; après, chacun selon SON âge (ctx.age / ctx.ageSpouse).
    const realHelpers: DecemberHelpers = { calculateFiscalReport, getMarginalRate, calculateDividendTax };

    it('couple retraité à âges décalés : le conjoint <65 ne reçoit PAS le crédit d\'âge → impôt plus élevé', () => {
        const retiredCtx = (ageSpouse: number) => baseCtx({
            isRetired: true, age: 70, ageSpouse, activeUsersCount: 2,
            incomeRetirementMonthly: 5000, // basePensionAnnual 60000 → per-adulte 30000 (crédit d'âge plein)
        });
        const equal = processDecemberTaxFiling(DECEMBER, retiredCtx(70), realHelpers, ZERO_TAX);
        const gap = processDecemberTaxFiling(DECEMBER, retiredCtx(60), realHelpers, ZERO_TAX);
        // 70/70 → les deux ont le crédit ; 70/60 → le conjoint de 60 ans ne l'a pas → impôt couple supérieur.
        expect(gap.newTaxCurrentYear.revenu).toBeGreaterThan(equal.newTaxCurrentYear.revenu);
    });

    it('actif 65+ avec conjoint <65 : seul le 65+ reçoit le crédit d\'âge', () => {
        const mk = (ageSpouse: number) => baseCtx({
            isRetired: false, age: 67, ageSpouse, activeUsersCount: 2,
            grossMarcBaseAnnual: 40000, grossAnnaBaseAnnual: 40000, optimizeSourceDeductions: true,
        });
        const gap = processDecemberTaxFiling(DECEMBER, mk(60), realHelpers, ZERO_TAX);
        const both = processDecemberTaxFiling(DECEMBER, mk(67), realHelpers, ZERO_TAX);
        expect(gap.newTaxCurrentYear.revenu).toBeGreaterThan(both.newTaxCurrentYear.revenu);
    });
});

describe('processDecemberTaxFiling — impôt de retraite PAR conjoint (A1)', () => {
    // Avec le VRAI barème (progressif + crédits), taxer chaque conjoint sur SON revenu
    // de retraite réel doit donner un impôt ≥ celui du split égal (qui minimise sous un
    // barème progressif). Un couple à revenus de retraite ÉGAUX ne doit PAS bouger.
    const realHelpers: DecemberHelpers = { calculateFiscalReport, getMarginalRate, calculateDividendTax };

    // 6000$/mois de pension ménage = 72 000$/an ; + 60 000$ de retraits REER → assiette
    // 132 000$. Assez haut pour qu'un split inégal franchisse des paliers.
    const coupleCtx = (perUser: number[] | undefined) => baseCtx({
        isRetired: true, age: 67, ageSpouse: 67, activeUsersCount: 2,
        incomeRetirementMonthly: 6000,
        incomeRetirementPerUserMonthly: perUser,
        accRetraitsReerYear: 60000,
    });

    it('pension ÉGALE par conjoint → identique au split égal historique (zéro régression)', () => {
        const equalSplit = processDecemberTaxFiling(DECEMBER, coupleCtx(undefined), realHelpers, ZERO_TAX);
        const perUserEqual = processDecemberTaxFiling(DECEMBER, coupleCtx([3000, 3000]), realHelpers, ZERO_TAX);
        expect(perUserEqual.newTaxCurrentYear.revenu).toBeCloseTo(equalSplit.newTaxCurrentYear.revenu, 4);
    });

    it('pension INÉGALE par conjoint → impôt ≥ split égal (barème progressif)', () => {
        const equalSplit = processDecemberTaxFiling(DECEMBER, coupleCtx(undefined), realHelpers, ZERO_TAX);
        // Même total ménage (6000), mais 4500/1500 → le conjoint aisé franchit un palier.
        const perUserUnequal = processDecemberTaxFiling(DECEMBER, coupleCtx([4500, 1500]), realHelpers, ZERO_TAX);
        expect(perUserUnequal.newTaxCurrentYear.revenu).toBeGreaterThan(equalSplit.newTaxCurrentYear.revenu);
    });

    it('breakdown incohérent (mauvaise longueur) → repli sur le split égal', () => {
        const equalSplit = processDecemberTaxFiling(DECEMBER, coupleCtx(undefined), realHelpers, ZERO_TAX);
        const badLen = processDecemberTaxFiling(DECEMBER, coupleCtx([6000]), realHelpers, ZERO_TAX);
        expect(badLen.newTaxCurrentYear.revenu).toBeCloseTo(equalSplit.newTaxCurrentYear.revenu, 4);
    });

    it('solo (activeUsersCount=1) → le breakdown par conjoint est ignoré (split inchangé)', () => {
        const solo = baseCtx({
            isRetired: true, age: 67, activeUsersCount: 1,
            incomeRetirementMonthly: 4000, incomeRetirementPerUserMonthly: [4000],
        });
        const soloNoBreakdown = baseCtx({
            isRetired: true, age: 67, activeUsersCount: 1, incomeRetirementMonthly: 4000,
        });
        const a = processDecemberTaxFiling(DECEMBER, solo, realHelpers, ZERO_TAX);
        const b = processDecemberTaxFiling(DECEMBER, soloNoBreakdown, realHelpers, ZERO_TAX);
        expect(a.newTaxCurrentYear.revenu).toBeCloseTo(b.newTaxCurrentYear.revenu, 6);
    });
});

describe('processDecemberTaxFiling — dividendes Non-Reg', () => {
    it('Non-Reg nul → aucun impôt de dividende', () => {
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ nonReg: 0, baseNonRegRate: 5, grossMarcBaseAnnual: 60000, optimizeSourceDeductions: false }),
            makeHelpers(),
            ZERO_TAX,
        );
        expect(r.newTaxCurrentYear.gains).toBe(0);
    });

    it('Non-Reg positif → dividende imposé PINNÉ (div = solde × taux% × 30%, taxé au marginal)', () => {
        // nonReg=200000, rate=5% → annualDiv = 200000×0.05×0.30 = 3000 ; tax = 3000×0.40 = 1200.
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ nonReg: 200000, baseNonRegRate: 5, grossMarcBaseAnnual: 60000, optimizeSourceDeductions: false }),
            makeHelpers(),
            ZERO_TAX,
        );
        expect(r.newTaxCurrentYear.gains).toBeCloseTo(1200, 5);
    });

    it('gains capitaux ET dividendes s\'additionnent dans le bucket gains', () => {
        // gains cap : 100000×0.5×0.25 = 12500 (incrémental, stub linéaire) ;
        // dividendes : 3000 × marginal 0.40 = 1200 → total 13700.
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({
                accCapitalGainsYear: 100000,
                nonReg: 200000,
                baseNonRegRate: 5,
                grossMarcBaseAnnual: 60000,
                optimizeSourceDeductions: false,
            }),
            makeHelpers(),
            ZERO_TAX,
        );
        expect(r.newTaxCurrentYear.gains).toBeCloseTo(100000 * CAPITAL_GAINS_INCLUSION_STANDARD * STUB_RATE + 1200, 5);
    });
});

describe('processDecemberTaxFiling — dividendes Non-Reg EMPILÉS sur le barème réel (ITEM 2d)', () => {
    // Avec le VRAI barème + le helper gross-up, le dividende majoré s'empile
    // progressivement sur le revenu. Un gros dividende sur un revenu modeste franchit
    // des paliers → impôt > le calcul PLAT (taux marginal au revenu de base), qui
    // sous-estimait (voire annulait via le crédit d'impôt dividende).
    const realHelpers: DecemberHelpers = { calculateFiscalReport, getMarginalRate, calculateDividendTax, getDividendGrossUpRate };

    it('gros dividende sur revenu modeste → impôt > calcul plat (empilement)', () => {
        // nonReg=2 000 000, rate=5% → annualDiv = 30 000. Sur 50 000$ de revenu (solo),
        // le majoré (~41 400$) franchit des paliers.
        const ctxDiv = baseCtx({
            nonReg: 2_000_000, baseNonRegRate: 5, grossMarcBaseAnnual: 50000,
            optimizeSourceDeductions: false, activeUsersCount: 1,
        });
        const progressive = processDecemberTaxFiling(DECEMBER, ctxDiv, realHelpers, ZERO_TAX);
        // Calcul plat (ancien) : marginal au revenu de base, crédit dividende → souvent 0.
        const annualDiv = 2_000_000 * 0.05 * 0.30;
        const flat = calculateDividendTax(annualDiv, getMarginalRate(50000, 2026), 'eligible');
        expect(progressive.newTaxCurrentYear.gains).toBeGreaterThan(flat);
        expect(progressive.newTaxCurrentYear.gains).toBeGreaterThan(1000); // non nul, contrairement au plat
    });

    it('cohérence : petit dividende dans le même palier → empilé ≈ plat (zéro régression)', () => {
        // Revenu 80 000$ (palier stable), petit dividende → le majoré reste dans le palier.
        // nonReg=200 000, rate=5% → annualDiv=3 000 → majoré ~4 140$.
        const ctxDiv = baseCtx({
            nonReg: 200000, baseNonRegRate: 5, grossMarcBaseAnnual: 80000,
            optimizeSourceDeductions: false, activeUsersCount: 1,
        });
        const progressive = processDecemberTaxFiling(DECEMBER, ctxDiv, realHelpers, ZERO_TAX);
        // Plat avec le VRAI marginal au même revenu.
        const annualDiv = 200000 * 0.05 * 0.30;
        const flat = calculateDividendTax(annualDiv, getMarginalRate(80000, 2026), 'eligible');
        expect(progressive.newTaxCurrentYear.gains).toBeCloseTo(flat, 0);
    });
});

describe('processDecemberTaxFiling — RAMQ (prime médicaments publique)', () => {
    it('ramqExempt = true → aucune prime RAMQ, aucun log RAMQ', () => {
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ ramqExempt: true, isRetired: true, incomeRetirementMonthly: 5000 }),
            makeHelpers(),
            ZERO_TAX,
        );
        expect(r.logs.some((l) => l.includes('RAMQ'))).toBe(false);
    });

    it('NON exempté avec revenu net > seuil → prime RAMQ positive dans divers + log', () => {
        // retraité, pension = 5000×12 = 60000 > exemption single (19 500) → prime > 0.
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ ramqExempt: false, isRetired: true, incomeRetirementMonthly: 5000, activeUsersCount: 1 }),
            makeHelpers(),
            ZERO_TAX,
        );
        expect(r.newTaxCurrentYear.divers).toBeGreaterThan(0);
        expect(r.logs.some((l) => l.includes('RAMQ'))).toBe(true);
    });

    it('NON exempté mais revenu net SOUS le seuil d\'exemption → prime RAMQ nulle', () => {
        // retraité, pension faible 1000×12 = 12000 < exemption single 19 500 → 0.
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ ramqExempt: false, isRetired: true, incomeRetirementMonthly: 1000, activeUsersCount: 1 }),
            makeHelpers(),
            ZERO_TAX,
        );
        // divers ne doit contenir ni RAMQ ni FSS (12000 < FSS_THRESHOLD_ZERO 18 130 aussi).
        expect(RAMQ_EXEMPTION_SINGLE_2026).toBeGreaterThan(12000); // garde la prémisse explicite
        expect(r.newTaxCurrentYear.divers).toBe(0);
        expect(r.logs.some((l) => l.includes('RAMQ'))).toBe(false);
    });

    it('actif : RAMQ calculée sur le revenu NET (déductions REER soustraites)', () => {
        // Sans déductions, le brut élevé donne une prime RAMQ. Avec de grosses déductions
        // ramenant le net sous le seuil, la prime tombe. Verrouille le FIX audit HIGH 1.
        const sansDeduc = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({
                ramqExempt: false, isRetired: false, grossMarcBaseAnnual: 30000,
                accRrspYear: 0, optimizeSourceDeductions: false,
            }),
            makeHelpers(),
            ZERO_TAX,
        );
        const avecDeduc = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({
                ramqExempt: false, isRetired: false, grossMarcBaseAnnual: 30000,
                accRrspYear: 25000, optimizeSourceDeductions: false, // net = 5000 < seuil
            }),
            makeHelpers(),
            ZERO_TAX,
        );
        const ramqSans = sansDeduc.logs.some((l) => l.includes('RAMQ'));
        const ramqAvec = avecDeduc.logs.some((l) => l.includes('RAMQ'));
        expect(ramqSans).toBe(true);
        expect(ramqAvec).toBe(false);
    });
});

describe('processDecemberTaxFiling — FSS (Fonds des services de santé)', () => {
    it('retraité au-dessus du seuil FSS → cotisation FSS dans divers + log', () => {
        // pension = 5000×12 = 60000 > FSS_THRESHOLD_FLAT (33 130) → palier 150$+.
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ ramqExempt: true, isRetired: true, incomeRetirementMonthly: 5000, activeUsersCount: 1 }),
            makeHelpers(),
            ZERO_TAX,
        );
        expect(r.newTaxCurrentYear.divers).toBeGreaterThan(0);
        expect(r.logs.some((l) => l.includes('FSS'))).toBe(true);
        expect(FSS_THRESHOLD_FLAT).toBeLessThan(60000); // prémisse explicite
    });

    it('actif → AUCUNE cotisation FSS (couvert par l\'employeur)', () => {
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ ramqExempt: true, isRetired: false, grossMarcBaseAnnual: 120000, optimizeSourceDeductions: false }),
            makeHelpers(),
            ZERO_TAX,
        );
        expect(r.logs.some((l) => l.includes('FSS'))).toBe(false);
    });

    it('retraité sous le seuil FSS zéro → aucune cotisation FSS', () => {
        // pension = 1000×12 = 12000 < FSS_THRESHOLD_ZERO 18 130 → 0.
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ ramqExempt: true, isRetired: true, incomeRetirementMonthly: 1000, activeUsersCount: 1 }),
            makeHelpers(),
            ZERO_TAX,
        );
        expect(FSS_THRESHOLD_ZERO).toBeGreaterThan(12000); // prémisse explicite
        expect(r.logs.some((l) => l.includes('FSS'))).toBe(false);
    });
});

describe('processDecemberTaxFiling — intégration multi-blocs', () => {
    it('retraité complet (RAMQ + FSS + gains) : divers et gains tous deux > 0', () => {
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({
                ramqExempt: false,
                isRetired: true,
                incomeRetirementMonthly: 5000,
                accCapitalGainsYear: 100000,
                activeUsersCount: 1,
            }),
            makeHelpers(),
            ZERO_TAX,
        );
        expect(r.newTaxCurrentYear.divers).toBeGreaterThan(0); // RAMQ + FSS
        expect(r.newTaxCurrentYear.gains).toBeGreaterThan(0);  // gains capitaux
        expect(r.logs.some((l) => l.includes('RAMQ'))).toBe(true);
        expect(r.logs.some((l) => l.includes('FSS'))).toBe(true);
        expect(r.logs.some((l) => l.includes('Gains Cap'))).toBe(true);
    });
});
