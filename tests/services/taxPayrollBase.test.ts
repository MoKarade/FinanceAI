// tests/services/taxPayrollBase.test.ts
// [FISC-PAYROLL-BASE-INVEST] Les cotisations RRQ/RQAP/AE portent sur le revenu d'EMPLOI (salaire),
// jamais sur le revenu de placement. `calculateFiscalReport` accepte une assiette d'emploi distincte
// de l'assiette imposable (paliers). Discriminant : sans le param (chemin de l'ANCIEN code / des
// appelants moteur), l'assiette redevient le total → cotisations gonflées quand le salaire est sous
// les maximums (RRQ ~74,6 k, AE ~68,9 k, RQAP ~103 k). Prouve aussi la rétrocompat (défaut = grossIncome).

import { describe, it, expect } from 'vitest';
import { calculateFiscalReport } from '../../utils/tax';

// Profil proche de Marc : salaire ~50 k (sous tous les maximums) + ~230 k non-enreg → placement
// imposable estimé ≈ 230 000 × (0,02 div + 0,07 gains × 0,5) = 12 650 $.
const SALARY = 50_000;
const INVEST_TAXABLE = 12_650;

describe('[FISC-PAYROLL-BASE-INVEST] assiette emploi vs assiette imposable', () => {
    it('cotisations sur le SALAIRE seul quand on fournit employmentIncome (impôt sur salaire+placement)', () => {
        const salaryOnly = calculateFiscalReport(SALARY, 0, 0);
        const withInvest = calculateFiscalReport(
            SALARY + INVEST_TAXABLE, 0, 0, undefined, undefined, undefined, SALARY,
        );
        // Assiette emploi = salaire dans les deux → cotisations IDENTIQUES.
        expect(withInvest.rrq).toBeCloseTo(salaryOnly.rrq, 6);
        expect(withInvest.rqap).toBeCloseTo(salaryOnly.rqap, 6);
        expect(withInvest.ae).toBeCloseTo(salaryOnly.ae, 6);
        // Mais l'IMPÔT est plus élevé (le placement est imposé aux paliers).
        expect(withInvest.totalTax).toBeGreaterThan(salaryOnly.totalTax);
    });

    it('DISCRIMINANT : sans employmentIncome, l\'assiette = total → sur-cotisation (~1 000 $/an)', () => {
        // Chemin BUGUÉ (ce que faisait TaxCenter avant) : le placement gonfle l'assiette de cotisation.
        const inflated = calculateFiscalReport(SALARY + INVEST_TAXABLE, 0, 0);
        // Chemin CORRIGÉ : assiette emploi = salaire.
        const correct = calculateFiscalReport(
            SALARY + INVEST_TAXABLE, 0, 0, undefined, undefined, undefined, SALARY,
        );
        const overContribution =
            (inflated.rrq + inflated.rqap + inflated.ae) - (correct.rrq + correct.rqap + correct.ae);
        process.stderr.write(`[FISC-PAYROLL] sur-cotisation évitée (salaire ${SALARY}) = ${overContribution.toFixed(2)} $\n`);
        expect(overContribution).toBeGreaterThan(500); // profil Marc : ~1 000 $/an
        // Le total d'impôt (fed+QC) est INCHANGÉ (les cotisations n'entrent pas dans totalTax).
        expect(correct.totalTax).toBeCloseTo(inflated.totalTax, 6);
        // Le net est PLUS ÉLEVÉ après fix (moins de cotisations retranchées).
        expect(correct.netIncome).toBeGreaterThan(inflated.netIncome);
    });

    it('salaire AU-DESSUS des maximums : le fix n\'a presque pas d\'effet (RRQ/AE déjà plafonnés)', () => {
        const highSalary = 90_000; // > RRQ_MPE (74,6 k) et > AE_MAX (68,9 k)
        const inflated = calculateFiscalReport(highSalary + 20_000, 0, 0);
        const correct = calculateFiscalReport(
            highSalary + 20_000, 0, 0, undefined, undefined, undefined, highSalary,
        );
        expect(correct.rrq).toBeCloseTo(inflated.rrq, 6); // déjà plafonné par le salaire
        expect(correct.ae).toBeCloseTo(inflated.ae, 6);
    });

    it('RÉTROCOMPAT : employmentIncome absent → assiette = grossIncome (appelants moteur inchangés)', () => {
        const r1 = calculateFiscalReport(60_000, 0, 0);
        const r2 = calculateFiscalReport(60_000, 0, 0, undefined, undefined, undefined, 60_000);
        expect(r2.rrq).toBe(r1.rrq);
        expect(r2.rqap).toBe(r1.rqap);
        expect(r2.ae).toBe(r1.ae);
        expect(r2.totalTax).toBe(r1.totalTax);
    });

    it('employmentIncome = 0 (rentier sans salaire) → aucune cotisation, impôt sur le placement', () => {
        const r = calculateFiscalReport(INVEST_TAXABLE, 0, 0, undefined, undefined, undefined, 0);
        expect(r.rrq).toBe(0);
        expect(r.rqap).toBe(0);
        expect(r.ae).toBe(0);
    });
});
