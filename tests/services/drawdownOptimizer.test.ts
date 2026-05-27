// tests/services/drawdownOptimizer.test.ts
// Couverture de compareLifeScenarios (alias optimizeDrawdownOrder) :
// sélection du meilleur scénario, cas allResults vide, classement et explication.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock du module services/projection pour isoler compareLifeScenarios
vi.mock('../../services/projection', () => ({
    calculateFutureProjection: vi.fn(),
}));

import { calculateFutureProjection } from '../../services/projection';
import { compareLifeScenarios, optimizeDrawdownOrder } from '../../services/projection/drawdownOptimizer';
import type { SimulationParams } from '../../services/projection';

const mockCalculate = vi.mocked(calculateFutureProjection);

// Paramètres minimaux (jamais exécutés, le mock prend le relais)
const fakeParams = {} as SimulationParams;

// Helpers pour construire des scénarios fictifs
const makeScenario = (
    stratType: string,
    estateNetWorth: number,
    finalNetWorth: number,
) => ({
    stratType,
    strategyName: `Stratégie ${stratType}`,
    estateNetWorth,
    finalNetWorth,
    totalTaxesPaid: 0,
    gainVsAuto: 0,
    pros: ['Avantage A'],
    cons: ['Inconvénient B'],
    icon: '📊',
    chartData: [],
    minNetWorth: 0,
});

beforeEach(() => {
    vi.clearAllMocks();
});

describe('compareLifeScenarios', () => {
    it('retourne le signal explicite quand allResults est vide', () => {
        // Arrange
        mockCalculate.mockReturnValue({ allResults: [] } as unknown as ReturnType<typeof calculateFutureProjection>);

        // Act
        const result = compareLifeScenarios(fakeParams);

        // Assert
        expect(result.bestScenario).toBe('—');
        expect(result.bestEstateNetWorth).toBe(0);
        expect(result.results).toHaveLength(0);
        expect(result.explanation).toContain('Aucun scénario calculable');
    });

    it('retourne le signal explicite quand allResults est undefined', () => {
        // Arrange
        mockCalculate.mockReturnValue({} as unknown as ReturnType<typeof calculateFutureProjection>);

        // Act
        const result = compareLifeScenarios(fakeParams);

        // Assert
        expect(result.bestScenario).toBe('—');
        expect(result.results).toHaveLength(0);
    });

    it('identifie le meilleur scénario par estateNetWorth', () => {
        // Arrange
        mockCalculate.mockReturnValue({
            allResults: [
                makeScenario('BASE', 300000, 280000),
                makeScenario('WINDFALL', 700000, 650000),
                makeScenario('HYPER_INFLATION', 150000, 120000),
            ],
        } as unknown as ReturnType<typeof calculateFutureProjection>);

        // Act
        const result = compareLifeScenarios(fakeParams);

        // Assert — WINDFALL a la plus haute estateNetWorth
        expect(result.bestScenario).toBe('Stratégie WINDFALL');
        expect(result.bestEstateNetWorth).toBe(700000);
    });

    it('retourne tous les scénarios dans les résultats', () => {
        // Arrange
        mockCalculate.mockReturnValue({
            allResults: [
                makeScenario('BASE', 300000, 280000),
                makeScenario('WINDFALL', 700000, 650000),
                makeScenario('ECONOMIC_WINTER', 100000, 80000),
            ],
        } as unknown as ReturnType<typeof calculateFutureProjection>);

        // Act
        const result = compareLifeScenarios(fakeParams);

        // Assert
        expect(result.results).toHaveLength(3);
    });

    it('inclut l\'écart entre meilleur et pire dans l\'explication', () => {
        // Arrange
        mockCalculate.mockReturnValue({
            allResults: [
                makeScenario('BASE', 500000, 480000),
                makeScenario('ECONOMIC_WINTER', 200000, 180000),
            ],
        } as unknown as ReturnType<typeof calculateFutureProjection>);

        // Act
        const result = compareLifeScenarios(fakeParams);

        // Assert — écart = 300000, l'explication doit le mentionner
        expect(result.explanation).toContain('300');
        expect(result.explanation).toContain('%');
    });

    it('normalise les champs manquants avec des valeurs par défaut', () => {
        // Arrange — scénario avec champs manquants
        mockCalculate.mockReturnValue({
            allResults: [
                {
                    // Aucun champ optionnel fourni
                    stratType: undefined,
                    strategyName: undefined,
                    estateNetWorth: undefined,
                    finalNetWorth: undefined,
                    totalTaxesPaid: undefined,
                    gainVsAuto: undefined,
                    pros: undefined,
                    cons: undefined,
                    icon: undefined,
                    chartData: [],
                },
            ],
        } as unknown as ReturnType<typeof calculateFutureProjection>);

        // Act — ne doit pas crasher
        const result = compareLifeScenarios(fakeParams);

        // Assert — valeurs par défaut appliquées
        expect(result.results[0].scenarioType).toBe('—');
        expect(result.results[0].estateNetWorth).toBe(0);
        expect(result.results[0].pros).toEqual([]);
        expect(result.results[0].cons).toEqual([]);
        expect(result.results[0].icon).toBe('📊');
    });
});

describe('optimizeDrawdownOrder (alias backward compat)', () => {
    it('est l\'alias de compareLifeScenarios', () => {
        // Assert
        expect(optimizeDrawdownOrder).toBe(compareLifeScenarios);
    });
});
