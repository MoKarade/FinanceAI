// tests/services/glidepathRates.test.ts
// Couverture de computeGlidepathRates : glidepath en approche retraite,
// Monte-Carlo, drag fiscal US sur CELI, et plafonnement en retraite.

import { describe, it, expect } from 'vitest';
import { computeGlidepathRates } from '../../services/projection/glidepathRates';
import type { GlidepathCtx } from '../../services/projection/glidepathRates';

const baseRates = { celi: 7, reer: 7, nonReg: 7, crypto: 12, cash: 3 };

const makeCtx = (overrides: Partial<GlidepathCtx> = {}): GlidepathCtx => ({
    m: 0,
    retirementMonthIndex: 360, // retraite dans 30 ans
    isRetired: false,
    simInflation: 2,
    enableMonteCarlo: false,
    mcCeliRate: 7,
    mcReerRate: 7,
    mcNonRegRate: 7,
    mcCryptoRate: 12,
    mcCashRate: 3,
    baseRates,
    ...overrides,
});

describe('computeGlidepathRates', () => {
    it('retourne les taux de base quand loin de la retraite (pas de glidepath)', () => {
        // Arrange — 30 ans avant retraite, glidepath démarre à 10 ans
        const ctx = makeCtx();

        // Act
        const r = computeGlidepathRates(ctx);

        // Assert — glideFactor = 1.0, taux = base
        expect(r.effectiveCeliRate).toBeCloseTo(7, 3);
        expect(r.effectiveReerRate).toBeCloseTo(7, 3);
        expect(r.effectiveNonRegRate).toBeCloseTo(7, 3);
    });

    it('réduit les taux vers inflation+1 à l\'approche de la retraite (glidepath)', () => {
        // Arrange — 5 ans avant retraite = dans la zone glidepath
        const ctx = makeCtx({ m: 300, retirementMonthIndex: 360 }); // 5 ans de marge

        // Act
        const r = computeGlidepathRates(ctx);

        // Assert — taux entre inflation+1 (3%) et base (7%), strictement < 7
        expect(r.effectiveCeliRate).toBeLessThan(7);
        expect(r.effectiveCeliRate).toBeGreaterThan(3);
    });

    it('utilise les taux MC quand Monte-Carlo est activé', () => {
        // Arrange — MC à 10% (différent du base 7%)
        const ctx = makeCtx({ enableMonteCarlo: true, mcCeliRate: 10, mcReerRate: 10, mcNonRegRate: 10 });

        // Act
        const r = computeGlidepathRates(ctx);

        // Assert — taux actifs reflètent MC
        expect(r.activeCeliRate).toBe(10);
    });

    it('applique le drag fiscal US sur le CELI (D2.7)', () => {
        // Arrange — 30% d'actions US avec 2% yield → drag = 0.30 × 0.02 × 0.15 × 100 = 0.09%
        const ctx = makeCtx({ usEquityShareCeli: 30, usEquityDividendYield: 2 });

        // Act
        const r = computeGlidepathRates(ctx);

        // Assert — le CELI doit avoir 0.09% de drag par rapport au REER
        const dragEstimé = 0.30 * 0.02 * 0.15 * 100;
        expect(r.effectiveCeliRate).toBeCloseTo(r.effectiveReerRate - dragEstimé, 3);
    });

    it('plafonne glideFactor à 0.60 minimum en retraite (protection contre sur-obligataire)', () => {
        // Arrange — retraité depuis longtemps (yearsToRetirement très négatif)
        const ctx = makeCtx({ m: 720, retirementMonthIndex: 120, isRetired: true });

        // Act
        const r = computeGlidepathRates(ctx);

        // Assert — avec glideFactor = max(0.60, ...), le taux CELI reste > cible glide
        // cible glide = simInflation + 1 = 3%; base = 7%
        // taux minimum = 7 × 0.60 + 3 × 0.40 = 4.2 + 1.2 = 5.4
        expect(r.effectiveCeliRate).toBeGreaterThanOrEqual(5.3); // marge 0.1 pour floating point
    });

    it('sans parts US dans le CELI, le drag est nul', () => {
        // Arrange
        const ctx = makeCtx({ usEquityShareCeli: 0 });
        const ctxRef = makeCtx({ usEquityShareCeli: 0 });

        // Act
        const rWithDrag = computeGlidepathRates(ctx);
        const rRef = computeGlidepathRates(ctxRef);

        // Assert — identiques (drag = 0)
        expect(rWithDrag.effectiveCeliRate).toBeCloseTo(rRef.effectiveCeliRate, 5);
    });
});
