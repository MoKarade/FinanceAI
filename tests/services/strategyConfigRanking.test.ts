import { describe, it, expect } from 'vitest';
import {
    rankConfigResults,
    explainWinner,
    decisiveLevers,
} from '../../services/projection/strategyConfigRanking';
import { applyConfigToSettings } from '../../services/projection/strategyConfig';
import type { ConfigResult } from '../../services/projection/strategySearch';
import type { StrategyConfig } from '../../services/projection/strategyConfig';
import type { ProjectionConfig, RetirementGoal } from '../../types';

// G21 C5 commit 5 — tests du classement par objectif + explication du gagnant.
// Données ConfigResult fabriquées à la main (le module est PUR, aucun moteur).

const cfg = (over: Partial<StrategyConfig> = {}): StrategyConfig => ({
    withdrawalOrder: 'AUTO_MARGINAL', delayPensions: false, retirementAge: 65, skipRap: false,
    contributionOrder: 'CELI_FIRST', retirementSpending: 1, smithManoeuvre: false, debtFirst: false,
    emergencyFundMonths: 6, assetLocation: false, gainHarvesting: false, returnRateProfile: 'balanced', pensionSplitting: true, ...over,
});

const res = (over: Partial<ConfigResult> = {}): ConfigResult => ({
    config: cfg(),
    successRate: 100, fvi: 80, finalNWp10: 100000, finalNWp50: 500000, finalNWp90: 900000,
    lifetimeTax: 200000, fireAge: 60, sequenceRiskPct: 10, ...over,
});

describe('strategyConfigRanking — rankConfigResults', () => {
    it('objectif wealth → classe par patrimoine médian (P50)', () => {
        const results = [
            res({ config: cfg({ retirementAge: 55 }), finalNWp50: 300000 }),
            res({ config: cfg({ retirementAge: 65 }), finalNWp50: 800000 }),
            res({ config: cfg({ retirementAge: 60 }), finalNWp50: 500000 }),
        ];
        const { ranked } = rankConfigResults(results, 'wealth');
        expect(ranked[0].result.finalNWp50).toBe(800000);
        expect(ranked[0].rank).toBe(1);
        expect(ranked[2].result.finalNWp50).toBe(300000);
    });

    it('objectif tax → classe par impôt à vie croissant (moins = mieux)', () => {
        const results = [
            res({ config: cfg({ contributionOrder: 'REER_FIRST' }), lifetimeTax: 300000 }),
            res({ config: cfg({ contributionOrder: 'CELI_FIRST' }), lifetimeTax: 150000 }),
        ];
        const { ranked } = rankConfigResults(results, 'tax');
        expect(ranked[0].result.lifetimeTax).toBe(150000);
    });

    it('objectif fire → classe par âge FIRE le plus tôt ; null = dernier', () => {
        const results = [
            res({ config: cfg({ retirementAge: 65 }), fireAge: 62 }),
            res({ config: cfg({ retirementAge: 55 }), fireAge: 50 }),
            res({ config: cfg({ retirementAge: 60 }), fireAge: null }),
        ];
        const { ranked } = rankConfigResults(results, 'fire');
        expect(ranked[0].result.fireAge).toBe(50);
        expect(ranked[2].result.fireAge).toBeNull(); // jamais atteint → score 0 → dernier
    });

    it('garde de survie : un patrimoine énorme mais qui s\'épuise ne gagne pas', () => {
        const results = [
            res({ config: cfg({ retirementAge: 55 }), finalNWp50: 2_000_000, successRate: 40 }), // riche mais fragile
            res({ config: cfg({ retirementAge: 65 }), finalNWp50: 600000, successRate: 95 }),     // robuste
        ];
        const { ranked, hasSurvivor } = rankConfigResults(results, 'wealth', { survivalThreshold: 80 });
        expect(hasSurvivor).toBe(true);
        expect(ranked[0].survived).toBe(true);
        expect(ranked[0].result.successRate).toBe(95); // le robuste passe devant malgré moins de patrimoine
        expect(ranked[1].survived).toBe(false);
    });

    it('aucun survivant → hasSurvivor=false mais classe quand même par score', () => {
        const results = [
            res({ successRate: 50, finalNWp50: 400000 }),
            res({ successRate: 60, finalNWp50: 700000 }),
        ];
        const { ranked, hasSurvivor } = rankConfigResults(results, 'wealth', { survivalThreshold: 80 });
        expect(hasSurvivor).toBe(false);
        expect(ranked[0].result.finalNWp50).toBe(700000); // meilleur des mauvais
        expect(ranked.every(r => !r.survived)).toBe(true);
    });

    it('breakdown : sous-scores normalisés présents et bornés [0,1]', () => {
        const results = [res({ finalNWp50: 800000 }), res({ finalNWp50: 200000 })];
        const { ranked } = rankConfigResults(results, 'balanced');
        for (const r of ranked) {
            for (const v of Object.values(r.breakdown)) {
                expect(v).toBeGreaterThanOrEqual(0);
                expect(v).toBeLessThanOrEqual(1);
            }
        }
        // Le plus riche a wealth=1, le plus pauvre wealth=0.
        expect(ranked.find(r => r.result.finalNWp50 === 800000)!.breakdown.wealth).toBe(1);
        expect(ranked.find(r => r.result.finalNWp50 === 200000)!.breakdown.wealth).toBe(0);
    });

    it('liste vide → résultat vide sans crash', () => {
        const { ranked, hasSurvivor } = rankConfigResults([], 'balanced');
        expect(ranked).toEqual([]);
        expect(hasSurvivor).toBe(false);
    });
});

