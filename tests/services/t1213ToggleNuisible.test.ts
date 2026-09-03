/**
 * [ENG-T1213-NET-MONTHLY] Le bouton « T1213 retenue source ON » ne peut que NUIRE.
 *
 * ⚠️ CE FICHIER EST UN INVENTAIRE DE DETTE, pas une validation. Il épingle un défaut CONNU pour
 * qu'il ne se re-découvre pas, et pour que le jour où il est corrigé ces assertions rougissent et
 * EXIGENT d'être inversées (`UN-INVENTAIRE-DE-DETTE-DOIT-SAVOIR-MOURIR`).
 *
 * LE MÉCANISME. Le formulaire T1213 permet, dans la vraie vie, de faire réduire la retenue à la
 * source pour tenir compte de ses cotisations REER : on encaisse davantage CHAQUE PAIE au lieu
 * d'attendre le remboursement d'avril. C'est neutre à positif pour le contribuable.
 * Le moteur ne modélise que la MOITIÉ de ça. Activer le réglage réduit bien la retenue estimée
 * (`taxDecember.ts`, `deductionsEmployer*`), donc le remboursement d'avril disparaît — mais le net
 * mensuel encaissé vient du `netSalary` SAISI et ne monte JAMAIS. Le ménage perd l'économie
 * fiscale de son REER sans jamais recevoir la contrepartie.
 *
 * ⚠️ MESURÉ AVANT D'ÉCRIRE (célibataire 150 000 $ brut, 3 000 $/mois d'épargne, REER 80 000 $ au
 * départ) — et le ticket SOUS-ESTIMAIT le défaut d'un facteur ~5 en n'annonçant qu'un montant :
 *     5 ans  :   596 195 → 499 933   (−96 263 $,   −16,1 %)
 *    10 ans  :   877 470 → 662 078   (−215 392 $,  −24,5 %)
 *    20 ans  : 1 676 357 → 1 186 194 (−490 163 $,  −29,2 %)
 *    30 ans  : 2 258 470 → 1 227 051 (−1 031 419 $, −45,7 %)
 * Le POURCENTAGE grandit avec l'horizon : ce n'est pas un biais fixe, c'est une économie fiscale
 * annuelle qu'on cesse de capitaliser (`UN-BIAIS-QUI-COMPOSE-N-EST-PAS-UN-BIAIS-FIXE`). Un ticket
 * qui ne porte qu'un montant, sans son horizon ni sa trajectoire, ne dit pas la gravité.
 *
 * ⚠️ POURQUOI CE LOT NE CORRIGE PAS. Les deux remèdes possibles sont des décisions de Marc,
 * routées dans `docs/A_FAIRE_MOI.md` :
 *   (a) majorer le net mensuel de `[tax(g,0) − tax(g,d)]/12` — le remède que prescrit le ticket,
 *       mais il a un problème de CAUSALITÉ qu'il ne mentionne pas : les déductions REER de l'année
 *       ne sont connues qu'en décembre, alors que le net de janvier en dépendrait ;
 *   (b) retirer le bouton de l'interface — retirer une fonctionnalité visible est un choix produit.
 *
 * ⚠️ Signal ÉCARTÉ en chemin : `totalTaxesPaid` sort NÉGATIF quand le réglage est OFF. Ce n'est pas
 * un défaut — c'est documenté sous `[PROJ-TAXPAID-LABEL]` (« année à gros remboursement »), et le
 * compteur porte son clamp là où il est lu.
 */
import { describe, it, expect } from 'vitest';
import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, User } from '../../types';
import type { AllocationStrategy } from '../../services/projection/types';

const users: User[] = [
    { name: 'Marc', grossSalary: 12_500, netSalary: 7_800, color: '#10b981', age: 40, birthYear: 1986, canadaArrivalYear: 1986, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
] as unknown as User[];

const params = (t1213: boolean, annees: number): SimulationParams => ({
    projection: {
        years: annees, inflationRate: 2, savingsMode: 'manual', manualContribution: 3_000,
        usePortfolioRate: false, returnRates: { celi: 5, reer: 5, nonReg: 5, crypto: 5, cash: 1 },
        emergencyFundMonths: 0, salaryGrowth: 2, propertyGrowthRate: 0,
        optimizeSourceDeductions: t1213,
    } as unknown as ProjectionConfig,
    calculatedStartingCash: 60_000,
    liveCSVBalances: { CELI: 40_000, CELIAPP: 0, REER: 80_000, NON_ENREG: 20_000, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: { targetAge: 62, targetMonthlyIncome: 5_000, governmentPension: 1_500, lifeExpectancy: 90, dbPensionMonthly: 0 } as unknown as RetirementGoal,
    config: { users, splitMode: '50/50' } as unknown as BudgetConfig,
    baseGrossAnnual: 150_000, baseNetAnnual: 93_600, currentRentExpense: 1_800,
    baseMonthlyExpenses: 4_500, startYear: 2026, startMonth: 0,
} as unknown as SimulationParams);

const patrimoine = (t1213: boolean, annees: number): number => Number((__runScenarioForTests(
    params(t1213, annees), 'AUTO_MARGINAL' as AllocationStrategy, true, false, 0, 'BASE', {}, {},
) as unknown as Record<string, number>).finalNetWorth);

/** L'écart RELATIF que le réglage coûte, en points de pourcentage du patrimoine sans lui. */
const coutRelatif = (annees: number): number => {
    const sans = patrimoine(false, annees);
    const avec = patrimoine(true, annees);
    expect(sans).toBeGreaterThan(0); // anti-vacuité : comparer deux zéros ne dirait rien
    return (avec - sans) / sans;
};

describe('[ENG-T1213-NET-MONTHLY] limite épinglée : le réglage T1213 dégrade la projection', () => {
    it('à 5 ans, activer le réglage coûte déjà plus de 10 % du patrimoine', () => {
        expect(coutRelatif(5)).toBeLessThan(-0.10);
    });

    it('à 30 ans, il en coûte plus de 40 % — le biais COMPOSE, il n\'est pas fixe', () => {
        // C'est cette assertion qui dit la gravité : un ticket qui n'annonce qu'un MONTANT ne
        // distingue pas un biais borné d'une économie annuelle qu'on cesse de capitaliser.
        expect(coutRelatif(30)).toBeLessThan(-0.40);
    });

    it('DETTE À ZÉRO → inverse cette garde : le réglage ne doit plus rien coûter', () => {
        // Le vrai T1213 est neutre à positif. Le jour où (a) ou (b) est livré, cette assertion
        // rougit et EXIGE d'être inversée en « le réglage ne dégrade plus rien » — elle ne se
        // supprime pas : c'est la trace qui empêche de re-livrer le défaut.
        expect(coutRelatif(30)).toBeLessThan(0);
    });
});
