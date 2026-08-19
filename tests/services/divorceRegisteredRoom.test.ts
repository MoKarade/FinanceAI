// tests/services/divorceRegisteredRoom.test.ts
//
// [ENG-DIVORCE-ROOM-COUPLE] Les droits enregistrés restaient ceux d'un COUPLE après un divorce.
// `processJanuaryReset` recevait `config.users` entier et `activeUsersCount` inchangé : chaque
// 1er janvier, le ménage à UNE tête se voyait ouvrir 2 × le plafond CELI, 2 × le plafond REER et
// le plafond FHSA à vie d'un couple.
//
// ⚠️ Décembre disait DÉJÀ « 1 déclarant » (`taxFilers`) — janvier, lui, redonnait les droits des
// deux. Les deux voies se contredisaient : c'est le motif « règle dupliquée corrigée à moitié ».

import { describe, it, expect } from 'vitest';
import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, User } from '../../types';
import type { AllocationStrategy } from '../../services/projection/types';

// ⚠️ FIXTURE CALIBRÉE — et il a fallu TROIS essais, comme pour le registre REER.
// Les deux premières passaient au vert sur le code CASSÉ, donc ne prouvaient RIEN :
//   • ménage ordinaire (2 500 $/mois d'épargne) : les droits ne sont JAMAIS le facteur limitant.
//     Recevoir 15 000 $ de droits au lieu de 7 500 $ ne change rien si on n'en utilise que 5 000 $.
//     Résultat : sorties bit-identiques avec ET sans correctif.
//   • horizon dépassant la retraite : le CELI est intégralement décaissé, tout se rejoint à la fin.
// Il faut donc : épargne SUPÉRIEURE aux droits annuels (les droits deviennent la contrainte), un
// gros non-enregistré à transférer, et un horizon qui s'arrête AVANT la retraite.
const users = (age: number): User[] => ([
    { name: 'Marc', grossSalary: 25_000, netSalary: 16_000, color: '#10b981', age, birthYear: 2026 - age, canadaArrivalYear: 2026 - age, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
    { name: 'Anna', grossSalary: 22_000, netSalary: 14_000, color: '#3b82f6', age, birthYear: 2026 - age, canadaArrivalYear: 2026 - age, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
] as unknown as User[]);

const params = (proj: Partial<ProjectionConfig>): SimulationParams => ({
    projection: {
        years: 25, returnRate: 6, inflationRate: 2, savingsMode: 'manual', manualContribution: 18_000,
        usePortfolioRate: false, returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
        emergencyFundMonths: 3, salaryGrowth: 2, propertyGrowthRate: 3, ...proj,
    } as ProjectionConfig,
    calculatedStartingCash: 400_000,
    liveCSVBalances: { CELI: 0, CELIAPP: 0, REER: 0, NON_ENREG: 500_000, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: {
        targetAge: 65, targetMonthlyIncome: 8_000, governmentPension: 1_500,
        lifeExpectancy: 92, dbPensionMonthly: 0,
    } as unknown as RetirementGoal,
    config: { users: users(35), splitMode: '50/50' } as unknown as BudgetConfig,
    baseGrossAnnual: 564_000, baseNetAnnual: 360_000, currentRentExpense: 2_500,
    baseMonthlyExpenses: 6_000, startYear: 2026, startMonth: 0,
} as unknown as SimulationParams);

const finalNW = (proj: Partial<ProjectionConfig>, runMC: boolean): number => {
    const r = __runScenarioForTests(
        params(proj), 'AUTO_MARGINAL' as AllocationStrategy, runMC, false,
    ) as unknown as { finalNetWorth: number };
    return r.finalNetWorth;
};

describe('[ENG-DIVORCE-ROOM-COUPLE] les droits enregistrés suivent le nombre de titulaires', () => {
    // Mesures effectuées sur CETTE fixture, en réintroduisant le défaut :
    //   avec correctif  : 12 028 429 $      (droits d'une seule tête)
    //   sans correctif  : 12 745 146 $      (droits de deux têtes)
    //   écart           :    716 717 $ de patrimoine INDU
    const NW_AVEC = 12_028_429;
    const NW_SANS = 12_745_146;
    const SEUIL = (NW_AVEC + NW_SANS) / 2;

    // ── LE test discriminant : il ÉCHOUE sur le code d'avant. ──
    it('un divorcé n\'accumule plus avec les droits de DEUX personnes', () => {
        const nw = finalNW({ divorceEnabled: true, divorceAnnualProbability: 1, divorceSplitPct: 50 }, true);
        expect(nw, 'fixture non calibrée : aucun patrimoine, le test ne mesure rien').toBeGreaterThan(0);
        // Si ce seuil casse un jour, RE-MESURER les deux bornes avant de le déplacer — ne jamais
        // l'élargir « pour faire passer ».
        expect(nw, 'les droits sont restés ceux d\'un couple').toBeLessThan(SEUIL);
    });

    // Ces deux lignes sont sur le chemin de TOUS les ménages : la rétrocompat se MESURE.
    // ⚠️ ANCRAGES RE-BASÉS le 2026-08-19, et l'écart est EXPLIQUÉ — pas élargi pour faire passer.
    // `[ENG-APRIL-REFUND-NONREG-UNPUBLISHED]` publie le remboursement d'impôt réinvesti en
    // `contribNonReg`, que `growthApplication` soustrait de la base de croissance pour exclure les
    // dépôts de MI-MOIS. Ce remboursement, versé le 30 avril, gagnait jusqu'ici un mois COMPLET de
    // rendement : on retire une croissance fantôme.
    //   22 894 519 $ → 22 890 883 $  (−3 636 $, −0,016 %)
    //   44 499 602 $ → 44 476 259 $  (−23 343 $, −0,052 %)
    // L'écart est NÉGATIF dans les deux cas et croît avec l'horizon et la taille du portefeuille —
    // signature d'un intérêt composé qu'on cesse de créditer à tort. Ce que ces deux cas
    // vérifient (le lot per-conjoint ne perturbe ni le ménage ordinaire ni le décès) reste vrai.
    it('sans divorce ni décès, la sortie est INCHANGÉE', () => {
        expect(Math.round(finalNW({}, false))).toBe(22_890_883);
    });

    it('le scénario de décès n\'est pas perturbé par ce lot', () => {
        expect(Math.round(finalNW({ modelSurvivor: true }, true))).toBe(44_476_259);
    });
});
