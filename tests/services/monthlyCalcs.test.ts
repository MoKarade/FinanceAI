/**
 * Lot 2 — monthlyCalcs : inflation effective des dépenses (bonus santé 75+, pondération CPI par poste).
 * (Le test de `computeMonthlyWithholding` a été retiré 2026-06-26 avec la fonction — vestigiale, cf. FISC-SRCDED-NOOP.)
 */
import { describe, it, expect } from 'vitest';
import { computeEffectiveExpenseInflation } from '../../services/projection/monthlyCalcs';

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
