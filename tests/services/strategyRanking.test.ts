import { describe, it, expect } from 'vitest';
import { rankStrategies, type RankableScenario } from '../../services/projection/strategyRanking';

// 3 scénarios synthétiques aux profils opposés pour valider que chaque objectif
// choisit bien le bon gagnant, indépendamment de l'UI.
const fireEarly: RankableScenario = {
    strategyName: 'FIRE tôt',
    estateNetWorth: 1_000_000,
    totalTaxesPaid: 300_000,
    minNetWorth: 50_000,
    // atteint la cible FIRE dès 50 ans
    chartData: [
        { monthIndex: 0, age: 40, NetWorth: 100_000, FireTarget: 800_000 },
        { monthIndex: 120, age: 50, NetWorth: 850_000, FireTarget: 800_000 },
        { monthIndex: 240, age: 60, NetWorth: 1_000_000, FireTarget: 800_000 },
    ],
};
const wealthMax: RankableScenario = {
    strategyName: 'Patrimoine max',
    estateNetWorth: 3_000_000, // gagnant patrimoine
    totalTaxesPaid: 600_000, // mais impôt le plus élevé
    minNetWorth: 80_000,
    chartData: [
        { monthIndex: 0, age: 40, NetWorth: 100_000, FireTarget: 800_000 },
        { monthIndex: 240, age: 60, NetWorth: 900_000, FireTarget: 800_000 }, // FIRE tard
        { monthIndex: 360, age: 70, NetWorth: 3_000_000, FireTarget: 800_000 },
    ],
};
const taxLow: RankableScenario = {
    strategyName: 'Impôt bas',
    estateNetWorth: 1_500_000,
    totalTaxesPaid: 150_000, // gagnant impôt
    minNetWorth: 120_000, // gagnant robustesse
    chartData: [
        { monthIndex: 0, age: 40, NetWorth: 100_000, FireTarget: 800_000 },
        { monthIndex: 300, age: 65, NetWorth: 1_000_000, FireTarget: 800_000 }, // FIRE le plus tard
        { monthIndex: 360, age: 70, NetWorth: 1_500_000, FireTarget: 800_000 },
    ],
};
const scenarios = [fireEarly, wealthMax, taxLow]; // indices 0,1,2

describe('rankStrategies', () => {
    it('objectif patrimoine → choisit le plus gros patrimoine', () => {
        const r = rankStrategies(scenarios, 'wealth');
        expect(r.bestIndex).toBe(1); // wealthMax
        expect(r.ranked[0].strategyName).toBe('Patrimoine max');
    });

    it('objectif impôt → choisit le plus faible impôt', () => {
        const r = rankStrategies(scenarios, 'tax');
        expect(r.bestIndex).toBe(2); // taxLow
    });

    it('objectif FIRE → choisit celui qui atteint la cible le plus tôt', () => {
        const r = rankStrategies(scenarios, 'fire');
        expect(r.bestIndex).toBe(0); // fireEarly (50 ans)
        expect(r.ranked[0].fireAge).toBe(50);
    });

    it('objectif équilibré → score pondéré, meilleur en tête, tous notés', () => {
        const r = rankStrategies(scenarios, 'balanced');
        expect(r.ranked).toHaveLength(3);
        // le meilleur score est en première position
        expect(r.ranked[0].score).toBeGreaterThanOrEqual(r.ranked[1].score);
        expect(r.ranked[1].score).toBeGreaterThanOrEqual(r.ranked[2].score);
        expect(r.bestIndex).toBe(r.ranked[0].index);
    });

    it('liste vide → résultat vide sans planter', () => {
        const r = rankStrategies([], 'balanced');
        expect(r.ranked).toHaveLength(0);
        expect(r.bestIndex).toBe(0);
    });

    it('éligibilité : ne classe que les stratégies, en préservant l\'index d\'origine', () => {
        // index 0 = stress (patrimoine énorme mais monde différent), 1 et 2 = stratégies.
        const list = [
            { ...wealthMax, strategyName: 'Monde chanceux', kind: 'stress' as const },
            { ...fireEarly, strategyName: 'Gestion A', kind: 'strategy' as const },
            { ...taxLow, strategyName: 'Gestion B', kind: 'strategy' as const },
        ];
        const r = rankStrategies(list, 'wealth', { eligible: (s: RankableScenario & { kind?: string }) => s.kind === 'strategy' });
        // le stress (index 0, plus gros patrimoine) est EXCLU du classement
        expect(r.ranked).toHaveLength(2);
        expect(r.ranked.every((x) => x.strategyName !== 'Monde chanceux')).toBe(true);
        // bestIndex reste un index du tableau d'origine (1 ou 2, pas 0)
        expect([1, 2]).toContain(r.bestIndex);
        // taxLow (index 2) a le plus gros patrimoine parmi les stratégies → gagne en 'wealth'
        expect(r.bestIndex).toBe(2);
    });

    it('un scénario qui n\'atteint jamais FIRE a fireAge null', () => {
        const never: RankableScenario = {
            strategyName: 'Jamais FIRE', estateNetWorth: 500_000, totalTaxesPaid: 200_000, minNetWorth: 10_000,
            chartData: [{ monthIndex: 0, age: 40, NetWorth: 100_000, FireTarget: 9_000_000 }],
        };
        const r = rankStrategies([never], 'fire');
        expect(r.ranked[0].fireAge).toBeNull();
    });
});
