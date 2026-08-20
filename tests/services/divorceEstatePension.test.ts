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
        // ⚠️ ANCRAGE RE-BASÉ le 2026-08-19, et l'écart est EXPLIQUÉ — pas élargi pour faire passer.
        // Valeur d'origine : 3 374 818 $ → 3 374 653 $, soit **−165 $ (−0,005 %)**.
        // `[ENG-APRIL-REFUND-NONREG-UNPUBLISHED]` publie enfin le remboursement d'impôt réinvesti
        // en `contribNonReg`. Or `growthApplication` utilise `nonReg − contribNonReg` comme base
        // pour EXCLURE les dépôts de mi-mois de la croissance du mois : ce remboursement, versé le
        // 30 avril, gagnait jusqu'ici un MOIS COMPLET de rendement. Le retrait de cette croissance
        // fantôme est l'effet VOULU — l'écart est négatif partout, et il croît avec l'horizon et la
        // taille du portefeuille, exactement comme un intérêt composé qu'on cesse de créditer à tort.
        // ⚠️ RE-BASÉ le 2026-08-20 par `[ESTATE-NPV-07]` : 3 374 653 $ → 3 565 398 $ (+190 745 $,
        // +5,7 %). La VAN des rentes publiques n'est plus amputée d'un facteur PLAT de 30 % mais
        // d'un abattement CALCULÉ sur l'impôt qu'elles portent réellement en contexte. L'écart est
        // positif parce que le 0,7 sur-taxait ce ménage : à l'horizon, il vit de ses rentes
        // publiques, sur lesquelles le barème 2051 prélève bien moins que 30 %.
        // Décomposition du +190 745 $ (VAN brute 922 473 $), chaque étape MESURÉE :
        //   · 0,700 → 0,857 : abattement CALCULÉ au lieu du forfait ................ +144 924 $
        //   · 0,857 → 0,907 : la tranche cesse d'être l'estimé de saisie NON INDEXÉ (28 800 $)
        //                     et devient ce que la VAN VALORISE, en dollars de l'année finale
        //                     (47 249 $) ; le contexte devient le revenu STRUCTUREL net du SRG
        //                     et de l'écrêtement PSV ....................... +45 821 $ (résidu)
        // ⚠️ Une version antérieure de ce commentaire disait « tranche = la rente RÉELLEMENT versée
        // (40 616 $) ». C'était vrai d'un état INTERMÉDIAIRE du lot, mort depuis : le code livré
        // prend `max(versé, valorisé)` et c'est la valorisée (47 249 $) qui gagne ici. Un chiffre
        // périmé dans un commentaire se relit comme un FAIT — vérifié par dump des internes.
        // ⚠️ Sur cette fixture `revenuSansRentes` vaut 0 : le ménage n'a pas de pension privée, donc
        // le « facteur incrémental » y dégénère en TAUX MOYEN sur la rente. Ce n'est pas un cas
        // dégradé, c'est le cas NOMINAL d'un ménage qui vit de ses rentes publiques — et c'est
        // exactement la population que le forfait de 0,7 sur-taxait le plus.
        expect(Math.round(scenario({}, false).estateNetWorth)).toBe(3_565_398);
        // Second ancrage, même cause : 2 715 684 $ → 2 906 430 $, soit +190 746 $ — le MÊME écart
        // qu'au-dessus à un dollar d'arrondi près, parce que la VAN des rentes ne dépend pas du
        // tirage Monte Carlo ; seul le patrimoine de base en dépend.
        expect(Math.round(scenario({}, true).estateNetWorth)).toBe(2_906_430);
    });
});
