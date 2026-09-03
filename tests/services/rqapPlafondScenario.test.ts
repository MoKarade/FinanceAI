/**
 * [GOLDEN-RQAP-NON-COUVERT] Le plafond RQAP, mesuré SUR LA CHAÎNE et non chez son producteur.
 *
 * ⚠️ POURQUOI CE FICHIER EXISTE. `[RQAP-CAP-98K]` a déplacé l'assiette de +2 750 $/an dès que le
 * 2ᵉ parent dépasse le plafond — et **aucun golden n'avait bougé**. Ce n'était pas la preuve que le
 * correctif était neutre : c'était la preuve qu'AUCUNE fixture ne combinait « enfant de moins de
 * 12 mois » et « 2ᵉ parent au-dessus du plafond » (« aucun golden n'a bougé est un résultat à
 * EXPLIQUER »). RE-MESURÉ avant d'écrire ce fichier : diviser `rqapCapProjected` par deux fait
 * rougir 4 tests, TOUS unitaires sur le plafond lui-même, et zéro test de scénario. Le ticket
 * disait vrai.
 *
 * ⚠️ CE QUE LA GARDE MESURE, ET POURQUOI PAS LE MONTANT. Le moteur ne publie pas la prestation
 * séparément : elle est fondue dans `Income`. On mesure donc l'EFFET du congé — `Income` avec un
 * nourrisson moins `Income` sans — et surtout sa PENTE par rapport au salaire du 2ᵉ parent :
 *
 *   • SOUS le plafond, un dollar de salaire en plus augmente aussi la prestation → le congé ne
 *     coûte que la FRACTION non remplacée. Mesuré (2026-09-03) : **0,291 $ par dollar de brut**.
 *   • AU-DESSUS, la prestation est FIGÉE au plafond → chaque dollar de salaire en plus est perdu
 *     en entier pendant le congé. Mesuré : **0,700 $ par dollar de brut**, soit le taux net exact
 *     de la fixture.
 *
 * Le rapport des deux pentes (**2,40** mesuré) est la signature du plafond. Il ne dépend d'aucun
 * montant épinglé, donc il ne se re-base pas à la prochaine indexation — c'est le FAIT qu'il
 * défend, pas la valeur qu'avait le code (`UNE-GARDE-ANCRE-LE-FAIT-JAMAIS-LA-FORME`).
 */
import { describe, it, expect } from 'vitest';
import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import { RQAP_MAX_INCOME } from '../../utils/tax';
import type { AllocationStrategy } from '../../services/projection/types';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, User, ChildGoal } from '../../types';

/** Taux net de la fixture : `netSalary` vaut 70 % du brut pour les deux conjoints. */
const TAUX_NET = 0.7;

