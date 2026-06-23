import { describe, it, expect } from 'vitest';
import {
    monthlyTargetOf,
    computeBudgetParityScore,
    subscriptionsMonthlyCost,
    computeSubscriptionLoadScore,
    SUBSCRIPTION_LOAD_CEILING,
} from '../../utils/healthRatios';
import type { BudgetCategory, RecurringItem } from '../../types';

const cat = (name: string, target: number, frequency: BudgetCategory['frequency'] = 'Monthly'): BudgetCategory =>
    ({ id: name, name, target, frequency, nature: 'Besoin', type: 'Commun' });

const sub = (yearlyCost: number, payee = 'x'): RecurringItem =>
    ({ payee, averageAmount: yearlyCost / 12, dayOfMonth: 1, category: 'Abos', lastDate: '2026-06-01', yearlyCost });

describe('monthlyTargetOf — [PH4D-BUDGET-RATIOS] normalisation fréquence', () => {
    it('Monthly = brut ; Yearly /12 ; Weekly ×4.33 ; Quarterly /3', () => {
        expect(monthlyTargetOf({ target: 1000, frequency: 'Monthly' })).toBe(1000);
        expect(monthlyTargetOf({ target: 1200, frequency: 'Yearly' })).toBe(100);
        expect(monthlyTargetOf({ target: 100, frequency: 'Weekly' })).toBeCloseTo(433, 5);
        expect(monthlyTargetOf({ target: 300, frequency: 'Quarterly' })).toBe(100);
    });
});

describe('computeBudgetParityScore — [PH4D-BUDGET-RATIOS] adhérence au budget', () => {
    const BUDGET = [cat('Food', 1000), cat('Rent', 1500)]; // budgetTotal = 2500

    it('dépenses ≤ cibles → 100 (aucun dépassement)', () => {
        expect(computeBudgetParityScore({ Food: 800, Rent: 1500 }, BUDGET)).toBe(100);
    });

    it('un sous-budget ne bonifie PAS au-delà de 100 (seul le dépassement pénalise)', () => {
        // Food très en-dessous, Rent pile : pas de crédit pour la sous-dépense.
        expect(computeBudgetParityScore({ Food: 0, Rent: 1500 }, BUDGET)).toBe(100);
    });

    it('dépassement partiel → score proportionnel', () => {
        // Food +200 (1200 vs 1000), Rent pile → overspend 200 / 2500 = 8% → 92.
        expect(computeBudgetParityScore({ Food: 1200, Rent: 1500 }, BUDGET)).toBe(92);
    });

    it('dépassement massif → clampé à 0 (jamais négatif)', () => {
        expect(computeBudgetParityScore({ Food: 4000, Rent: 4000 }, BUDGET)).toBe(0);
    });

    it('aucune dépense rapprochée → 100 (rien dépassé) — la non-vacuité est gérée par l\'appelant', () => {
        expect(computeBudgetParityScore({}, BUDGET)).toBe(100);
    });

    it('aucun budget (Σ cible = 0) → null (rien à mesurer)', () => {
        expect(computeBudgetParityScore({ Food: 500 }, [])).toBeNull();
        expect(computeBudgetParityScore({ Food: 500 }, [cat('Food', 0)])).toBeNull();
    });

    it('un poste ÉPARGNE n\'entre PAS dans le dénominateur (virements, pas comparable aux dépenses)', () => {
        const savings = { ...cat('CELI', 2000), nature: 'Epargne' as const };
        // Food +200 (1200 vs 1000) ; CELI EXCLU → overspend 200 / 1000 = 20% → 80.
        expect(computeBudgetParityScore({ Food: 1200 }, [cat('Food', 1000), savings])).toBe(80);
        // Discriminant : identique au cas SANS le poste épargne (le poste épargne ne change rien).
        expect(computeBudgetParityScore({ Food: 1200 }, [cat('Food', 1000)])).toBe(80);
    });

    it('budget = QUE de l\'épargne → null (aucun poste de DÉPENSE à mesurer)', () => {
        expect(computeBudgetParityScore({}, [{ ...cat('CELI', 2000), nature: 'Epargne' as const }])).toBeNull();
    });
});

describe('subscriptionsMonthlyCost — [PH4D-BUDGET-RATIOS] coût mensuel (yearlyCost/12, pas de ×12)', () => {
    it('abo mensuel (yearlyCost annualisé) ET abo annuel comptés correctement en mensuel', () => {
        // Netflix 20/mois → yearlyCost 240 → 20/mois ; assurance 1200/an → yearlyCost 1200 → 100/mois.
        expect(subscriptionsMonthlyCost([sub(240, 'Netflix'), sub(1200, 'Assurance')])).toBe(120);
    });
    it('liste vide → 0', () => {
        expect(subscriptionsMonthlyCost([])).toBe(0);
    });
    it('yearlyCost non-fini → ignoré (0), pas de NaN', () => {
        expect(subscriptionsMonthlyCost([{ ...sub(240), yearlyCost: NaN }])).toBe(0);
    });
});

describe('computeSubscriptionLoadScore — [PH4D-BUDGET-RATIOS] poids des abos', () => {
    it('aucun abonnement → 100 (aucun fardeau)', () => {
        expect(computeSubscriptionLoadScore([], 5000)).toBe(100);
    });
    it('abos = 15% du revenu net (plafond) → 0', () => {
        // 5000 × 0.15 = 750/mois = yearlyCost 9000.
        expect(computeSubscriptionLoadScore([sub(9000)], 5000)).toBe(0);
    });
    it('abos = 7.5% du revenu → 50 (linéaire)', () => {
        expect(computeSubscriptionLoadScore([sub(4500)], 5000)).toBeCloseTo(50, 5);
    });
    it('abos au-delà du plafond → clampé à 0', () => {
        expect(computeSubscriptionLoadScore([sub(24000)], 5000)).toBe(0);
    });
    it('revenu ≤ 0 → null (rien à rapporter)', () => {
        expect(computeSubscriptionLoadScore([sub(240)], 0)).toBeNull();
        expect(computeSubscriptionLoadScore([sub(240)], -100)).toBeNull();
    });
    it('le plafond est bien 15%', () => {
        expect(SUBSCRIPTION_LOAD_CEILING).toBe(0.15);
    });
});
