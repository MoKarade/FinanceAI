// tests/services/vehicleCycle.test.ts
// Couverture de processAutoVehicleReplacement : déclenchement cyclique,
// calcul inflationnaire du coût, conditions de guard.

import { describe, it, expect } from 'vitest';
import { processAutoVehicleReplacement } from '../../services/projection/vehicleCycle';

describe('processAutoVehicleReplacement', () => {
    it('ne fait rien si l\'option est désactivée', () => {
        // Arrange
        const enabled = false;

        // Act
        const result = processAutoVehicleReplacement(120, 120, enabled, 2);

        // Assert
        expect(result.cost).toBe(0);
        expect(result.resetCounter).toBe(false);
    });

    it('ne fait rien au mois 0', () => {
        // Arrange — mois 0 = début simulation

        // Act
        const result = processAutoVehicleReplacement(0, 120, true, 2);

        // Assert
        expect(result.cost).toBe(0);
        expect(result.resetCounter).toBe(false);
    });

    it('ne fait rien si moins de 120 mois depuis dernier remplacement', () => {
        // Arrange
        const result = processAutoVehicleReplacement(240, 60, true, 2);

        // Assert — seulement 60 mois depuis le dernier
        expect(result.cost).toBe(0);
        expect(result.resetCounter).toBe(false);
    });

    it('déclenche le remplacement à 120 mois depuis dernier (10 ans)', () => {
        // Arrange
        const result = processAutoVehicleReplacement(240, 120, true, 0);

        // Assert — inflation 0% → coût = 35000
        expect(result.cost).toBeCloseTo(35000, 0);
        expect(result.resetCounter).toBe(true);
        expect(result.logMsg).toBeDefined();
    });

    it('applique l\'inflation au coût du véhicule', () => {
        // Arrange — mois 120 (10 ans), inflation 3% → coût = 35000 × (1.03)^10
        const expectedCost = 35000 * Math.pow(1.03, 10);

        // Act
        const result = processAutoVehicleReplacement(120, 120, true, 3);

        // Assert
        expect(result.cost).toBeCloseTo(expectedCost, 0);
    });
});
