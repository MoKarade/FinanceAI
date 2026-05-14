import { describe, it, expect } from 'vitest';
import { optimizeAssetLocation } from '../../services/projection/assetLocation';

describe('optimizeAssetLocation', () => {
    it('Obligations dans CELI sont signalées (devraient être en REER)', () => {
        const result = optimizeAssetLocation({
            annualGrossIncome: 100000,
            holdings: [
                { assetClass: 'bonds', amount: 50000, currentAccount: 'CELI' },
            ],
        });
        expect(result.recommendations.length).toBe(1);
        expect(result.recommendations[0].recommendedAccount).toBe('REER');
    });

    it('US equity dans CELI signale le drag de withholding 15%', () => {
        const result = optimizeAssetLocation({
            annualGrossIncome: 100000,
            holdings: [
                { assetClass: 'us-equity', amount: 100000, currentAccount: 'CELI' },
            ],
        });
        expect(result.recommendations.length).toBe(1);
        expect(result.recommendations[0].recommendedAccount).toBe('REER');
        expect(result.totalAnnualLoss).toBeGreaterThan(0);
    });

    it('Allocation déjà optimale: pas de recommandation', () => {
        const result = optimizeAssetLocation({
            annualGrossIncome: 100000,
            holdings: [
                { assetClass: 'bonds', amount: 50000, currentAccount: 'REER' },
                { assetClass: 'ca-equity', amount: 80000, currentAccount: 'CELI' },
                { assetClass: 'us-equity', amount: 60000, currentAccount: 'REER' },
            ],
        });
        expect(result.recommendations.length).toBe(0);
        expect(result.totalAnnualLoss).toBe(0);
        expect(result.summary).toContain('optimale');
    });

    it('Recommandations triées par perte décroissante', () => {
        const result = optimizeAssetLocation({
            annualGrossIncome: 150000,
            holdings: [
                { assetClass: 'bonds', amount: 200000, currentAccount: 'NonReg' },
                { assetClass: 'growth-small', amount: 10000, currentAccount: 'REER' },
                { assetClass: 'reit', amount: 50000, currentAccount: 'NonReg' },
            ],
        });
        const losses = result.recommendations.map(r => r.annualLossIfUnchanged);
        for (let i = 1; i < losses.length; i++) {
            expect(losses[i]).toBeLessThanOrEqual(losses[i - 1]);
        }
    });

    it('Summary mentionne le 20 ans cumulé', () => {
        const result = optimizeAssetLocation({
            annualGrossIncome: 100000,
            holdings: [
                { assetClass: 'bonds', amount: 100000, currentAccount: 'NonReg' },
            ],
        });
        expect(result.summary).toContain('20 ans');
    });
});
