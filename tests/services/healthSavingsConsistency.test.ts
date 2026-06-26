// [HEALTH-SAVINGS-CONSISTENCY] Discriminant : une nature ÉPARGNE ACCENTUÉE (« Épargne ») doit être
// EXCLUE des dépenses sur les surfaces qui alimentent le moteur, AU MÊME TITRE que « Epargne » non accentué.
//
// AVANT le fix (`item.nature === 'Epargne'` strict), une nature accentuée n'était PAS reconnue → comptée
// comme dépense → épargne mensuelle SOUS-estimée → projection pessimiste. APRÈS (`isSavingsNature`, NFD),
// elle est exclue partout (cohérent avec HealthIndicator/computeBudgetParityScore/Budget.tsx).
//
// La nature persistée est LIBRE en pratique (utils/budget.ts:59 « 'Épargne' accentué possible »), d'où le
// cast `as unknown as BudgetCategory` (l'union typée ne l'autorise pas, mais les données réelles oui).
//
// DISCRIMINANT PROUVÉ par git stash : `git stash push -- services/portfolio.ts services/projection/buildSimulationParams.ts`
// (retire le fix) → ces tests ÉCHOUENT (l'accentué est compté en dépense : savings 2500 au lieu de 3500) → `git stash pop`.
import { describe, it, expect } from 'vitest';
import { computeMonthlyBudgetAggregates } from '../../services/portfolio';
import { computeMonthlySavings } from '../../services/projection/buildSimulationParams';
import type { BudgetCategory, BudgetConfig } from '../../types';

// Revenu net = 5000 $/mois (un seul salarié).
const config = {
    users: [
        { name: 'Marc', netSalary: 5000, grossSalary: 0, color: '#0f0' },
        { name: '', netSalary: 0, grossSalary: 0, color: '#f00' },
    ],
    splitMode: '50/50',
} as BudgetConfig;

// Loyer = consommation (1500) ; REER = ÉPARGNE ACCENTUÉE (1000) → doit être EXCLU des dépenses.
const budgetAccented: BudgetCategory[] = [
    { name: 'Loyer', target: 1500, frequency: 'Monthly', nature: 'Besoin' } as BudgetCategory,
    { name: 'REER', target: 1000, frequency: 'Monthly', nature: 'Épargne' } as unknown as BudgetCategory,
];

describe('HEALTH-SAVINGS-CONSISTENCY — épargne accentuée exclue sur les surfaces moteur', () => {
    it('computeMonthlyBudgetAggregates (portfolio → IA/MCP) : « Épargne » accentué EXCLU des dépenses', () => {
        const r = computeMonthlyBudgetAggregates(config, budgetAccented);
        expect(r.expenses).toBe(1500);          // REER accentué EXCLU (avant le fix : 2500)
        expect(r.savings).toBe(3500);           // 5000 − 1500 (avant le fix : 2500)
    });

    it('computeMonthlySavings (buildSimulationParams → entrée MOTEUR) : « Épargne » accentué EXCLU', () => {
        // 5000 − 1500 = 3500 (avant le fix : 2500, l\'accentué compté en dépense → projection pessimiste).
        expect(computeMonthlySavings(config, budgetAccented)).toBe(3500);
    });

    it('non-régression : « Epargne » NON accentué reste exclu (inchangé par le fix)', () => {
        const budgetPlain: BudgetCategory[] = [
            { name: 'Loyer', target: 1500, frequency: 'Monthly', nature: 'Besoin' } as BudgetCategory,
            { name: 'CELI', target: 1000, frequency: 'Monthly', nature: 'Epargne' } as BudgetCategory,
        ];
        expect(computeMonthlySavings(config, budgetPlain)).toBe(3500);
        expect(computeMonthlyBudgetAggregates(config, budgetPlain).savings).toBe(3500);
    });
});
