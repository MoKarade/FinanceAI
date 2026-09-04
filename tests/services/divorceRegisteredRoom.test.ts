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
    // ⚠️ RE-BASÉS le 2026-08-25 par `[FISC-RRSP-EXTRAP-05]`, et c'est un résultat à EXPLIQUER, pas
    // un ajustement de confort. Cette fixture est l'une des rares où le PLAFOND REER mord vraiment
    // (les salaires du store sont MENSUELS : 25 000 $/mois = 300 000 $/an, donc 18 % = 54 000 $,
    // bien au-dessus de tout plafond) et dont l'horizon — 25 ans, soit jusqu'en 2051 — dépasse la
    // dernière année du barème. Corriger l'ancre de l'extrapolation a supprimé la marche de
    // +4,54 % à la couture 2030 → 2031 : moins de droits fabriqués, donc moins d'abri fiscal.
    //   sans divorce ni décès : 22 890 883 → 22 861 914  (−28 969 $, −0,13 %)
    //   scénario de décès     : 44 476 259 → 44 428 892  (−47 367 $, −0,11 %)
    // Le SIGNE est le bon sens : la marche ouvrait des droits que rien ne justifiait. Que ces deux
    // goldens bougent PROUVE au passage que le chemin corrigé est réellement couvert.
    it('sans divorce ni décès, la sortie est INCHANGÉE', () => {
        // Re-basé 2026-09-03 ([FISC-DIV-ACB-STEPUP] lot 115, **+65 105 $**, était 22 861 914) :
        // l'ACB du non-enregistré monte désormais du dividende réputé, donc le gain latent ne porte
        // plus la somme déjà imposée. Vrai changement fiscal, sens attendu (NW ↑). Ce que ce test
        // DÉFEND — « sans divorce ni décès, ce lot-ci ne change rien » — est intact ; seule l'ancre
        // de valeur bouge, et l'écart relatif (+0,28 %) est cohérent avec un portefeuille de 22 M$
        // dont une part importante est non enregistrée.
        // Re-basé 2026-09-04 ([FISC-RRSP-FALLBACK-PRE2010] lot 127, **−13 333 $**, était
        // 22 927 019) : les années d'historique PRÉ-2010 plafonnent désormais au plafond 2010
        // (22 000 $) et plus au plafond 2025 (32 490 $). Cette fixture est justement l'une des
        // rares où le plafond REER mord (300 k$/an) — moins de droits historiques fabriqués, donc
        // moins d'abri fiscal : le SIGNE négatif est le bon sens, et l'écart (−0,058 %) est du
        // même ordre que les re-bases fiscales précédentes de ce fichier.
        expect(Math.round(finalNW({}, false))).toBe(22_913_686);
    });

    it('le scénario de décès n\'est pas perturbé par ce lot', () => {
        // Re-basé 2026-09-03 (même cause, **+96 997 $**, était 44 428 892 — soit +0,22 %, le même
        // ordre relatif que ci-dessus sur un patrimoine deux fois plus gros).
        // Re-basé 2026-09-04 ([FISC-RRSP-FALLBACK-PRE2010], **−33 461 $**, était 44 525 889 —
        // −0,075 %, même cause et même sens que ci-dessus).
        expect(Math.round(finalNW({ modelSurvivor: true }, true))).toBe(44_492_428);
    });
});
