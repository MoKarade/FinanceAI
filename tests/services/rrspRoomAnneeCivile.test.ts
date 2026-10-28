/**
 * [RRSP-FIRST-YEAR-13M] Les droits REER se calculent sur l'ANNÉE CIVILE, pas sur 13 mois.
 *
 * Le revenu gagné du mois était versé à l'accumulateur annuel AVANT le reset de janvier. Le revenu
 * de janvier entrait donc dans l'assiette de l'année qui venait de se CLORE : le premier cycle
 * comptait 13 mois, et la fenêtre de tous les suivants était décalée (février→janvier).
 *
 * ⚠️ MESURÉ AVANT D'ÉCRIRE (mono-gagnant, 100 000 $ brut, droits à 18 %) :
 *   · croissance 0 % — avant : 19 500 $ la 1re année (= 18 000 × 13/12, +8,33 %) puis 18 000 $/an ;
 *     après : 18 000 $/an dès la première.
 *   · croissance 3 % — avant : 19 545, 18 586, 19 144, 19 718… ; après : 18 000, 18 540, 19 096,
 *     19 669… soit EXACTEMENT 18 % × 100 000 × 1,03ⁿ. Le décalage de fenêtre valait ~0,25 %/an
 *     de façon PERMANENTE, en plus du +8,33 % initial.
 *
 * ⚠️⚠️ POURQUOI LA CROISSANCE NON NULLE EST INDISPENSABLE ICI : à salaire constant, la fenêtre
 * février→janvier et l'année civile contiennent le même total. Le décalage permanent est alors
 * strictement invisible, et seul le +8,33 % de la première année se voit. C'est
 * `UNE-FIXTURE-QUI-SATURE-LA-CONTRAINTE-REND-LA-MESURE-AVEUGLE` : j'avais d'abord classé ce
 * décalage « de second ordre » sur la foi du cas à 0 %, où il n'existe pas.
 *
 * ⚠️ EFFET SUR L'ARGENT — il n'apparaît que là où les droits sont LIMITANTS. Sur une fixture qui
 * cotise 6 000 $/an contre 18 000 $ de droits, le patrimoine final est identique au dollar près :
 * des droits en trop ne changent rien tant que personne ne s'en sert. Sur une fixture qui sature
 * (300 000 $ de départ, 4 000 $/mois d'épargne, 8 ans) : **−311 $** à croissance nulle et
 * **−411 $** à 3 %. Borné, du bon signe — les droits fantômes gonflaient l'abri fiscal.
 */
import { describe, it, expect, vi } from 'vitest';
import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, User } from '../../types';
import type { AllocationStrategy } from '../../services/projection/types';

// Le défaut EST la valeur d'un ARGUMENT (le revenu gagné remis au calcul de janvier), pas une
// grandeur publiée. On l'OBSERVE donc, plutôt que de le reconstruire depuis les champs du graphe —
// deux capteurs indirects ont été essayés avant celui-ci et mesuraient autre chose (`REERMax` est
// CONSOMMÉ par les cotisations, et « une fixture qui ne cotise rien » n'existe pas ici :
// l'allocation place le surplus toute seule).
const revenusVusParJanvier: Array<{ annee: number; revenu: number }> = [];
vi.mock('../../services/projection/taxJanuary', async (importOriginal) => {
    const vrai = await importOriginal<typeof import('../../services/projection/taxJanuary')>();
    return {
        ...vrai,
        processJanuaryReset: (...args: Parameters<typeof vrai.processJanuaryReset>) => {
            const ctx = args[1] as unknown as { loopYear: number; accGrossIncomeYearByUser: [number, number] };
            const sortie = vrai.processJanuaryReset(...args);
            if (sortie) revenusVusParJanvier.push({ annee: ctx.loopYear, revenu: ctx.accGrossIncomeYearByUser[0] });
            return sortie;
        },
    };
});

const BRUT_ANNUEL = 100_000;
const TAUX_DROITS = 0.18;

const users: User[] = [
    { name: 'Marc', grossSalary: BRUT_ANNUEL / 12, netSalary: 5_600, color: '#10b981', age: 35, birthYear: 1991, canadaArrivalYear: 1991, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
] as unknown as User[];

const params = (croissance: number): SimulationParams => ({
    projection: {
        years: 6, inflationRate: 0, savingsMode: 'manual', manualContribution: 0,
        usePortfolioRate: false, returnRates: { celi: 0, reer: 0, nonReg: 0, crypto: 0, cash: 0 },
        emergencyFundMonths: 0, salaryGrowth: croissance, propertyGrowthRate: 0,
    } as unknown as ProjectionConfig,
    calculatedStartingCash: 50_000,
    liveCSVBalances: { CELI: 0, CELIAPP: 0, REER: 0, NON_ENREG: 0, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: { targetAge: 65, targetMonthlyIncome: 3_000, governmentPension: 1_400, lifeExpectancy: 90, dbPensionMonthly: 0 } as unknown as RetirementGoal,
    config: { users, splitMode: '50/50' } as unknown as BudgetConfig,
    baseGrossAnnual: BRUT_ANNUEL, baseNetAnnual: 67_200, currentRentExpense: 1_200,
    baseMonthlyExpenses: 3_000, startYear: 2026, startMonth: 0,
} as unknown as SimulationParams);

/** Lance un scénario et rend le revenu gagné que CHAQUE janvier a réellement reçu. */
const revenusParAnnee = (croissance: number): number[] => {
    revenusVusParJanvier.length = 0;
    __runScenarioForTests(
        params(croissance), 'AUTO_MARGINAL' as AllocationStrategy, true, false, 0, 'BASE', {}, {},
    );
    return revenusVusParJanvier.map(r => r.revenu);
};

describe("[RRSP-FIRST-YEAR-13M] les droits REER suivent l'année civile", () => {
    it("anti-vacuité : l'espion voit bien un janvier par année projetée", () => {
        // Sans ça, un espion mal câblé rendrait un tableau vide et TOUTES les assertions
        // ci-dessous passeraient en boucle sur zéro élément.
        expect(revenusParAnnee(0).length).toBeGreaterThanOrEqual(5);
    });

    it('salaire CONSTANT : chaque année vaut 12 mois, la PREMIÈRE comprise', () => {
        // Discriminant : avant ce lot, la première valeur était 108 333 $ — treize mois de salaire.
        for (const revenu of revenusParAnnee(0)) expect(revenu).toBeCloseTo(BRUT_ANNUEL, 0);
    });

    it("salaire CROISSANT : la fenêtre est l'année CIVILE, pas février→janvier", () => {
        // C'est le cas qui voit le décalage PERMANENT — invisible à salaire constant, où les deux
        // fenêtres contiennent le même total.
        const mesures = revenusParAnnee(3);
        mesures.forEach((revenu, n) => {
            expect(revenu).toBeCloseTo(BRUT_ANNUEL * Math.pow(1.03, n), 0);
        });
    });

    it('anti-vacuité de la précédente : à 3 %, les années ne sont PAS toutes égales', () => {
        // Une assertion « chaque année vaut son salaire » serait satisfaite par un moteur qui
        // rendrait une constante si le salaire ne bougeait jamais. Ici il bouge.
        const m = revenusParAnnee(3);
        expect(Number(m[m.length - 1])).toBeGreaterThan(Number(m[0]) * 1.1);
    });
});
