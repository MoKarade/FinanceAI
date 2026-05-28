/**
 * Lot 2 — monthlyCalcs : inflation effective des dépenses (bonus santé 75+,
 * pondération CPI) + retenue salariale mensuelle (avec optimisation T1213 des
 * déductions à la source). Sans test direct. `calculateFiscalReport` injecté → stub.
 */
import { describe, it, expect, vi } from 'vitest';
import {
    computeEffectiveExpenseInflation,
    computeMonthlyWithholding,
    type MonthlyWithholdingCtx,
} from '../../services/projection/monthlyCalcs';
import type { FiscalReport } from '../../utils/tax';

describe('computeEffectiveExpenseInflation', () => {
    it('non retraité : inflation uniforme, aucun bonus santé', () => {
        expect(computeEffectiveExpenseInflation(40, false, 2.0, {})).toBe(2.0);
    });

    it('retraité 80 ans : bonus santé +1.25 % (min(2.5, (80−75)×0.25))', () => {
        expect(computeEffectiveExpenseInflation(80, true, 2.0, {})).toBeCloseTo(3.25, 5);
    });

    it('retraité très âgé : bonus santé plafonné à +2.5 %', () => {
        expect(computeEffectiveExpenseInflation(95, true, 2.0, {})).toBeCloseTo(4.5, 5);
    });

    it('retraité 74 ans : pas encore de bonus (< 75)', () => {
        expect(computeEffectiveExpenseInflation(74, true, 2.0, {})).toBe(2.0);
    });

    it('pondération CPI par poste (défauts) : moyenne pondérée ≈ 3.025 %', () => {
        const r = computeEffectiveExpenseInflation(40, false, 2.0, { usePerCategoryInflation: true });
        expect(r).toBeCloseTo(3.025, 5);
    });

    it('CPI par poste + retraité 80 : le bonus santé pèse sur le poste Santé', () => {
        const noBonus = computeEffectiveExpenseInflation(40, false, 2.0, { usePerCategoryInflation: true });
        const withBonus = computeEffectiveExpenseInflation(80, true, 2.0, { usePerCategoryInflation: true });
        expect(withBonus).toBeGreaterThan(noBonus);
    });
});

describe('computeMonthlyWithholding', () => {
    const ctx = (o: Partial<MonthlyWithholdingCtx> = {}): MonthlyWithholdingCtx => ({
        m: 0, loopYear: 2026, simInflation: 2, simSalaryGrowth: 2,
        grossMarcBaseAnnual: 80000, grossAnnaBaseAnnual: 0,
        contribREER: 0, contribCELIAPP: 0, smithInterestDeductibleYear: 0,
        enableMonteCarlo: false, ...o,
    });

    it('delta mensuel = 8 % de l\'impôt annuel / 12 (rattrapage de la sous-retenue 92 %)', () => {
        const fiscal = vi.fn((g: number) => ({ totalTax: g > 0 ? 12000 : 0 } as unknown as FiscalReport));
        // impôt annuel 12 000 ; retenue employeur 92 % → 8 % à provisionner → 960/12 = 80
        expect(computeMonthlyWithholding(ctx(), fiscal)).toBeCloseTo(80, 5);
    });

    it('aucun revenu → 0, fiscalReport pas appelé', () => {
        const fiscal = vi.fn(() => ({ totalTax: 5000 } as unknown as FiscalReport));
        expect(computeMonthlyWithholding(ctx({ grossMarcBaseAnnual: 0 }), fiscal)).toBe(0);
        expect(fiscal).not.toHaveBeenCalled();
    });

    it('optimizeSourceDeductions : la déduction va au conjoint au plus haut revenu', () => {
        const fiscal = vi.fn((_g: number, _d: number, _f: number, _y: number, _mc: boolean) => ({ totalTax: 10000 } as unknown as FiscalReport));
        computeMonthlyWithholding(
            ctx({ grossMarcBaseAnnual: 96000, grossAnnaBaseAnnual: 60000, optimizeSourceDeductions: true, contribREER: 500 }),
            fiscal,
        );
        const marcCall = fiscal.mock.calls.find(c => Math.round(c[0]) === 96000);
        const annaCall = fiscal.mock.calls.find(c => Math.round(c[0]) === 60000);
        expect(marcCall![1]).toBeGreaterThan(0); // Marc (plus haut revenu) reçoit la déduction
        expect(annaCall![1]).toBe(0);
    });

    it('sans optimisation : aucune déduction à la source', () => {
        const fiscal = vi.fn((_g: number, _d: number, _f: number, _y: number, _mc: boolean) => ({ totalTax: 10000 } as unknown as FiscalReport));
        computeMonthlyWithholding(ctx({ grossMarcBaseAnnual: 96000, grossAnnaBaseAnnual: 60000, contribREER: 500 }), fiscal);
        fiscal.mock.calls.forEach(c => expect(c[1]).toBe(0));
    });
});
