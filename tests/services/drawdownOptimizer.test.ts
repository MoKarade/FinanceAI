// tests/services/drawdownOptimizer.test.ts
// Couverture de compareLifeScenarios :
// sélection du meilleur scénario, cas allResults vide, classement et explication.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock du module services/projection pour isoler compareLifeScenarios
vi.mock('../../services/projection', () => ({
    calculateFutureProjection: vi.fn(),
}));

import { calculateFutureProjection } from '../../services/projection';
import { compareLifeScenarios } from '../../services/projection/drawdownOptimizer';
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

    // [UI-SCEN] — compareLifeScenarios lance désormais UNE simulation PAR façon de gérer
    // (withdrawalStrategy paramétré, 5 runs) et lit allResults[0] de chaque run.
    const estateByStrategy: Record<string, number> = {
        AUTO_MARGINAL: 300000, PRIO_CELI: 700000, PRIO_REER: 150000,
        MELTDOWN_REER: 250000, PRIO_CELI_NO_RAP: 200000,
    };
    const mockPerStrategy = () => {
        mockCalculate.mockImplementation(((params: SimulationParams) => {
            const ws = (params.projection as { withdrawalStrategy?: string }).withdrawalStrategy ?? 'AUTO_MARGINAL';
            return {
                allResults: [makeScenario(ws, estateByStrategy[ws] ?? 0, estateByStrategy[ws] ?? 0)],
            };
        }) as unknown as typeof calculateFutureProjection);
    };

    it('identifie la meilleure STRATÉGIE par estateNetWorth (1 run paramétré par stratégie)', () => {
        mockPerStrategy();
        const result = compareLifeScenarios(fakeParams);
        expect(mockCalculate).toHaveBeenCalledTimes(5); // 5 façons de gérer
        expect(result.bestScenario).toBe('Stratégie PRIO_CELI');
        expect(result.bestEstateNetWorth).toBe(700000);
    });

    it('retourne les 5 stratégies dans les résultats, gainVsBase relatif à AUTO_MARGINAL', () => {
        mockPerStrategy();
        const result = compareLifeScenarios(fakeParams);
        expect(result.results).toHaveLength(5);
        const prioCeli = result.results.find(r => r.scenarioType === 'PRIO_CELI');
        expect(prioCeli!.gainVsBase).toBe(700000 - 300000); // vs AUTO_MARGINAL (1er run)
    });

    it('inclut l\'écart entre meilleur et pire dans l\'explication', () => {
        mockPerStrategy();
        const result = compareLifeScenarios(fakeParams);
        // Écart meilleur (PRIO_CELI 700k) − pire (PRIO_REER 150k) = 550 000.
        expect(result.explanation).toContain('550');
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

// [DETTE-DEPRECATED-DRAWDOWN] Le test « l'alias `optimizeDrawdownOrder` pointe bien sur
// `compareLifeScenarios` » est SUPPRIMÉ avec l'alias lui-même (2026-08-21). Il ne vérifiait rien
// d'autre que l'existence de l'alias : une tautologie sur une ligne d'affectation. Le garder après
// suppression n'aurait pas été possible ; le remplacer par un équivalent n'aurait aucun sens —
// la seule chose qu'il protégeait, c'était le second nom qu'on vient d'enlever.
