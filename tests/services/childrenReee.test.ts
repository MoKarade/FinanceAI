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
import type { FiscalReport } from '../../utils/tax';

// Stub : netIncome = gross fourni (relation déterministe), marginalRate fixe.
const fiscalStub = (gross: number): FiscalReport =>
    // `totalTax` est requis par [FISC-REEE-GRANT-CLAWBACK] : l'impôt du PRA se calcule par
    // empilement incrémental tax(revenu + PRA) − tax(revenu). Barème linéaire à 30 % ici — il
    // suffit à discriminer l'empilement d'un forfait, sans réimplémenter le vrai barème.
    ({ netIncome: gross, marginalRate: 30, totalTax: gross * 0.30 } as unknown as FiscalReport);

const makeChild = (o: Partial<ChildGoal> = {}): ChildGoal =>
    ({ id: 'c1', name: 'Léa', ...o }) as unknown as ChildGoal;

const baseCtx = (o: Partial<ChildProcessCtx> = {}): ChildProcessCtx => ({
    m: 2, loopYear: 2026, simSalaryGrowth: 2, simInflation: 2, expenseMultiplier: 1,
    isRetired: false, grossMarcBaseAnnual: 96000, grossAnnaBaseAnnual: 60000,
    incomeAnna: 4000, liquid: 100000, reee: 0, householdGross: 120000,
    trackerScee: 0, trackerIqee: 0, trackerReeeContribLifetime: 0,
    trackerReeeGrantsInPlan: 0, trackerReeeContribInPlan: 0, enableMonteCarlo: false,
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

    /**
     * [FISC-REEE-GRANT-CLAWBACK] LE test du ticket.
     *
     * Avant : 100 % du solde tombait dans les liquidités, avec un forfait de 20 % sur le TOUT.
     * Les subventions non utilisées — jusqu'à 10 800 $/enfant — devenaient donc du patrimoine
     * alors qu'elles doivent être REMBOURSÉES au gouvernement.
     *
     * DISCRIMINANT : sur cette fixture, l'ancien code versait 20 000 $ et prélevait 4 000 $ ;
     * le nouveau verse 12 000 $ (les 8 000 $ de subventions repartent) et prélève 1 000 $.
     */
    it('fermeture à 25 ans : les subventions sont REMBOURSÉES, pas versées', () => {
        const r = processOneChild(
            makeChild(), 0, false, 25 * 12,
            baseCtx({
                grossAnnaBaseAnnual: 0, reee: 20000,
                trackerReeeGrantsInPlan: 8000, trackerReeeContribInPlan: 10000,
            }),
            vi.fn(fiscalStub),
        );
        // Capital (10 000) + revenu accumulé (2 000) — JAMAIS les 8 000 de subventions.
        expect(r.liquidDelta).toBeCloseTo(12000, 5);
        // Impôt SUR LE SEUL revenu accumulé : marginal (30 % × 2 000 = 600) + surtaxe (20 % × 2 000).
        expect(r.taxDiversAdd).toBeCloseTo(1000, 5);
        expect(r.reeeNewBalance).toBe(0);
        // Le régime est vidé : aucune poche résiduelle ne peut ressortir plus tard.
        expect(r.newTrackerReeeGrantsInPlan).toBe(0);
        expect(r.newTrackerReeeContribInPlan).toBe(0);
        // L'événement NOMME le remboursement — sans ça, Marc verrait un montant sans comprendre.
        expect(r.flowEventLogs.join(' ')).toMatch(/REMBOURS/i);
    });

    it('fermeture : les COTISATIONS reviennent sans AUCUN impôt', () => {
        const r = processOneChild(
            makeChild(), 0, false, 25 * 12,
            baseCtx({ grossAnnaBaseAnnual: 0, reee: 10000, trackerReeeContribInPlan: 10000 }),
            vi.fn(fiscalStub),
        );
        expect(r.liquidDelta).toBeCloseTo(10000, 5);
        expect(r.taxDiversAdd).toBe(0); // ← l'ancien code prélevait 2 000 $ sur de l'argent déjà imposé
    });

    /**
     * Un marché baissier peut laisser un solde INFÉRIEUR aux cotisations versées. Sans le clamp,
     * la poche de revenu deviendrait NÉGATIVE et fabriquerait un crédit d'impôt fantôme.
     */
    it('fermeture après une PERTE : aucun revenu accumulé fantôme, aucun impôt', () => {
        const r = processOneChild(
            makeChild(), 0, false, 25 * 12,
            baseCtx({ grossAnnaBaseAnnual: 0, reee: 5000, trackerReeeContribInPlan: 10000 }),
            vi.fn(fiscalStub),
        );
        expect(r.liquidDelta).toBeCloseTo(5000, 5); // on ne rend que ce qui existe
        expect(r.taxDiversAdd).toBe(0);
    });

    it('les trois poches somment TOUJOURS au solde (conservation par construction)', () => {
        // Une cotisation nourrit capital ET subventions ; le reste du solde EST le revenu.
        const r = processOneChild(
            makeChild(), 0, false, 5 * 12,
            baseCtx({ grossAnnaBaseAnnual: 0, reee: 30000, liquid: 100000 }),
            vi.fn(fiscalStub),
        );
        const income = r.reeeNewBalance - r.newTrackerReeeGrantsInPlan - r.newTrackerReeeContribInPlan;
        expect(income).toBeGreaterThanOrEqual(0);
        expect(r.newTrackerReeeGrantsInPlan + r.newTrackerReeeContribInPlan + income)
            .toBeCloseTo(r.reeeNewBalance, 6);
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

    /**
     * [FISC-REEE-GRANT-CLAWBACK] Ordre de puisage : subventions D'ABORD. C'est le seul ordre qui
     * ne détruit pas de valeur — une subvention laissée dans le régime devra être remboursée,
     * alors qu'une fois dépensée en études elle est acquise.
     * `liquid: 0` neutralise la cotisation du mois, sinon elle rechargerait les poches.
     */
    it('retrait d\'études : puise dans les SUBVENTIONS avant le capital', () => {
        const r = processOneChild(
            makeChild({ universityType: 'uni_local' as ChildGoal['universityType'] }), 0, false, 18 * 12,
            baseCtx({
                grossAnnaBaseAnnual: 0, reee: 50000, liquid: 0,
                trackerReeeGrantsInPlan: 1000, trackerReeeContribInPlan: 20000,
            }),
            vi.fn(fiscalStub),
        );
        const withdrawn = r.withdrawalREEEAdd;
        expect(withdrawn).toBeGreaterThan(0);
        expect(r.newTrackerReeeGrantsInPlan).toBeCloseTo(1000 - withdrawn, 6); // subventions entamées
        expect(r.newTrackerReeeContribInPlan).toBeCloseTo(20000, 6);           // capital INTACT
    });
});
