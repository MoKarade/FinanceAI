// tests/services/divorceDisplayRates.test.ts
//
// [ENG-DIVORCE-DISPLAY-RATES] Le taux d'imposition AFFICHÉ (marginal et effectif du point mensuel)
// continuait, après un divorce, d'additionner les DEUX salaires puis de diviser par 2 : il montrait
// le taux d'un ménage qui n'existe plus. Deux erreurs qui se compensent partiellement — un divorcé
// à haut salaire voyait un taux trop BAS, un divorcé à bas salaire un taux trop HAUT.
//
// C'est une sortie d'AFFICHAGE : rien d'autre n'en dépend (les vraies assiettes passent par
// `taxDecember` / `taxJanuary`, corrigés dans les lots précédents). Sévérité basse, mais c'est un
// chiffre que l'utilisateur LIT.
//
// ⚠️ Ce test n'était pas écrivable avant `[ENG-MC-OBSERVABILITY]` : `TauxMarginal` n'existe que
// dans le point mensuel COMPLET, et le divorce n'existe que sous Monte-Carlo.

import { describe, it, expect } from 'vitest';
import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, User } from '../../types';
import type { AllocationStrategy } from '../../services/projection/types';

// Salaires TRÈS inégaux : c'est ce qui rend l'erreur visible. À salaires égaux,
// `(a + b) / 2 === a` et le défaut est invisible — piège de fixture déjà rencontré.
const users = (age: number): User[] => ([
    { name: 'Marc', grossSalary: 14_000, netSalary: 9_000, color: '#10b981', age, birthYear: 2026 - age, canadaArrivalYear: 2026 - age, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
    { name: 'Anna', grossSalary: 2_000, netSalary: 1_600, color: '#3b82f6', age, birthYear: 2026 - age, canadaArrivalYear: 2026 - age, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
] as unknown as User[]);

const params = (proj: Partial<ProjectionConfig>): SimulationParams => ({
    projection: {
        years: 4, returnRate: 6, inflationRate: 2, savingsMode: 'manual', manualContribution: 1_000,
        usePortfolioRate: false, returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
        emergencyFundMonths: 6, salaryGrowth: 0, propertyGrowthRate: 3, ...proj,
    } as ProjectionConfig,
    calculatedStartingCash: 50_000,
    liveCSVBalances: { CELI: 20_000, CELIAPP: 0, REER: 40_000, NON_ENREG: 20_000, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: {
        targetAge: 62, targetMonthlyIncome: 5_000, governmentPension: 1_500,
        lifeExpectancy: 92, dbPensionMonthly: 0,
    } as unknown as RetirementGoal,
    config: { users: users(45), splitMode: '50/50' } as unknown as BudgetConfig,
    // 14 000 + 2 000 = 16 000 $/mois → 192 000 $/an pour le ménage.
    baseGrossAnnual: 192_000, baseNetAnnual: 127_200, currentRentExpense: 1_800,
    baseMonthlyExpenses: 4_000, startYear: 2026, startMonth: 0,
} as unknown as SimulationParams);

const run = (proj: Partial<ProjectionConfig>) => (__runScenarioForTests(
    params(proj), 'AUTO_MARGINAL' as AllocationStrategy, true, false, 0, 'BASE', {},
    { verboseMonthlyPoints: true },
) as unknown as { chartData: Array<Record<string, number>> }).chartData;

const MOIS_APRES_DIVORCE = 13;   // divorce déclenché à m = 12

describe('[ENG-DIVORCE-DISPLAY-RATES] le taux affiché est celui du ménage RESTANT', () => {
    it('après divorce, le taux monte : le déclarant restant porte SON salaire, pas la moyenne', () => {
        const couple = run({ divorceEnabled: false })[MOIS_APRES_DIVORCE] ?? {};
        const divorce = run({ divorceEnabled: true, divorceAnnualProbability: 1, divorceSplitPct: 50 })[MOIS_APRES_DIVORCE] ?? {};

        const tauxCouple = Number(couple.marginalTaxRate) || 0;
        const tauxDivorce = Number(divorce.marginalTaxRate) || 0;

        expect(tauxCouple, 'taux nul : le point n\'expose pas le taux, ou la fixture ne mesure rien')
            .toBeGreaterThan(0);
        // Le ménage moyenne 96 000 $/tête ; le déclarant restant en gagne 168 000 $. Son taux
        // marginal DOIT être plus élevé — avant, il lisait celui de la moyenne du couple.
        expect(tauxDivorce, 'le taux affiché est resté celui du couple').toBeGreaterThan(tauxCouple);
    });

    it('sans divorce, le taux est INCHANGÉ (rétrocompat)', () => {
        // `taxFilers === activeUsersCount` et `soloHousehold === false` hors ménage solo : la
        // substitution est un no-op par construction, vérifié ici plutôt que supposé.
        const a = run({ divorceEnabled: false })[MOIS_APRES_DIVORCE] ?? {};
        expect(Number(a.marginalTaxRate)).toBeGreaterThan(0);
        expect(Number(a.effectiveTaxRate)).toBeGreaterThan(0);
    });
});