const users = (annaGrossMonthly: number): User[] => ([
    { name: 'Marc', grossSalary: 8200, netSalary: 8200 * TAUX_NET, color: '#10b981', age: 40, birthYear: 1986, canadaArrivalYear: 1986, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
    { name: 'Anna', grossSalary: annaGrossMonthly, netSalary: annaGrossMonthly * TAUX_NET, color: '#3b82f6', age: 40, birthYear: 1986, canadaArrivalYear: 1986, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
] as unknown as User[]);

const goal = { targetAge: 62, targetMonthlyIncome: 5500, governmentPension: 1850, lifeExpectancy: 92, dbPensionMonthly: 0 } as unknown as RetirementGoal;

const enfant = (birthDate: string): ChildGoal => ({
    id: 'e1', name: 'Bébé', isActive: true, birthDate, initialCost: 0, monthlyDiapers: 0,
    monthlyFood: 0, monthlyClothing: 0, daycareType: 'cpe', schoolType: 'publique',
    activitiesLevel: 'legeres', universityType: 'uni_local', carGift: 'non', governmentBenefits: 0,
} as unknown as ChildGoal);

const params = (annaGrossMonthly: number, birthDate: string): SimulationParams => ({
    projection: {
        // `inflationRate: 0` et `salaryGrowth: 0` : le plafond est projeté par `inflation + 0,5 pp`,
        // donc l'annuler garde la comparaison des deux pentes sur la MÊME année de plafond.
        years: 6, returnRate: 6, inflationRate: 0, savingsMode: 'manual', manualContribution: 0,
        usePortfolioRate: false, returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
        emergencyFundMonths: 6, salaryGrowth: 0, propertyGrowthRate: 0,
    } as ProjectionConfig,
    calculatedStartingCash: 200_000,
    liveCSVBalances: { CELI: 0, CELIAPP: 0, REER: 0, NON_ENREG: 0, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: [], childGoals: [enfant(birthDate)], travelGoals: [], lifeEvents: [],
    retirementGoal: goal,
    config: { users: users(annaGrossMonthly), splitMode: '50/50' } as BudgetConfig,
    baseGrossAnnual: (8200 + annaGrossMonthly) * 12,
    baseNetAnnual: (8200 + annaGrossMonthly) * 12 * TAUX_NET,
    currentRentExpense: 1_800, baseMonthlyExpenses: 4_500, startYear: 2026, startMonth: 0,
} as unknown as SimulationParams);

type Pt = Record<string, number | undefined>;

const income = (annaGrossMonthly: number, birthDate: string, m: number): number => {
    const r = __runScenarioForTests(
        params(annaGrossMonthly, birthDate), 'AUTO_MARGINAL' as AllocationStrategy, true, false,
        0, 'BASE' as never, {}, { verboseMonthlyPoints: true } as never,
    ) as unknown as { chartData?: Pt[] };
    const p = (r.chartData ?? []).find((x) => Number(x.monthIndex) === m);
    const v = p?.Income;
    // ⚠️ Sans `verboseMonthlyPoints`, le moteur réduit ses points et `Income` serait `undefined` :
    // la garde comparerait des zéros et serait verte sur n'importe quel code.
    if (!Number.isFinite(v)) throw new Error(`Income absent au mois ${m} — mesure vacueuse`);
    return v as number;
};

/** L'enfant naît au mois 24 ; le congé (< 12 mois) couvre les mois 24 à 35. */
const NAISSANCE_PENDANT = '2028-01-01';
const NE_AVANT = '2018-01-01';
const MOIS_OBSERVE = 30;

/** Effet du congé sur le revenu du mois observé, à salaire du 2ᵉ parent donné. */
const effet = (annaGrossMonthly: number): number =>
    income(annaGrossMonthly, NAISSANCE_PENDANT, MOIS_OBSERVE)
    - income(annaGrossMonthly, NE_AVANT, MOIS_OBSERVE);

/** Pente de l'effet par dollar de brut MENSUEL, entre deux salaires. */
const pente = (bas: number, haut: number): number =>
    Math.abs(effet(haut) - effet(bas)) / (haut - bas);

// Deux couples de salaires, l'un STRICTEMENT sous le plafond, l'autre strictement au-dessus.
const SOUS = [6_000, 7_000] as const;      // 72 k$ et 84 k$/an
const AU_DESSUS = [12_000, 14_000] as const; // 144 k$ et 168 k$/an

describe('[GOLDEN-RQAP-NON-COUVERT] le plafond RQAP mord bien sur la CHAÎNE', () => {
    it('la fixture ENCADRE vraiment le plafond (sans quoi les deux pentes mesureraient la même chose)', () => {
        // Dérivé de la source unique, jamais d'un littéral recopié : le jour où le plafond est
        // indexé, c'est cette assertion qui dira que la fixture ne l'encadre plus.
        expect(SOUS[1] * 12, 'le couple BAS doit rester sous le plafond').toBeLessThan(RQAP_MAX_INCOME);
        expect(AU_DESSUS[0] * 12, 'le couple HAUT doit dépasser le plafond').toBeGreaterThan(RQAP_MAX_INCOME);
    });

    it('le congé PRODUIT un effet aux quatre niveaux (anti-vacuité)', () => {
        // Sans ce cas, un rapport de pentes serait aussi « vrai » sur un moteur où le congé ne se
        // déclenche jamais — le test passerait sur du code mort.
        for (const s of [...SOUS, ...AU_DESSUS]) {
            expect(Math.abs(effet(s)), `aucun effet du congé à ${s} $/mois : mesure vacueuse`)
                .toBeGreaterThan(100);
        }
    });

    it('au-dessus du plafond, chaque dollar de salaire est perdu EN ENTIER pendant le congé', () => {
        // MESURÉ le 2026-09-03 : 0,291 sous le plafond, 0,700 au-dessus, rapport 2,40.
        // Les bornes sont larges à dessein — ce qui est défendu est le CHANGEMENT DE RÉGIME, pas
        // les décimales, qui bougeront à la prochaine indexation ou au prochain barème.
        const penteSous = pente(SOUS[0], SOUS[1]);
        const penteAuDessus = pente(AU_DESSUS[0], AU_DESSUS[1]);
        expect(penteAuDessus / penteSous,
            `le plafond ne mord pas : pente sous = ${penteSous.toFixed(3)}, au-dessus = ${penteAuDessus.toFixed(3)}. `
            + 'Au-dessus du plafond la prestation est FIGÉE, donc la pente doit être nettement plus raide.')
            .toBeGreaterThan(1.8);
        // Et au-dessus, la pente vaut le taux NET de la fixture : la prestation ne bouge plus du tout.
        expect(penteAuDessus).toBeCloseTo(TAUX_NET, 1);
    });
});
