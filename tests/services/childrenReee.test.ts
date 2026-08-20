/**
 * Lot 2 — childrenReee.processOneChild : traitement mensuel d'un enfant
 * (dépenses, RQAP, REEE, études, fermeture). Sans test direct jusqu'ici, et
 * c'est ici qu'a vécu le « RQAP fantôme » (revenu de congé parental fabriqué
 * pour un parent seul). `calculateFiscalReport` est injecté → on le STUB et on
 * vérifie qu'il n'est même pas appelé pour un parent seul.
 */
import { describe, it, expect, vi } from 'vitest';
import { processOneChild, type ChildProcessCtx } from '../../services/projection/childrenReee';
import type { ChildGoal } from '../../types';
import { RQAP_MAX_INCOME, type FiscalReport } from '../../utils/tax';

// Stub : netIncome = gross fourni (relation déterministe), marginalRate fixe.
const fiscalStub = (gross: number): FiscalReport =>
    ({ netIncome: gross, marginalRate: 30 } as unknown as FiscalReport);

const makeChild = (o: Partial<ChildGoal> = {}): ChildGoal =>
    ({ id: 'c1', name: 'Léa', ...o }) as unknown as ChildGoal;

const baseCtx = (o: Partial<ChildProcessCtx> = {}): ChildProcessCtx => ({
    m: 2, loopYear: 2026, simSalaryGrowth: 2, simInflation: 2, expenseMultiplier: 1,
    isRetired: false, grossMarcBaseAnnual: 96000, grossAnnaBaseAnnual: 60000,
    incomeAnna: 4000, liquid: 100000, reee: 0, householdGross: 120000,
    trackerScee: 0, trackerIqee: 0, trackerReeeContribLifetime: 0, enableMonteCarlo: false,
    ...o,
});

describe('processOneChild — RQAP fantôme (régression parent seul)', () => {
    it('parent seul (grossAnna=0) : AUCUN revenu RQAP, fiscalReport jamais appelé', () => {
        const fiscal = vi.fn(fiscalStub);
        const r = processOneChild(makeChild(), 0, false, 2, baseCtx({ grossAnnaBaseAnnual: 0 }), fiscal);
        expect(r.newIncomeAnna).toBeNull();
        expect(fiscal).not.toHaveBeenCalled();
    });

    it('couple (grossAnna>0, bébé <12 mois) : RQAP = net stubé / 12, fiscalReport appelé', () => {
        const fiscal = vi.fn(() => fiscalStub(72000)); // net annuel stubé = 72k
        const r = processOneChild(makeChild(), 0, false, 2, baseCtx(), fiscal);
        expect(fiscal).toHaveBeenCalledTimes(1);
        expect(r.newIncomeAnna).toBeCloseTo(6000, 5); // 72000 / 12
    });

    it('couple mais enfant > 12 mois : plus de RQAP', () => {
        const fiscal = vi.fn(fiscalStub);
        const r = processOneChild(makeChild(), 0, false, 18, baseCtx(), fiscal);
        expect(r.newIncomeAnna).toBeNull();
        expect(fiscal).not.toHaveBeenCalled();
    });
});

describe('processOneChild — naissance & dépenses', () => {
    it('mois de naissance : coût initial débité + log Naissance', () => {
        const r = processOneChild(
            makeChild({ initialCost: 3000 }), 0, true, 0,
            baseCtx({ grossAnnaBaseAnnual: 0, isRetired: true }), // isRetired → pas de cotisation REEE qui brouille liquidDelta
            vi.fn(fiscalStub),
        );
        expect(r.liquidDelta).toBe(-3000);
        expect(r.lifeEventLogs.some(l => l.includes('Naissance'))).toBe(true);
    });

    it('clawback allocation : ménage > 150k$ réduit les prestations', () => {
        const child = makeChild({ governmentBenefits: 500 });
        const low = processOneChild(child, 0, false, 24, baseCtx({ grossAnnaBaseAnnual: 0, householdGross: 120000 }), vi.fn(fiscalStub));
        const high = processOneChild(child, 0, false, 24, baseCtx({ grossAnnaBaseAnnual: 0, householdGross: 300000 }), vi.fn(fiscalStub));
        expect(high.childBenefitsAdd).toBeLessThan(low.childBenefitsAdd);
    });
});

