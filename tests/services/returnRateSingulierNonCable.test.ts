/**
 * [ENG-RETURNRATE-SINGULIER-NON-CABLE] `projection.returnRate` ne pilote AUCUNE croissance du moteur.
 *
 * ⚠️ POURQUOI CE FAIT MÉRITE UNE GARDE, alors que rien n'est cassé. Le moteur lit
 * `projection.returnRates` — la carte PAR COMPTE (`setupSimulation.ts`, `computeScenarioOverrides`).
 * Le champ SINGULIER `projection.returnRate` existe toujours, il est saisi dans l'UI, et il ne
 * traverse pas jusqu'au moteur. Un auteur qui écrit `returnRate: 5` dans une fixture de scénario
 * croit simuler à 5 % et simule en réalité sur les défauts (7 / 6,5 / 6,5 / 10 / 3). Ce n'est pas
 * théorique : ce champ a déjà fait dérailler DEUX mesures money-critical (panel PR #759), et le
 * dépôt porte la même classe sous `UN-PARAMETRE-HOMONYME-A-DEUX-NIVEAUX`.
 *
 * ⚠️ CE QUE CETTE GARDE NE FAIT PAS. Elle ne tranche pas entre RETIRER le champ (et recâbler l'UI)
 * et le CÂBLER (et décider ce qu'il écrase de la carte par compte) : cette réponse change ce que
 * l'utilisateur voit, elle est routée à Marc. La garde fige le FAIT tant que la décision n'est pas
 * prise — pour qu'un câblage futur soit un acte DÉLIBÉRÉ, pas un accident.
 *
 * ⚠️ L'AMPLITUDE ANNONCÉE PAR LE TICKET EST RÉFUTÉE. Il écrivait « des dizaines de fixtures de test
 * fixent `returnRate` sans jamais fixer `returnRates` ». MESURÉ le 2026-09-03 : **72 fichiers de
 * test** posent `returnRate:`, dont **69** posent aussi `returnRates`. Par SITE, il en reste
 * **trois**, tous des tests d'UI ou d'accessibilité où le champ singulier est le consommateur
 * LÉGITIME. Aucune fixture de moteur ne tombe dans le piège aujourd'hui — c'est justement ce que
 * cette garde préserve.
 */
import { describe, it, expect } from 'vitest';
import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import type { AllocationStrategy } from '../../services/projection/types';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, User } from '../../types';

const users: User[] = [
    { name: 'Marc', grossSalary: 8200, netSalary: 5620, color: '#10b981', age: 40, birthYear: 1986, canadaArrivalYear: 1986, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
] as unknown as User[];

const goal = { targetAge: 62, targetMonthlyIncome: 5500, governmentPension: 1850, lifeExpectancy: 92, dbPensionMonthly: 0 } as unknown as RetirementGoal;

const TAUX_PAR_COMPTE = { celi: 6, reer: 6, nonReg: 6, crypto: 6, cash: 6 };

const params = (proj: Record<string, unknown>): SimulationParams => ({
    projection: {
        years: 10, inflationRate: 0, savingsMode: 'manual', manualContribution: 500,
        usePortfolioRate: false, emergencyFundMonths: 6, salaryGrowth: 0, propertyGrowthRate: 0,
        ...proj,
    } as unknown as ProjectionConfig,
    calculatedStartingCash: 200_000,
    liveCSVBalances: { CELI: 50_000, CELIAPP: 0, REER: 50_000, NON_ENREG: 50_000, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: goal,
    config: { users, splitMode: '50/50' } as BudgetConfig,
    baseGrossAnnual: 98_400, baseNetAnnual: 67_440, currentRentExpense: 1_800,
    baseMonthlyExpenses: 4_500, startYear: 2026, startMonth: 0,
} as unknown as SimulationParams);

const patrimoineFinal = (proj: Record<string, unknown>): number => {
    const r = __runScenarioForTests(
        params(proj), 'AUTO_MARGINAL' as AllocationStrategy, false, false,
        0, 'BASE' as never, {}, {} as never,
    ) as unknown as { chartData?: Array<Record<string, number | undefined>> };
    const pts = r.chartData ?? [];
    const dernier = pts[pts.length - 1]?.NetWorth;
    // Sans cette exigence, comparer deux `undefined` donnerait « identique » sur n'importe quel code.
    if (!Number.isFinite(dernier)) throw new Error('NetWorth final absent — mesure vacueuse');
    return dernier as number;
};

describe('[ENG-RETURNRATE-SINGULIER-NON-CABLE] le champ singulier n\'atteint pas le moteur', () => {
    it('changer `returnRate` du simple au TRIPLE ne déplace pas un dollar', () => {
        // Mesure comportementale, pas un scan : c'est le patrimoine PUBLIÉ qu'on compare, à carte
        // par compte identique. Si un jour quelqu'un câble le champ, ce test rougit — et c'est
        // exactement le signal voulu, le câblage devant être un acte délibéré.
        const bas = patrimoineFinal({ returnRates: TAUX_PAR_COMPTE, returnRate: 3 });
        const haut = patrimoineFinal({ returnRates: TAUX_PAR_COMPTE, returnRate: 9 });
        const absent = patrimoineFinal({ returnRates: TAUX_PAR_COMPTE });
        expect(bas).toBe(absent);
        expect(haut).toBe(absent);
    });

    it('…alors que la carte PAR COMPTE, elle, déplace bien le patrimoine (levier)', () => {
        // L'anti-vacuité qui compte : sans elle, « les trois runs sont identiques » serait aussi
        // vrai d'un moteur qui ignore TOUT taux, ou d'une fixture qui ne fait rien croître.
        const a = patrimoineFinal({ returnRates: { celi: 2, reer: 2, nonReg: 2, crypto: 2, cash: 2 } });
        const b = patrimoineFinal({ returnRates: { celi: 9, reer: 9, nonReg: 9, crypto: 9, cash: 9 } });
        expect(b).toBeGreaterThan(a);
        // Écart substantiel, pas un résiduel d'arrondi : la fixture fait vraiment croître.
        expect((b - a) / Math.abs(a)).toBeGreaterThan(0.10);
    });
});
