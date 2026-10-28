/**
 * [ENG-GOALS-HORS-TOTALEXPENSES] Un tirage d'objectif SORT de l'argent sans entrer dans `totalExpenses`.
 *
 * ⚠️ CE QUE CETTE GARDE EST : un INVENTAIRE DE DETTE, pas une validation. Elle épingle une limite
 * CONNUE pour qu'elle ne se re-découvre pas, et pour que le jour où elle est corrigée, elle rougisse
 * et EXIGE d'être inversée (`UN-INVENTAIRE-DE-DETTE-DOIT-SAVOIR-MOURIR`).
 *
 * ⚠️⚠️ LE CORRECTIF ÉVIDENT EST UNE RÉGRESSION MONEY-CRITICAL, et c'est la raison d'être de ce
 * fichier. Le mutateur d'objectifs (`services/projection.ts`) porte
 * `addExpense: (_n) => { /* déjà soustrait du compte ciblé *​/ }` — un no-op DÉLIBÉRÉ. Le rendre
 * effectif paraît être « le » correctif ; ça soustrairait le montant une SECONDE fois du flux réel,
 * parce que `monthlyExpenses` n'est pas un registre de reporting : il alimente directement
 * `monthlyCashflow = monthlyIncome − monthlyExpenses`. Le seul correctif correct est un
 * accumulateur de REPORTING distinct de celui qui pilote la trésorerie — routé, pas improvisé ici.
 *
 * ⚠️ CE QUE ÇA COÛTE AUJOURD'HUI : rien à l'écran. Le seul vrai lecteur de `totalExpenses` est le
 * calcul du **SWR** (taux de retrait sécuritaire) dans `monteCarlo.ts`, et ce champ n'a AUCUN
 * consommateur d'interface — vérifié par grep sur `components/`. Le risque est donc pour DEMAIN :
 * un lot qui brancherait le SWR à l'écran publierait un taux SOUS-ESTIMÉ, c'est-à-dire un plan qui
 * a l'air plus sûr qu'il ne l'est. C'est pour ce lot-là que cette garde existe.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import type { AllocationStrategy } from '../../services/projection/types';
import type {
    ProjectionConfig, BudgetConfig, RetirementGoal, User, FinancialGoal,
} from '../../types';

const users: User[] = [
    { name: 'Marc', grossSalary: 8200, netSalary: 5620, color: '#10b981', age: 40, birthYear: 1986, canadaArrivalYear: 1986, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
] as unknown as User[];

const retraite = { targetAge: 62, targetMonthlyIncome: 5500, governmentPension: 1850, lifeExpectancy: 92, dbPensionMonthly: 0 } as unknown as RetirementGoal;

/** Un objectif dont l'échéance tombe DANS la fenêtre projetée : il sera tiré. */
const objectif: FinancialGoal = {
    id: 'g1', name: 'Rénovation', type: 'other', targetAmount: 60_000,
    deadline: '2028-06-01', status: 'active', targetAccount: 'CELI',
} as unknown as FinancialGoal;

const params = (goals: FinancialGoal[]): SimulationParams => ({
    projection: {
        years: 8, inflationRate: 0, savingsMode: 'manual', manualContribution: 500,
        usePortfolioRate: false, returnRates: { celi: 5, reer: 5, nonReg: 5, crypto: 5, cash: 5 },
        emergencyFundMonths: 6, salaryGrowth: 0, propertyGrowthRate: 0,
    } as unknown as ProjectionConfig,
    calculatedStartingCash: 150_000,
    liveCSVBalances: { CELI: 120_000, CELIAPP: 0, REER: 60_000, NON_ENREG: 30_000, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: retraite,
    config: { users, splitMode: '50/50' } as BudgetConfig,
    baseGrossAnnual: 98_400, baseNetAnnual: 67_440, currentRentExpense: 1_800,
    baseMonthlyExpenses: 4_000, startYear: 2026, startMonth: 0,
    financialGoals: goals,
} as unknown as SimulationParams);

interface Sortie { finalNetWorth?: number; totalExpenses?: number }

const run = (goals: FinancialGoal[]): Sortie => {
    const r = __runScenarioForTests(
        params(goals), 'AUTO_MARGINAL' as AllocationStrategy, false, false,
        0, 'BASE' as never, {}, {} as never,
    ) as unknown as Sortie;
    // Sans cette exigence, comparer deux `undefined` rendrait « identique » sur n'importe quel code.
    if (!Number.isFinite(r.finalNetWorth) || !Number.isFinite(r.totalExpenses)) {
        throw new Error('finalNetWorth ou totalExpenses absent — mesure vacueuse');
    }
    return r;
};

describe('[ENG-GOALS-HORS-TOTALEXPENSES] limite CONNUE du registre de dépenses', () => {
    const avec = run([objectif]);
    const sans = run([]);

    it('l\'objectif SORT bien de l\'argent : le patrimoine final baisse (anti-vacuité)', () => {
        // C'est la moitié qui prouve que la fixture exerce vraiment le chemin. Sans elle, l'égalité
        // de `totalExpenses` ci-dessous serait aussi vraie d'un objectif jamais tiré.
        expect(sans.finalNetWorth! - avec.finalNetWorth!,
            'le tirage d\'objectif ne déplace rien : la fixture n\'exerce pas le chemin testé')
            .toBeGreaterThan(10_000);
    });

    it('…et pourtant `totalExpenses` ne bouge PAS — la limite, épinglée', () => {
        // ⚠️ Ce test AFFIRME le défaut. Le jour où le registre de reporting est corrigé, il rougit
        // et doit être INVERSÉ ici même, avec son histoire — pas supprimé
        // (`UN-TEST-DE-LIMITE-S-INVERSE-IL-NE-SE-SUPPRIME-PAS`).
        expect(avec.totalExpenses).toBeCloseTo(sans.totalExpenses!, 6);
    });

    it('le no-op du mutateur d\'objectifs est DÉLIBÉRÉ : ne pas le « corriger »', () => {
        // Garde de SOURCE, assumée comme telle : le fait à protéger est une INTENTION, et le seul
        // endroit où elle est lisible est le code. Le rendre effectif soustrairait le montant une
        // seconde fois du flux réel — `monthlyExpenses` alimente `monthlyCashflow`.
        const src = readFileSync('services/projection.ts', 'utf8');
        expect(src).toContain('monthlyCashflow = monthlyIncome - monthlyExpenses');
        expect(src, 'le no-op a disparu : vérifier qu\'on n\'a pas introduit une double soustraction')
            .toMatch(/addExpense:\s*\(_n:\s*number\)\s*=>\s*\{\s*\/\*/);
    });
});
