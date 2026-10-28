// tests/services/marketShocks.test.ts
// Couverture de computeMonthlyMarketRates :
// mode base, Monte-Carlo, séquence historique, stress test inflation.

import { describe, it, expect } from 'vitest';
import { computeMonthlyMarketRates } from '../../services/projection/marketShocks';
import type { BaseRates } from '../../services/projection/glidepathRates';
import type { StressTestConfig } from '../../services/projection/marketShocks';
import { mulberry32 } from '../../services/projection/helpers';

const baseRates: BaseRates = { celi: 7, reer: 7, nonReg: 7, crypto: 12, cash: 3 };
const rng = mulberry32(42);

describe('computeMonthlyMarketRates', () => {
    it('retourne les taux de base sans Monte-Carlo ni séquence historique', () => {
        // Arrange

        // Act
        const result = computeMonthlyMarketRates(0, false, baseRates, 2, null, null, rng);

        // Assert — taux = base
        expect(result.mcCeliRate).toBe(7);
        expect(result.mcReerRate).toBe(7);
        expect(result.mcNonRegRate).toBe(7);
        expect(result.mcCryptoRate).toBe(12);
        expect(result.mcCashRate).toBe(3);
        expect(result.currentInflation).toBe(2);
    });

    it('avec Monte-Carlo, les taux ne sont plus exactement ceux de base', () => {
        // Arrange — seed fixe pour reproductibilité
        const rngMC = mulberry32(123);

        // Act
        const result = computeMonthlyMarketRates(1, true, baseRates, 2, null, null, rngMC);

        // Assert — probabilité quasi nulle que tous les taux soient exactement à 7%
        const allBase = result.mcCeliRate === 7 && result.mcReerRate === 7 && result.mcNonRegRate === 7;
        expect(allBase).toBe(false);
    });

    it('la séquence historique override les taux MC pour l\'année correspondante', () => {
        // Arrange — replay 2008 : sp500=-36.55, bond=20.10, inflation=0.09
        const historicalSeq = [
            { year: 2008, sp500TotalReturn: -36.55, bondReturn: 20.10, inflationRate: 0.09 },
        ];

        // Act
        const result = computeMonthlyMarketRates(0, true, baseRates, 2, historicalSeq, null, rng);

        // Assert — taux overridés par l'historique
        expect(result.mcCeliRate).toBeCloseTo(-36.55, 2);
        expect(result.mcReerRate).toBeCloseTo(-36.55, 2);
        expect(result.mcCashRate).toBeCloseTo(20.10, 2);
    });

    it('stress test ajoute un choc d\'inflation pendant la fenêtre', () => {
        // Arrange — crash à l'an 2 (mois 24), recovery 12 mois, inflation shock +5
        const stressTest: StressTestConfig = {
            enabled: true,
            year: 2,
            recoveryMonths: 12,
            inflationShock: 5,
        };

        // Act — mois 30, dans la fenêtre [24..36]
        const result = computeMonthlyMarketRates(30, false, baseRates, 2, null, stressTest, rng);

        // Assert — inflation de base 2 + choc 5 = 7
        expect(result.currentInflation).toBeCloseTo(7, 5);
    });

    it('stress test n\'affecte pas l\'inflation hors fenêtre', () => {
        // Arrange
        const stressTest: StressTestConfig = {
            enabled: true,
            year: 2,
            recoveryMonths: 12,
            inflationShock: 5,
        };

        // Act — mois 100, après la fenêtre [24..36]
        const result = computeMonthlyMarketRates(100, false, baseRates, 2, null, stressTest, rng);

        // Assert — inflation inchangée
        expect(result.currentInflation).toBe(2);
    });

    it('stress test désactivé n\'affecte rien', () => {
        // Arrange
        const stressTest: StressTestConfig = {
            enabled: false,
            year: 2,
            recoveryMonths: 12,
            inflationShock: 10,
        };

        // Act
        const result = computeMonthlyMarketRates(30, false, baseRates, 2, null, stressTest, rng);

        // Assert
        expect(result.currentInflation).toBe(2);
    });
});
