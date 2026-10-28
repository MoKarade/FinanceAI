// tests/services/tax.item2a.characterization.test.ts
// [ITEM-2A — Phase 0 : CARACTÉRISATION] — filet AVANT le refactor « impôt nominal ».
//
// Contexte : le moteur déflate le revenu par `simInflation`, calcule l'impôt sur des paliers indexés
// EN DUR à +2 %/an (`getIndexedBracketsForYear`), puis réinflate. Quand l'inflation réelle ≠ 2 %, ce
// couplage est incohérent (cf docs/HISTORIQUE.md « ITEM 2a », docs/FISCAL_REFERENCE.md §9, BACKLOG
// FISC-INFLATION-COUPLING). Ces tests PINNENT le comportement ACTUEL — aucune correction ici.
//
// But : quand la Phase 2 basculera l'indexation des paliers de `1,02` vers `simInflation`, CES golden
// CHANGERONT (volontairement). Ils servent alors de FILET : prouver que le changement est intentionnel,
// mesuré et borné — pas un effet de bord silencieux. NE PAS « réparer » ces valeurs : elles documentent
// l'état d'avant-refactor (capturées du moteur le 2026-06-16).
import { describe, it, expect } from 'vitest';
import { calculateFiscalReport } from '../../utils/tax';

const taxOf = (income: number, year: number): number =>
    calculateFiscalReport(income, 0, 0, year, true).totalTax;

describe('[ITEM-2A] caractérisation — indexation des paliers en dur (1,02/an)', () => {
    it('DÉRIVE : un revenu NOMINAL fixe est de moins en moins imposé au fil de l\'horizon (paliers ×1,02^t)', () => {
        // 100 000 $ comparés à 3 horizons. Les paliers de 2046 = ceux de 2026 × 1,02^20 (≈ ×1,486) → le
        // MÊME revenu nominal tombe dans des paliers plus hauts → impôt qui BAISSE. Direction univoque.
        const t2026 = taxOf(100_000, 2026);
        const t2036 = taxOf(100_000, 2036);
        const t2046 = taxOf(100_000, 2046);
        expect(t2036).toBeLessThan(t2026);
        expect(t2046).toBeLessThan(t2036);
        // Golden d'avant-refactor (à re-baser SCIEMMENT en Phase 2) :
        expect(t2026).toBeCloseTo(25510.02, 0);
        expect(t2036).toBeCloseTo(23187.04, 0);
        expect(t2046).toBeCloseTo(20355.34, 0);
    });

    it('MAGNITUDE : l\'écart d\'impôt 2026→2046 sur 100 k$ ≈ 5,2 k$ (effet du 1,02 en dur sur 20 ans)', () => {
        const drift = taxOf(100_000, 2026) - taxOf(100_000, 2046);
        expect(drift).toBeCloseTo(5154.68, 0);
        expect(drift).toBeGreaterThan(4500);
        expect(drift).toBeLessThan(5500);
    });

    it('année de base (2026) : indexation neutre (1,02^0 = 1) → paliers 2026 bruts (ancrage)', () => {
        expect(taxOf(60_000, 2026)).toBeCloseTo(11063.02, 0);
        expect(taxOf(150_000, 2026)).toBeCloseTo(47458.94, 0);
    });

    it('monotonie horizon : pour plusieurs revenus, l\'impôt 2046 ≤ impôt 2026 (paliers↑)', () => {
        for (const income of [40_000, 80_000, 200_000]) {
            expect(taxOf(income, 2046)).toBeLessThanOrEqual(taxOf(income, 2026));
        }
    });
});
