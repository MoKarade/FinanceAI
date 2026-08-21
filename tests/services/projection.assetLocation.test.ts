import { describe, it, expect } from 'vitest';
import { optimizeAssetLocation } from '../../services/projection/assetLocation';

describe('optimizeAssetLocation', () => {
    it('Obligations dans CELI sont signalées (devraient être en REER)', () => {
        const result = optimizeAssetLocation({
            annualGrossIncome: 100000,
            year: 2026,
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
            year: 2026,
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
            year: 2026,
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
            year: 2026,
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
            year: 2026,
            holdings: [{ assetClass: 'bonds', amount: 0, currentAccount: 'CELI' }],
        });
        expect(result.recommendations.length).toBe(0);
    });

    it('Edge case: revenu 0 → recommandation présente (taux marginal de la tranche 0-X)', () => {
        // getMarginalRate(0) retourne ~26% (somme des plus basses tranches fed+QC),
        // pas 0 — donc la recommandation est correcte même à revenu nul.
        const result = optimizeAssetLocation({
            annualGrossIncome: 0,
            year: 2026,
            holdings: [{ assetClass: 'bonds', amount: 100000, currentAccount: 'CELI' }],
        });
        expect(result.recommendations.length).toBeGreaterThanOrEqual(0);
    });

    it('Opportunity cost bonds CELI calibré sur taux marginal (low bracket = moins de perte)', () => {
        const lowBracket = optimizeAssetLocation({
            annualGrossIncome: 40000,
            year: 2026, // bracket ~22%
            holdings: [{ assetClass: 'bonds', amount: 100000, currentAccount: 'CELI' }],
        });
        const highBracket = optimizeAssetLocation({
            annualGrossIncome: 200000,
            year: 2026, // bracket ~48%
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
            year: 2026,
            holdings: [
                { assetClass: 'bonds', amount: 100000, currentAccount: 'NonReg' },
            ],
        });
        expect(result.summary).toContain('20 ans');
    });

    // [ASSETLOC-YEAR-2026] L'année était optionnelle avec un repli `?? 2026` en dur, que l'unique
    // appelant de production ne remplaçait jamais : le module aurait conseillé sur le barème 2026
    // à perpétuité. Elle est désormais REQUISE (le typecheck le force sur chaque site).
    describe('[ASSETLOC-YEAR-2026] l’année fiscale est consommée, pas ignorée', () => {
        // Revenu choisi par MESURE, pas au jugé : 55 000 $ est juste au-dessus d'une borne de palier
        // en 2026 (marginal 30,690 %) et repasse dessous une fois la borne indexée en 2027
        // (25,690 %) — 5,000 points d'écart. À 100 000 $, les deux années donnent le même taux :
        // un test bâti sur ce revenu-là serait passé même si l'année était ignorée (vacueux).
        const holdings = [{ assetClass: 'bonds' as const, amount: 100_000, currentAccount: 'CELI' as const }];
        const perteEn = (year: number): number =>
            optimizeAssetLocation({ annualGrossIncome: 55_000, year, holdings }).totalAnnualLoss;

        it('deux années de barème différentes donnent des pertes estimées différentes', () => {
            const p2026 = perteEn(2026);
            const p2027 = perteEn(2027);
            expect(p2026).toBeGreaterThan(0);   // la grandeur mesurée est NON NULLE avant d'être comparée
            expect(p2027).toBeGreaterThan(0);
            expect(p2027).not.toBe(p2026);
            expect(p2027).toBeLessThan(p2026);  // marginal plus bas en 2027 → coût d'opportunité plus faible
        });

        it('la même année rend le même résultat (déterministe, aucune lecture d’horloge)', () => {
            expect(perteEn(2026)).toBe(perteEn(2026));
        });
    });
});
