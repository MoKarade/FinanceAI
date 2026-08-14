// tests/services/divorceEstatePension.test.ts
//
// [ENG-DIVORCE-ESTATE-PENSION] `computeEstateNetWorth` est la fonction MIROIR de
// `computeRetirementIncome` — son propre commentaire renvoie à « retirementIncome.ts:207-212 ».
// Le lot divorce avait corrigé l'originale et laissé la sœur intacte : un divorcé héritait, à
// l'écran Succession, de la valeur actualisée des rentes publiques de son EX.
//
// C'est le motif d'échec RÉCURRENT de ce lot — le même défaut, laissé dans la fonction voisine.
//
// ⚠️ DEUX réductions distinctes, à ne pas cumuler sur le même terme :
//   · estimés précis RRQ/PSV : valeurs PER-PERSONNE → se réduisent par MOINS DE TÊTES (×1) ;
//   · repli `governmentPension` : agrégat DÉJÀ familial → exige un facteur de PART explicite.
// Appliquer le compteur de têtes au repli (ou la part aux estimés) réduirait DEUX fois.

import { describe, it, expect } from 'vitest';
import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, User } from '../../types';
import type { AllocationStrategy } from '../../services/projection/types';

const users = (age: number): User[] => ([
    { name: 'Marc', grossSalary: 8_200, netSalary: 5_620, color: '#10b981', age, birthYear: 2026 - age, canadaArrivalYear: 2026 - age, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
    { name: 'Anna', grossSalary: 7_100, netSalary: 4_995, color: '#3b82f6', age, birthYear: 2026 - age, canadaArrivalYear: 2026 - age, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
] as unknown as User[]);

// Fixture : `governmentPension` NON nul et AUCUN estimé précis (`rrqEstimateMonthly` /
// `psvEstimateMonthly` absents) — c'est la branche du REPLI agrégé, celle qui exigeait le facteur
// de part. Avec des estimés précis, la réduction passerait par le compteur de têtes : autre chemin.
const params = (proj: Partial<ProjectionConfig>): SimulationParams => ({
    projection: {
        years: 25, returnRate: 6, inflationRate: 2, savingsMode: 'manual', manualContribution: 2_000,
        usePortfolioRate: false, returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
        emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3, ...proj,
    } as ProjectionConfig,
    calculatedStartingCash: 60_000,
    liveCSVBalances: { CELI: 40_000, CELIAPP: 0, REER: 120_000, NON_ENREG: 50_000, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: {
        targetAge: 62, targetMonthlyIncome: 5_000, governmentPension: 2_400,
        lifeExpectancy: 92, dbPensionMonthly: 0,
    } as unknown as RetirementGoal,
    config: { users: users(45), splitMode: '50/50' } as unknown as BudgetConfig,
    baseGrossAnnual: 183_600, baseNetAnnual: 127_380, currentRentExpense: 1_800,
    baseMonthlyExpenses: 4_500, startYear: 2026, startMonth: 0,
} as unknown as SimulationParams);

const scenario = (proj: Partial<ProjectionConfig>, runMC: boolean) => {
    const r = __runScenarioForTests(
        params(proj), 'AUTO_MARGINAL' as AllocationStrategy, runMC, false,
    ) as unknown as { estateNetWorth: number; finalNetWorth: number };
    return r;
};

describe('[ENG-DIVORCE-ESTATE-PENSION] les rentes de l\'ex quittent aussi le bilan SUCCESSORAL', () => {
    // Mesures sur cette fixture, en réintroduisant le défaut :
    //   avec correctif :   746 082 $
    //   sans correctif : 1 068 947 $  →  322 865 $ de valeur successorale INDUE
    const EST_AVEC = 746_082;
    const EST_SANS = 1_068_947;

    // ── LE test discriminant : il ÉCHOUE sur le code d'avant. ──
    it('un divorcé n\'hérite plus de la valeur des rentes de son ex', () => {
        const r = scenario({ divorceEnabled: true, divorceAnnualProbability: 1, divorceSplitPct: 50 }, true);
        expect(r.estateNetWorth, 'succession nulle : la fixture ne mesure rien').toBeGreaterThan(0);
        expect(r.estateNetWorth, 'la valeur des rentes de l\'ex est encore au bilan successoral')
            .toBeLessThan((EST_AVEC + EST_SANS) / 2);
    });

    // La preuve que le défaut était CONFINÉ à l'écran Succession — et donc invisible partout
    // ailleurs : c'est précisément ce qui l'a fait survivre au premier lot.
    it('le patrimoine MENSUEL n\'est pas touché (le défaut ne vivait que dans la succession)', () => {
        const r = scenario({ divorceEnabled: true, divorceAnnualProbability: 1, divorceSplitPct: 50 }, true);
        // ⚠️ ANCRAGE RE-BASÉ le 2026-08-13, et l'écart est EXPLIQUÉ — pas élargi pour faire passer.
        // Valeur d'origine : 480 108 $. `[ENG-DIVORCE-TAXDEBT-UNSPLIT]` fait désormais suivre au
        // partage la dette fiscale de l'année du couple : le divorcé ne règle plus SEUL l'impôt du
        // ménage, d'où +2 402 $ de patrimoine. C'est l'effet VOULU de ce correctif-là, pas une
        // régression de celui-ci — ce que ce test vérifie (le lot SUCCESSION ne touche pas au
        // patrimoine mensuel) reste vrai.
        expect(Math.round(r.finalNetWorth)).toBe(482_510);
    });

    it('sans divorce, la succession est INCHANGÉE (rétrocompat mesurée)', () => {
        expect(Math.round(scenario({}, false).estateNetWorth)).toBe(3_374_818);
        expect(Math.round(scenario({}, true).estateNetWorth)).toBe(2_716_383);
    });
});
