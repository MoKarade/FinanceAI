// tests/services/useTheoreticalNeutralise.test.ts
//
// [SANDBOX-CURSEURS-THEORIQUES-RETRAIT] (OK de Marc) — les curseurs « Revenus / Dépenses
// théoriques » et le commutateur « Bac à sable » qui allumait `useTheoretical` sont RETIRÉS de
// l'interface. La PAIRE est obligatoire : un dossier déjà persisté à `useTheoretical: true` serait
// resté sur des revenus splittés 55/45 et des dépenses inventées, SANS plus aucun bouton pour en
// sortir (`RETIRER-UN-REGLAGE-NUISIBLE-EXIGE-DE-NEUTRALISER-SA-VALEUR-PERSISTEE`). Le moteur ignore
// donc désormais les trois champs, qui restent `@deprecated` dans le type (pas de migration du
// schéma persisté : risque sur les données pour un gain nul).
//
// Ce que ce fichier prouve : un dossier persisté à `useTheoretical: true` (avec des valeurs
// théoriques très différentes du réel) rend EXACTEMENT la projection du mode réel — sur les trois
// sites moteur (revenus de base, base de dépenses / cible FIRE, sensibilité d'épargne).

import { describe, it, expect } from 'vitest';
import { calculateFutureProjection, type SimulationParams } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, User } from '../../types';

const users: User[] = ([
    { name: 'Marc', grossSalary: 6_500, netSalary: 4_600, color: '#10b981', age: 40, birthYear: 1986, canadaArrivalYear: 1986, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
] as unknown as User[]);

const params = (proj: Partial<ProjectionConfig> = {}): SimulationParams => ({
    projection: {
        years: 25, returnRate: 6, inflationRate: 2, savingsMode: 'budget', manualContribution: 0,
        usePortfolioRate: false, returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
        emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3, ...proj,
    } as ProjectionConfig,
    calculatedStartingCash: 20_000,
    liveCSVBalances: { CELI: 30_000, CELIAPP: 0, REER: 60_000, NON_ENREG: 10_000, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: { targetAge: 65, targetMonthlyIncome: 3_500, governmentPension: 1_400, lifeExpectancy: 90, dbPensionMonthly: 0 } as unknown as RetirementGoal,
    config: { users, splitMode: '50/50' } as unknown as BudgetConfig,
    baseGrossAnnual: 78_000, baseNetAnnual: 55_200, currentRentExpense: 1_400,
    baseMonthlyExpenses: 3_600, startYear: 2026, startMonth: 0,
} as unknown as SimulationParams);

/** Un dossier « coincé » en bac à sable : théorique très loin du réel (revenu ×3, dépenses ÷3). */
const COINCE: Partial<ProjectionConfig> = { useTheoretical: true, theoreticalIncome: 15_000, theoreticalExpenses: 1_200 };

describe('[SANDBOX-CURSEURS-THEORIQUES-RETRAIT] useTheoretical persisté n\'a plus AUCUN effet moteur', () => {
    const reel = calculateFutureProjection(params());
    const coince = calculateFutureProjection(params(COINCE));

    it('anti-vacuité : la projection réelle est finie et non triviale', () => {
        expect(Number.isFinite(reel.finalNetWorth)).toBe(true);
        expect(reel.finalNetWorth).toBeGreaterThan(100_000);
        expect(reel.chartData.length).toBeGreaterThan(12);
    });

    it('patrimoine final, succession et cible FIRE : IDENTIQUES au mode réel', () => {
        expect(coince.finalNetWorth).toBe(reel.finalNetWorth);
        expect(coince.estateNetWorth).toBe(reel.estateNetWorth);
        expect(coince.fireTargetNetWorth).toBe(reel.fireTargetNetWorth);
    });

    it('la courbe mois par mois est identique (revenus de base non splittés 55/45)', () => {
        expect(coince.chartData.map((p) => p.netWorth)).toEqual(reel.chartData.map((p) => p.netWorth));
    });

    it('sensibilité d\'épargne : même delta qu\'en mode réel (c\'est baseMonthlyExpenses qui est réduit)', () => {
        expect(reel.savingsSensitivity).not.toBeNull();
        expect(coince.savingsSensitivity).toEqual(reel.savingsSensitivity);
    });
});
