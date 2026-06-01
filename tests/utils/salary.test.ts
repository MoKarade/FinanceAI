import { describe, it, expect } from 'vitest';
import { annualSalaryToMonthly } from '../../utils/salary';

describe('annualSalaryToMonthly — saisie annuelle → stockage mensuel (convention canonique)', () => {
    it('convertit l annuel en mensuel (arrondi)', () => {
        expect(annualSalaryToMonthly(70000)).toBe(5833); // 70000/12 = 5833.33 → 5833
        expect(annualSalaryToMonthly(120000)).toBe(10000);
        expect(annualSalaryToMonthly(60000)).toBe(5000);
    });
    it('0 / négatif / NaN → 0 (pas de NaN qui propagerait dans le moteur)', () => {
        expect(annualSalaryToMonthly(0)).toBe(0);
        expect(annualSalaryToMonthly(-5000)).toBe(0);
        expect(annualSalaryToMonthly(Number.NaN)).toBe(0);
    });
    it('garde anti-régression : un brut ANNUEL passé au moteur (×12) reste plausible', () => {
        // Le moteur ré-annualise le mensuel ×12 (computeIncomeBaseline). Un 120 000 $ annuel saisi
        // doit redonner ~120 000 $ annuel côté moteur, PAS 1,44 M$ (bug : annuel stocké tel quel ×12).
        const stockeMensuel = annualSalaryToMonthly(120000);
        expect(stockeMensuel * 12).toBeGreaterThanOrEqual(119900);
        expect(stockeMensuel * 12).toBeLessThanOrEqual(120000);
    });
});
