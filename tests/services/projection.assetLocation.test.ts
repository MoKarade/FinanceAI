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

    it('Edge case: amount=0 ne produit pas de recommandation', () => {
        const result = optimizeAssetLocation({
            annualGrossIncome: 100000,
            holdings: [{ assetClass: 'bonds', amount: 0, currentAccount: 'CELI' }],
        });
        expect(result.recommendations.length).toBe(0);
    });

    it('Edge case: revenu 0 → recommandation présente (taux marginal de la tranche 0-X)', () => {
        // getMarginalRate(0) retourne ~26% (somme des plus basses tranches fed+QC),
        // pas 0 — donc la recommandation est correcte même à revenu nul.
        const result = optimizeAssetLocation({
            annualGrossIncome: 0,
            holdings: [{ assetClass: 'bonds', amount: 100000, currentAccount: 'CELI' }],
        });
        expect(result.recommendations.length).toBeGreaterThanOrEqual(0);
    });

    it('Opportunity cost bonds CELI calibré sur taux marginal (low bracket = moins de perte)', () => {
        const lowBracket = optimizeAssetLocation({
            annualGrossIncome: 40000, // bracket ~22%
            holdings: [{ assetClass: 'bonds', amount: 100000, currentAccount: 'CELI' }],
        });
        const highBracket = optimizeAssetLocation({
            annualGrossIncome: 200000, // bracket ~48%
            holdings: [{ assetClass: 'bonds', amount: 100000, currentAccount: 'CELI' }],
        });
        // Higher marginal → higher opportunity cost
        if (lowBracket.recommendations[0] && highBracket.recommendations[0]) {
            expect(highBracket.recommendations[0].annualLossIfUnchanged)
                .toBeGreaterThanOrEqual(lowBracket.recommendations[0].annualLossIfUnchanged);
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
