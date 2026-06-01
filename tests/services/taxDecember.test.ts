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

    it('expenseMultiplier relève le seuil effectif (réel vs nominal)', () => {
        // revenu = 100 000. Avec multiplier=1 (>95 323) → clawback. Avec multiplier=1.2
        // (seuil = 114 388 > 100 000) → nul.
        const nominal = computeOasClawback(DECEMBER, 24, true, 70, 1, 100000 / 12, 0, 0, 5000, 0);
        const inflated = computeOasClawback(DECEMBER, 24, true, 70, 1.2, 100000 / 12, 0, 0, 5000, 0);
        expect(nominal.clawbackAnnual).toBeGreaterThan(0);
        expect(inflated.clawbackAnnual).toBe(0);
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

describe('processDecemberTaxFiling — retraité : petit ajustement ~5%', () => {
    it('ajustement retraité = 5% de l\'impôt total quand > 100$', () => {
        // pension = 5000×12 = 60000. impôt réel = 60000×0.25 = 15000. diff = 15000×0.05 = 750.
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ isRetired: true, incomeRetirementMonthly: 5000 }),
            makeHelpers(),
            ZERO_TAX,
        );
        expect(r.newTaxCurrentYear.revenu).toBeCloseTo(750, 5);
    });

    it('aucun ajustement si la pension est nulle', () => {
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ isRetired: true, incomeRetirementMonthly: 0, accRentesYear: 0 }),
            makeHelpers(),
            ZERO_TAX,
        );
        expect(r.newTaxCurrentYear.revenu).toBe(0);
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

    it('gain positif → impôt sur gains PINNÉ = gain × 50% × taux marginal', () => {
        // accCapitalGainsYear=100000 → taxable = 50000 ; marginal stubé 40% → 20000.
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ accCapitalGainsYear: 100000, grossMarcBaseAnnual: 60000, optimizeSourceDeductions: false }),
            makeHelpers(),
            ZERO_TAX,
        );
        expect(r.newTaxCurrentYear.gains).toBeCloseTo(100000 * CAPITAL_GAINS_INCLUSION_STANDARD * STUB_MARGINAL, 5);
        expect(r.logs.some((l) => l.includes('Gains Cap'))).toBe(true);
    });

    it('CARACTÉRISATION : gain > 250k garde le MÊME taux d\'inclusion 50% (pas de palier supérieur)', () => {
        // Comportement actuel : inclusion uniforme 50% (annulation du 66.67% mars 2025).
        // 300 000 × 0.50 × 0.40 = 60 000. Si un palier 66.67% existait, ce serait plus.
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ accCapitalGainsYear: 300000, grossMarcBaseAnnual: 60000, optimizeSourceDeductions: false }),
            makeHelpers(),
            ZERO_TAX,
        );
        expect(r.newTaxCurrentYear.gains).toBeCloseTo(300000 * 0.50 * STUB_MARGINAL, 5);
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
        // gains cap : 100000×0.5×0.4 = 20000 ; dividendes : 1200 → total 21200.
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
        expect(r.newTaxCurrentYear.gains).toBeCloseTo(20000 + 1200, 5);
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
