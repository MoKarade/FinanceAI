/**
 * [REEE-CONGE-SANS-GARDE-SOLO] Le congé parental ne s'applique pas à un parent qui n'est plus là.
 *
 * ⚠️ LE DÉFAUT, MESURÉ AU PRODUCTEUR. `projection.ts` passait `grossAnnaBaseAnnual` BRUT au bloc
 * enfants, sans le garde `soloHousehold` appliqué aux QUATRE autres sites qui transmettent ce
 * salaire. Après un décès ou un divorce, le bloc déclenchait donc le congé sur un salaire que le
 * ménage ne touche plus : mesuré, `accGrossDelta = −5 000 $/mois` (−60 k$/an de brut RETIRÉ, jamais
 * crédité) et `+2 436 $/mois` de prestation RQAP fabriquée pour un parent absent.
 *
 * ⚠️ POURQUOI UN TEST DE SCÉNARIO ET PAS UN TEST DU MODULE. Le module enfants n'a AUCUN moyen de
 * savoir que le second parent a disparu — l'information ne lui parvient que par ce que l'appelant
 * lui passe. Un test de `processOneChild` en isolation prouverait la mécanique et raterait le
 * défaut, qui est un défaut de CÂBLAGE (`GARDE-AU-PRODUCTEUR-NE-PROUVE-PAS-LA-CHAINE`).
 *
 * ⚠️ LA MESURE. Deux scénarios identiques à une chose près : l'enfant naît PENDANT la projection
 * (le congé se déclenche) ou bien AVANT (il n'a plus lieu d'être). Le congé n'agit que sur le
 * REVENU ; à divorce identique, l'écart de `Income` entre les deux runs isole donc exactement son
 * effet. Après divorce, cet écart doit être NUL.
 */
import { describe, it, expect } from 'vitest';
import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import type { AllocationStrategy } from '../../services/projection/types';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, User, ChildGoal } from '../../types';

const users = (age = 40): User[] => ([
    { name: 'Marc', grossSalary: 8200, netSalary: 5620, color: '#10b981', age, birthYear: 2026 - age, canadaArrivalYear: 2026 - age, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
    { name: 'Anna', grossSalary: 7100, netSalary: 4995, color: '#3b82f6', age, birthYear: 2026 - age, canadaArrivalYear: 2026 - age, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
] as unknown as User[]);

const goal: RetirementGoal = { targetAge: 62, targetMonthlyIncome: 5500, governmentPension: 1850, lifeExpectancy: 92, dbPensionMonthly: 0 } as unknown as RetirementGoal;

const enfant = (birthDate: string): ChildGoal => ({
    id: 'e1', name: 'Bébé', isActive: true, birthDate,
    initialCost: 0, monthlyDiapers: 0, monthlyFood: 0, monthlyClothing: 0,
    daycareType: 'cpe', schoolType: 'publique', activitiesLevel: 'legeres',
    universityType: 'uni_local', carGift: 'non', governmentBenefits: 0,
} as unknown as ChildGoal);

const params = (divorce: boolean, birthDate: string): SimulationParams => ({
    projection: {
        years: 6, returnRate: 6, inflationRate: 0, savingsMode: 'manual',
        manualContribution: 0, usePortfolioRate: false,
        returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
        emergencyFundMonths: 6, salaryGrowth: 0, propertyGrowthRate: 0,
        // `tryDivorce` n'existe QUE dans la branche Monte Carlo — d'où `enableMonteCarlo` au run.
        ...(divorce ? { divorceEnabled: true, divorceAnnualProbability: 1, divorceSplitPct: 50 } : {}),
    } as ProjectionConfig,
    calculatedStartingCash: 200_000,
    liveCSVBalances: { CELI: 0, CELIAPP: 0, REER: 0, NON_ENREG: 0, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: [], childGoals: [enfant(birthDate)], travelGoals: [], lifeEvents: [],
    retirementGoal: goal,
    config: { users: users(40), splitMode: '50/50' } as BudgetConfig,
    baseGrossAnnual: 183_600, baseNetAnnual: 127_380, currentRentExpense: 1_800,
    baseMonthlyExpenses: 4_500, startYear: 2026, startMonth: 0,
} as unknown as SimulationParams);

type Pt = Record<string, number | undefined>;

const run = (divorce: boolean, birthDate: string): Pt[] => {
    const r = __runScenarioForTests(
        params(divorce, birthDate), 'AUTO_MARGINAL' as AllocationStrategy, true, false,
        0, 'BASE' as never, {}, { verboseMonthlyPoints: true } as never,
    ) as unknown as { chartData?: Pt[] };
    const pts = r.chartData ?? [];
    if (pts.length === 0) throw new Error('chartData vide — scénario dégénéré, le test serait vacueux');
    return pts;
};

const income = (pts: Pt[], m: number): number => {
    const p = pts.find((x) => Number(x.monthIndex) === m);
    if (!p) throw new Error(`mois ${m} absent (longueur ${pts.length})`);
    const v = p.Income;
    // ⚠️ En mode MC le moteur réduit ses points : sans `verboseMonthlyPoints`, `Income` serait
    // `undefined` partout et ce test comparerait des zéros — vert sur n'importe quel code.
    if (!Number.isFinite(v)) throw new Error(`Income absent au mois ${m} — mesure vacueuse`);
    return v as number;
};

// L'enfant naît au mois 24 de la projection : le congé (< 12 mois) couvre donc les mois 24 à 35,
// bien après le divorce, qui se déclenche dès la 1ʳᵉ année (probabilité annuelle = 1).
const NAISSANCE_PENDANT = '2028-01-01';
const NE_AVANT = '2018-01-01';
const MOIS_OBSERVE = 30;

describe('[REEE-CONGE-SANS-GARDE-SOLO] après un divorce, aucun congé pour le parent parti', () => {
    it('le scénario EXERCE bien le congé hors divorce (anti-vacuité)', () => {
        // Sans cette mesure, « l'écart est nul après divorce » serait aussi vrai d'un scénario où
        // le congé ne se déclenche jamais — le test passerait sur un moteur cassé.
        const avecBebe = income(run(false, NAISSANCE_PENDANT), MOIS_OBSERVE);
        const sansBebe = income(run(false, NE_AVANT), MOIS_OBSERVE);
        expect(Math.abs(avecBebe - sansBebe), 'le congé ne produit aucun effet : mesure vacueuse')
            .toBeGreaterThan(100);
    });

    it('APRÈS divorce : le congé n’a plus AUCUN effet sur le revenu', () => {
        const avecBebe = income(run(true, NAISSANCE_PENDANT), MOIS_OBSERVE);
        const sansBebe = income(run(true, NE_AVANT), MOIS_OBSERVE);
        expect(avecBebe).toBeCloseTo(sansBebe, 2);
    });
});
