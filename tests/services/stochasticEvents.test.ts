/**
 * Lot 2 — stochasticEvents : événements aléatoires de la simulation (maladie
 * grave, héritage, mortalité, LTC, perte d'emploi, divorce, LTD). Toutes les
 * fonctions reçoivent `rng` INJECTÉ → on force rng() = 0 (déclenche) ou 0.99
 * (jamais), ce qui rend chaque trigger et chaque garde déterministe.
 */
import { describe, it, expect, vi } from 'vitest';
import {
    tryCriticalIllness,
    tryInheritance,
    tryMortality,
    tryLtcTrigger,
    ltcMonthlyCost,
    tickJobLoss,
    tryDivorce,
} from '../../services/projection/stochasticEvents';
import type { ProjectionConfig } from '../../types';

const proj = (o: Record<string, unknown>): ProjectionConfig => o as unknown as ProjectionConfig;
const mutator = () => ({ addLiquid: vi.fn(), addExpense: vi.fn(), logLife: vi.fn() });
const ctx = (rngVal: number, o: Record<string, unknown> = {}) => ({
    m: 12, currentMonthIndex: 0, age: 50, currentAge: 50,
    expenseMultiplier: 1, enableMonteCarlo: true, rng: () => rngVal, ...o,
});

describe('tryCriticalIllness', () => {
    const enabled = proj({ criticalIllnessEnabled: true, ciAnnualProbability: 0.5, ciPayoutAmount: 100000, ciExtraMonthlyExpense: 500 });

    it('déclenche (rng < p) : payout + dépense + log', () => {
        const mut = mutator();
        expect(tryCriticalIllness(ctx(0), enabled, false, mut)).toBe(true);
        expect(mut.addLiquid).toHaveBeenCalledWith(100000);
        expect(mut.addExpense).toHaveBeenCalledWith(500);
        expect(mut.logLife).toHaveBeenCalled();
    });

    it('ne déclenche pas si rng ≥ p', () => {
        expect(tryCriticalIllness(ctx(0.99), enabled, false, mutator())).toBe(false);
    });

    it('gardes : désactivé / hors-MC / déjà déclenché / hors-janvier → false', () => {
        expect(tryCriticalIllness(ctx(0), proj({ criticalIllnessEnabled: false }), false, mutator())).toBe(false);
        expect(tryCriticalIllness(ctx(0, { enableMonteCarlo: false }), enabled, false, mutator())).toBe(false);
        expect(tryCriticalIllness(ctx(0), enabled, true, mutator())).toBe(false);
        expect(tryCriticalIllness(ctx(0, { currentMonthIndex: 5 }), enabled, false, mutator())).toBe(false);
        expect(tryCriticalIllness(ctx(0, { m: 0 }), enabled, false, mutator())).toBe(false);
    });
});

describe('tryInheritance', () => {
    it('événement ponctuel (uncertainty 0) à l\'âge attendu : reçoit le montant', () => {
        const mut = mutator();
        const p = proj({ inheritanceEnabled: true, inheritanceExpectedAtAge: 50, inheritanceUncertaintyYears: 0, inheritanceProbability: 1, inheritanceExpectedAmount: 200000 });
        expect(tryInheritance(ctx(0, { age: 50 }), p, false, mut)).toBe(true);
        expect(mut.addLiquid).toHaveBeenCalledWith(200000);
    });

    it('montant ≤ 0 → jamais', () => {
        const p = proj({ inheritanceEnabled: true, inheritanceExpectedAmount: 0 });
        expect(tryInheritance(ctx(0), p, false, mutator())).toBe(false);
    });
});

describe('tryMortality', () => {
    const p = proj({ useStochasticMortality: true });
    it('rng < probabilité annuelle → décès', () => {
        expect(tryMortality(ctx(0, { age: 90 }), p, false)).toBe(true);
    });
    it('rng = 0.999 → survit (proba annuelle < 1)', () => {
        expect(tryMortality(ctx(0.999, { age: 50 }), p, false)).toBe(false);
    });
    it('désactivé ou déjà décédé → false', () => {
        expect(tryMortality(ctx(0), proj({ useStochasticMortality: false }), false)).toBe(false);
        expect(tryMortality(ctx(0), p, true)).toBe(false);
    });
});

describe('tryLtcTrigger', () => {
    const p = proj({ ltcEnabled: true });
    it('avant 65 ans → jamais', () => {
        expect(tryLtcTrigger({ age: 60, enableMonteCarlo: true, rng: () => 0 }, p, false)).toBe(false);
    });
    it('65+ et rng faible → déclenche', () => {
        expect(tryLtcTrigger({ age: 85, enableMonteCarlo: true, rng: () => 0 }, p, false)).toBe(true);
    });
    it('déjà actif → false', () => {
        expect(tryLtcTrigger({ age: 85, enableMonteCarlo: true, rng: () => 0 }, p, true)).toBe(false);
    });
});

describe('ltcMonthlyCost', () => {
    it('coût par défaut 5000 × multiplicateur d\'inflation', () => {
        expect(ltcMonthlyCost(proj({}), 1.5)).toBe(7500);
        expect(ltcMonthlyCost(proj({ ltcMonthlyCost: 8000 }), 1)).toBe(8000);
    });
});

describe('tickJobLoss', () => {
    it('chômage en cours → décrémente, pas de nouveau trigger', () => {
        const r = tickJobLoss(ctx(0), proj({ jobLossEnabled: true }), 4);
        expect(r.newMonthsRemaining).toBe(3);
        expect(r.triggered).toBe(false);
    });
    it('déclenche un nouveau chômage (rng < p) avec la durée configurée', () => {
        const r = tickJobLoss(ctx(0), proj({ jobLossEnabled: true, jobLossAnnualProbability: 0.5, jobLossDurationMonths: 8 }), 0);
        expect(r.triggered).toBe(true);
        expect(r.newMonthsRemaining).toBe(8);
    });
    it('désactivé → aucun trigger', () => {
        expect(tickJobLoss(ctx(0), proj({ jobLossEnabled: false }), 0).triggered).toBe(false);
    });
});

describe('tryDivorce', () => {
    it('déclenche et applique le split (keep = 1 − splitPct)', () => {
        const applySplit = vi.fn();
        const p = proj({ divorceEnabled: true, divorceAnnualProbability: 0.5, divorceSplitPct: 40 });
        expect(tryDivorce(ctx(0), p, false, applySplit)).toBe(true);
        expect(applySplit).toHaveBeenCalledWith(0.6); // garde 60 %
    });
    it('déjà divorcé → false, pas de split', () => {
        const applySplit = vi.fn();
        expect(tryDivorce(ctx(0), proj({ divorceEnabled: true }), true, applySplit)).toBe(false);
        expect(applySplit).not.toHaveBeenCalled();
    });
});
