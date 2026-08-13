// tests/services/divorceTaxDebtSplit.test.ts
//
// [ENG-DIVORCE-TAXDEBT-UNSPLIT] La créance — ou la DETTE — fiscale ne suivait pas le partage.
// `taxPreviousYear` porte l'impôt de l'année du COUPLE, réglé en avril. Sans partage :
//   · si le ménage DEVAIT de l'impôt : le divorcé le payait SEUL, même après avoir tout cédé ;
//   · s'il attendait un REMBOURSEMENT : il l'encaissait INTÉGRALEMENT (26 948,77 $ mesurés par le
//     panel sur un patrimoine de 135 $), ce qui rendait au passage `totalTaxesPaid` NÉGATIF.
//
// C'est la décision VERROUILLÉE de Marc (`docs/decisions.md`) : on partage la valeur NETTE. C'est
// elle qui a justifié d'ajouter les dettes au split — une créance fiscale née pendant l'union est
// de la valeur nette comme une autre.
//
// ⚠️ Ce test n'était PAS écrivable avant `[ENG-MC-OBSERVABILITY]` : `FluxImpots` n'existe que dans
// le point mensuel COMPLET, et le divorce n'existe que sous Monte-Carlo.

import { describe, it, expect } from 'vitest';
import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, User } from '../../types';
import type { AllocationStrategy } from '../../services/projection/types';

const users = (age: number): User[] => ([
    { name: 'Marc', grossSalary: 8_200, netSalary: 5_620, color: '#10b981', age, birthYear: 2026 - age, canadaArrivalYear: 2026 - age, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
    { name: 'Anna', grossSalary: 7_100, netSalary: 4_995, color: '#3b82f6', age, birthYear: 2026 - age, canadaArrivalYear: 2026 - age, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
] as unknown as User[]);

const params = (proj: Partial<ProjectionConfig>): SimulationParams => ({
    projection: {
        years: 5, returnRate: 6, inflationRate: 2, savingsMode: 'manual', manualContribution: 1_500,
        usePortfolioRate: false, returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
        emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3, ...proj,
    } as ProjectionConfig,
    calculatedStartingCash: 70_000,
    liveCSVBalances: { CELI: 50_000, CELIAPP: 0, REER: 90_000, NON_ENREG: 40_000, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: {
        targetAge: 62, targetMonthlyIncome: 5_000, governmentPension: 1_500,
        lifeExpectancy: 92, dbPensionMonthly: 0,
    } as unknown as RetirementGoal,
    config: { users: users(45), splitMode: '50/50' } as unknown as BudgetConfig,
    baseGrossAnnual: 183_600, baseNetAnnual: 127_380, currentRentExpense: 1_800,
    baseMonthlyExpenses: 4_500, startYear: 2026, startMonth: 0,
} as unknown as SimulationParams);

const run = (proj: Partial<ProjectionConfig>) => __runScenarioForTests(
    params(proj), 'AUTO_MARGINAL' as AllocationStrategy, true, false, 0, 'BASE', {},
    { verboseMonthlyPoints: true },
) as unknown as { chartData: Array<Record<string, number>>; totalTaxesPaid: number };

// Le divorce se déclenche au 1er janvier suivant (m = 12) ; le règlement d'impôt de l'année du
// couple tombe en AVRIL, soit m = 15.
const MOIS_DIVORCE = 12;
const MOIS_AVRIL = 15;

describe('[ENG-DIVORCE-TAXDEBT-UNSPLIT] la dette fiscale du couple suit le partage', () => {
    // ── LE test discriminant : il ÉCHOUE sur le code d'avant. ──
    it('après avoir cédé 100 % du patrimoine, on ne règle plus l\'impôt du couple', () => {
        const r = run({ divorceEnabled: true, divorceAnnualProbability: 1, divorceSplitPct: 100 });
        const avril = r.chartData[MOIS_AVRIL] ?? {};
        // Mesuré sans le correctif : 1 488 $ débités en avril à quelqu'un qui n'a plus rien.
        expect(Number(avril.FluxImpots) || 0, 'l\'impôt du COUPLE est encore réglé par le divorcé')
            .toBeCloseTo(0, 2);
    });

    it('la garde n\'est pas vacueuse : le divorce a bien eu lieu et a bien tout emporté', () => {
        const r = run({ divorceEnabled: true, divorceAnnualProbability: 1, divorceSplitPct: 100 });
        const avant = Number(r.chartData[MOIS_DIVORCE - 1]?.NetWorth) || 0;
        const apres = Number(r.chartData[MOIS_DIVORCE]?.NetWorth) || 0;
        expect(avant, 'aucun patrimoine avant le divorce').toBeGreaterThan(100_000);
        // Split à 100 % : il ne reste que les flux du mois.
        expect(apres, 'le split à 100 % n\'a rien emporté').toBeLessThan(avant * 0.05);
    });

    it('un partage à 50 % laisse un règlement d\'avril RÉDUIT, pas nul', () => {
        // Garde contre le sur-correctif : partager n'est pas annuler. À 50 %, la moitié de la
        // dette fiscale reste bien due.
        const moitie = run({ divorceEnabled: true, divorceAnnualProbability: 1, divorceSplitPct: 50 });
        const entier = run({ divorceEnabled: false });
        const fluxMoitie = Math.abs(Number(moitie.chartData[MOIS_AVRIL]?.FluxImpots) || 0);
        const fluxEntier = Math.abs(Number(entier.chartData[MOIS_AVRIL]?.FluxImpots) || 0);
        expect(fluxEntier, 'aucun règlement d\'avril sans divorce : la fixture ne mesure rien')
            .toBeGreaterThan(0);
        expect(fluxMoitie, 'le partage a ANNULÉ la dette au lieu de la partager').toBeGreaterThan(0);
        expect(fluxMoitie, 'la dette fiscale n\'a pas été réduite').toBeLessThan(fluxEntier);
    });
});