describe('processOneChild — REEE (plafond viager F13, cotisation, fermeture)', () => {
    it('cotisation REEE + subventions quand liquidités OK et hors retraite', () => {
        const r = processOneChild(makeChild(), 0, false, 24, baseCtx({ grossAnnaBaseAnnual: 0 }), vi.fn(fiscalStub));
        expect(r.reeeContribAdd).toBeGreaterThan(0);
        expect(r.newTrackerScee).toBeGreaterThan(0); // subvention SCEE versée
    });

    it('plafond viager 50 000$/bénéficiaire atteint → AUCUNE nouvelle cotisation (F13)', () => {
        const r = processOneChild(
            makeChild(), 0, false, 24,
            baseCtx({ grossAnnaBaseAnnual: 0, trackerReeeContribLifetime: 50000 }),
            vi.fn(fiscalStub),
        );
        expect(r.reeeContribAdd).toBe(0);
        expect(r.newTrackerReeeContribLifetime).toBe(50000); // inchangé
    });

    it('fermeture du REEE à 25 ans : solde versé en liquidités + impôt 20 %', () => {
        const r = processOneChild(
            makeChild(), 0, false, 25 * 12,
            baseCtx({ grossAnnaBaseAnnual: 0, reee: 10000 }),
            vi.fn(fiscalStub),
        );
        expect(r.liquidDelta).toBeCloseTo(10000, 5);
        expect(r.taxDiversAdd).toBeCloseTo(2000, 5); // 20 % sur le solde
        expect(r.reeeNewBalance).toBe(0);
    });

    it('études post-secondaires (18 ans) : décaissement REEE → payout > 0', () => {
        const r = processOneChild(
            makeChild({ universityType: 'uni_local' as ChildGoal['universityType'] }), 0, false, 18 * 12,
            baseCtx({ grossAnnaBaseAnnual: 0, reee: 50000 }),
            vi.fn(fiscalStub),
        );
        expect(r.reeePayoutAdd).toBeGreaterThan(0);
        expect(r.withdrawalREEEAdd).toBeGreaterThan(0);
    });
});

/**
 * [RQAP-CAP-98K] — le plafond de revenu assurable RQAP.
 *
 * Trois volets, prouvés séparément parce qu'ils peuvent régresser séparément :
 *  (a) la VALEUR vient de la source unique, pas d'un littéral périmé ;
 *  (b) l'INDEX est la rémunération moyenne (patron du MGA de la RRQ), pas l'inflation des DÉPENSES ;
 *  (c) corollaire de (b) et le plus important : une règle de DÉCAISSEMENT ne peut plus déplacer un
 *      plafond gouvernemental.
 */
describe('[RQAP-CAP-98K] plafond de revenu assurable — source, index, immunité', () => {
    // Assiette = ce qui est passé au calcul fiscal. On la CAPTE plutôt que de lire une sortie
    // dérivée : c'est la grandeur que le défaut déformait.
    const capterAssiette = () => {
        const vues: number[] = [];
        const fn = vi.fn((gross: number) => { vues.push(gross); return fiscalStub(gross); });
        return { fn, vues };
    };
    // 2e parent AU-DESSUS du plafond : c'est la seule population que le plafond touche.
    const ctxRiche = (o: Partial<ChildProcessCtx> = {}) =>
        baseCtx({ grossAnnaBaseAnnual: 120000, incomeAnna: 6000, householdGross: 216000, ...o });

    it('(a) l’assiette vient de RQAP_MAX_INCOME, pas du littéral 98 000 $ de 2025', () => {
        const c = capterAssiette();
        processOneChild(makeChild(), 0, false, 2, ctxRiche({ m: 2 }), c.fn);
        // Le discriminant est un ÉCART de 2 750 $/an : 98 000 × 0,55 = 53 900 contre
        // 103 000 × 0,55 = 56 650. Les deux sont des nombres crédibles — d'où le test.
        expect(c.vues[0]).toBeCloseTo(RQAP_MAX_INCOME * 0.55, 6);
        expect(c.vues[0]).not.toBeCloseTo(98000 * 0.55, 0);
    });

    it('(b) le plafond suit inflation + 0,5 pp/an — le patron du MGA de la RRQ', () => {
        const c = capterAssiette();
        const annees = 10;
        processOneChild(makeChild(), 0, false, 2, ctxRiche({ m: annees * 12 + 2, simInflation: 2 }), c.fn);
        expect(c.vues[0]).toBeCloseTo(RQAP_MAX_INCOME * Math.pow(1.025, annees) * 0.55, 4);
    });

    it('(c) ⚠️ un gel Guyton-Klinger ne déplace PLUS le plafond légal', () => {
        // Le défaut : le plafond était `98000 * expenseMultiplier`, or `expenseMultiplier` est
        // GELÉ par la règle de décaissement Guyton-Klinger. MESURÉ avant correctif, à l'année 20 :
        // 80 092,56 $ sans gel contre 53 900,00 $ avec — 26 192 $ d'écart sur un plafond
        // GOUVERNEMENTAL, décidé par une règle de PORTEFEUILLE.
        const sansGel = capterAssiette();
        const avecGel = capterAssiette();
        const m = 20 * 12 + 2;
        processOneChild(makeChild(), 0, false, 2, ctxRiche({ m, expenseMultiplier: Math.pow(1.02, 20) }), sansGel.fn);
        processOneChild(makeChild(), 0, false, 2, ctxRiche({ m, expenseMultiplier: 1 }), avecGel.fn);
        expect(avecGel.vues[0]).toBeCloseTo(sansGel.vues[0], 6);
    });

    it('un salaire SOUS le plafond n’est pas touché — le plafond ne mord que par le haut', () => {
        // Anti-vacuité du lot : si le correctif avait déplacé TOUT le monde, il serait faux.
        const c = capterAssiette();
        processOneChild(makeChild(), 0, false, 2, baseCtx({ grossAnnaBaseAnnual: 40000, m: 2 }), c.fn);
        expect(c.vues[0]).toBeCloseTo(40000 * 0.55, 6);
    });
});