describe('strategyConfigRanking — decisiveLevers', () => {
    it('repère les leviers dont la valeur diffère', () => {
        const winner = cfg({ retirementAge: 60, contributionOrder: 'REER_FIRST' });
        const runner = cfg({ retirementAge: 65, contributionOrder: 'REER_FIRST' });
        const levers = decisiveLevers(winner, runner);
        expect(levers).toHaveLength(1);
        expect(levers[0].key).toBe('retirementAge');
        expect(levers[0].label).toBe('Âge de retraite');
        expect(levers[0].winnerValue).toBe('60 ans');
        expect(levers[0].runnerValue).toBe('65 ans');
    });

    it('configs identiques → aucun levier décisif', () => {
        expect(decisiveLevers(cfg(), cfg())).toHaveLength(0);
    });
});

describe('strategyConfig — applyConfigToSettings (Appliquer)', () => {
    const proj = (): ProjectionConfig => ({
        years: 30, returnRate: 6, inflationRate: 2, savingsMode: 'manual',
        manualContribution: 1500, usePortfolioRate: false,
        returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
        emergencyFundMonths: 6, useSmithManoeuvre: false,
    } as ProjectionConfig);
    const goal = (): RetirementGoal => ({ targetAge: 65, targetMonthlyIncome: 5000, governmentPension: 1500 } as RetirementGoal);

    it('écrit les leviers orthogonaux dans projection + âge/dépenses dans retirementGoal', () => {
        const out = applyConfigToSettings(cfg({
            retirementAge: 60, retirementSpending: 1.1, emergencyFundMonths: 12, smithManoeuvre: true,
            contributionOrder: 'REER_FIRST', debtFirst: true, skipRap: true, assetLocation: true,
            withdrawalOrder: 'PRIO_REER', delayPensions: true,
        }), proj(), goal());

        expect(out.projection.emergencyFundMonths).toBe(12);
        expect(out.projection.useSmithManoeuvre).toBe(true);
        expect(out.projection.appliedContributionOrder).toBe('REER_FIRST');
        expect(out.projection.appliedDebtFirst).toBe(true);
        expect(out.projection.appliedSkipRap).toBe(true);
        expect(out.projection.appliedAssetLocation).toBe(true);
        expect(out.retirementGoal.targetAge).toBe(60);
        expect(out.retirementGoal.targetMonthlyIncome).toBe(5500); // 5000 × 1.1
        // withdrawalOrder + delayPensions retournés à part (pour sélection de scénario).
        expect(out.strategy).toBe('PRIO_REER');
        expect(out.delayPensions).toBe(true);
    });

    it('n\'altère pas l\'asset location dans returnRates (flag seulement, idempotent)', () => {
        const base = proj();
        const out = applyConfigToSettings(cfg({ assetLocation: true }), base, goal());
        // returnRates inchangés ; seul le flag est posé (le bonus est appliqué par le moteur).
        expect(out.projection.returnRates!.nonReg).toBe(base.returnRates!.nonReg);
        expect(out.projection.appliedAssetLocation).toBe(true);
    });
});

describe('strategyConfigRanking — explainWinner', () => {
    it('compare gagnant vs dauphin et nomme les leviers décisifs', () => {
        const winner = { result: res({ config: cfg({ retirementAge: 65 }), successRate: 98, finalNWp50: 800000, lifetimeTax: 150000, fireAge: 60 }), rank: 1, score: 0.9, survived: true, breakdown: { survival: 0.98, wealth: 1, tax: 1, fire: 1, robustness: 0.9 } };
        const runner = { result: res({ config: cfg({ retirementAge: 55 }), successRate: 90, finalNWp50: 500000, lifetimeTax: 250000, fireAge: 62 }), rank: 2, score: 0.7, survived: true, breakdown: { survival: 0.9, wealth: 0, tax: 0, fire: 0, robustness: 0.8 } };
        const text = explainWinner(winner, runner, 'balanced');
        expect(text).toContain('98 %');
        expect(text).toContain('Leviers décisifs');
        expect(text).toContain('Âge de retraite');
    });

    it('sans dauphin (1 seule config) → décrit seulement le gagnant', () => {
        const winner = { result: res({ successRate: 95, finalNWp50: 600000, fireAge: 58 }), rank: 1, score: 0.8, survived: true, breakdown: { survival: 0.95, wealth: 0.5, tax: 0.5, fire: 0.5, robustness: 0.9 } };
        const text = explainWinner(winner, null, 'wealth');
        expect(text).toContain('95 %');
        expect(text).not.toContain('dauphin');
    });
});
