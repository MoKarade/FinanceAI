import { describe, it, expect, beforeEach } from 'vitest';
import { loadLegacyHealthWeights, normalizeHealthWeights, DEFAULT_HEALTH_WEIGHTS, LEGACY_HEALTH_WEIGHTS_KEY } from '../../utils/healthWeights';

describe('normalizeHealthWeights — [PH4D-BUDGET-RATIOS] rétrocompat 4→6 champs', () => {
    it('undefined/null → tous les défauts (6 champs)', () => {
        expect(normalizeHealthWeights(undefined)).toEqual(DEFAULT_HEALTH_WEIGHTS);
        expect(normalizeHealthWeights(null)).toEqual(DEFAULT_HEALTH_WEIGHTS);
    });
    it('état 4 champs (avant PH4D-BUDGET-RATIOS) → garde les 4, complète budgetParity/subscriptionLoad au défaut', () => {
        const old4 = { savingsRate: 30, emergencyFund: 20, debtRatio: 20, fireProgress: 30 };
        expect(normalizeHealthWeights(old4)).toEqual({
            ...old4,
            budgetParity: DEFAULT_HEALTH_WEIGHTS.budgetParity,
            subscriptionLoad: DEFAULT_HEALTH_WEIGHTS.subscriptionLoad,
        });
    });
    it('valeurs non-numériques → défaut par champ', () => {
        expect(normalizeHealthWeights({ savingsRate: NaN, budgetParity: 'x' as unknown as number })).toEqual(DEFAULT_HEALTH_WEIGHTS);
    });
    it('les 6 champs custom sont tous gardés', () => {
        const full = { savingsRate: 10, emergencyFund: 10, debtRatio: 10, fireProgress: 10, budgetParity: 10, subscriptionLoad: 10 };
        expect(normalizeHealthWeights(full)).toEqual(full);
    });
});

describe('loadLegacyHealthWeights — [PH4D-WEIGHTS-STORE] migration localStorage → store', () => {
    beforeEach(() => { localStorage.clear(); });

    it('clé absente → défauts (utilisateur sans poids personnalisés)', () => {
        expect(loadLegacyHealthWeights()).toEqual(DEFAULT_HEALTH_WEIGHTS);
    });

    it('poids valides (4 champs hérités) → migrés + les 2 nouveaux champs (PH4D-BUDGET-RATIOS) au défaut', () => {
        const custom = { savingsRate: 50, emergencyFund: 10, debtRatio: 15, fireProgress: 25 };
        localStorage.setItem(LEGACY_HEALTH_WEIGHTS_KEY, JSON.stringify(custom));
        // Rétrocompat 4→6 : les poids hérités sont gardés, budgetParity/subscriptionLoad complétés au défaut.
        expect(loadLegacyHealthWeights()).toEqual({ ...DEFAULT_HEALTH_WEIGHTS, ...custom });
    });

    it('champ manquant → ce champ prend le défaut, les autres sont gardés', () => {
        localStorage.setItem(LEGACY_HEALTH_WEIGHTS_KEY, JSON.stringify({ savingsRate: 40, emergencyFund: 30 }));
        expect(loadLegacyHealthWeights()).toEqual({ ...DEFAULT_HEALTH_WEIGHTS, savingsRate: 40, emergencyFund: 30 });
    });

    it('champ non-numérique / NaN → défaut (robustesse, pas un poids invalide)', () => {
        localStorage.setItem(LEGACY_HEALTH_WEIGHTS_KEY, JSON.stringify({ savingsRate: 'abc', emergencyFund: null, debtRatio: 20, fireProgress: 30 }));
        expect(loadLegacyHealthWeights()).toEqual({ ...DEFAULT_HEALTH_WEIGHTS, debtRatio: 20, fireProgress: 30 });
    });

    it('JSON corrompu → défauts (ne jette jamais)', () => {
        localStorage.setItem(LEGACY_HEALTH_WEIGHTS_KEY, '{pas du json');
        expect(loadLegacyHealthWeights()).toEqual(DEFAULT_HEALTH_WEIGHTS);
    });

    it('renvoie une COPIE des défauts (pas la référence partagée → pas de mutation accidentelle)', () => {
        const a = loadLegacyHealthWeights();
        a.savingsRate = 999;
        expect(DEFAULT_HEALTH_WEIGHTS.savingsRate).not.toBe(999);
    });
});
