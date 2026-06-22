import { describe, it, expect, beforeEach } from 'vitest';
import { loadLegacyHealthWeights, DEFAULT_HEALTH_WEIGHTS, LEGACY_HEALTH_WEIGHTS_KEY } from '../../utils/healthWeights';

describe('loadLegacyHealthWeights — [PH4D-WEIGHTS-STORE] migration localStorage → store', () => {
    beforeEach(() => { localStorage.clear(); });

    it('clé absente → défauts (utilisateur sans poids personnalisés)', () => {
        expect(loadLegacyHealthWeights()).toEqual(DEFAULT_HEALTH_WEIGHTS);
    });

    it('poids valides complets → repris à l\'identique (les poids de l\'utilisateur sont MIGRÉS, pas perdus)', () => {
        const custom = { savingsRate: 50, emergencyFund: 10, debtRatio: 15, fireProgress: 25 };
        localStorage.setItem(LEGACY_HEALTH_WEIGHTS_KEY, JSON.stringify(custom));
        expect(loadLegacyHealthWeights()).toEqual(custom);
    });

    it('champ manquant → ce champ prend le défaut, les autres sont gardés', () => {
        localStorage.setItem(LEGACY_HEALTH_WEIGHTS_KEY, JSON.stringify({ savingsRate: 40, emergencyFund: 30 }));
        expect(loadLegacyHealthWeights()).toEqual({
            savingsRate: 40, emergencyFund: 30,
            debtRatio: DEFAULT_HEALTH_WEIGHTS.debtRatio, fireProgress: DEFAULT_HEALTH_WEIGHTS.fireProgress,
        });
    });

    it('champ non-numérique / NaN → défaut (robustesse, pas un poids invalide)', () => {
        localStorage.setItem(LEGACY_HEALTH_WEIGHTS_KEY, JSON.stringify({ savingsRate: 'abc', emergencyFund: null, debtRatio: 20, fireProgress: 30 }));
        expect(loadLegacyHealthWeights()).toEqual({
            savingsRate: DEFAULT_HEALTH_WEIGHTS.savingsRate,
            emergencyFund: DEFAULT_HEALTH_WEIGHTS.emergencyFund,
            debtRatio: 20, fireProgress: 30,
        });
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
