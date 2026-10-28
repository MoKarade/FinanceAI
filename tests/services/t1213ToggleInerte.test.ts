/**
 * [ENG-T1213-NET-MONTHLY] Le réglage T1213 n'a plus AUCUN effet — et ne doit pas en retrouver un.
 *
 * ⚠️ CETTE GARDE S'EST INVERSÉE le 2026-09-03, elle n'a pas été supprimée. Écrite au lot 114 comme
 * un INVENTAIRE DE DETTE (« activer ce réglage coûte jusqu'à 45,7 % du patrimoine »), elle a rougi
 * au lot 118 quand la dette a été payée — c'était exactement son travail
 * (`UN-INVENTAIRE-DE-DETTE-DOIT-SAVOIR-MOURIR`). Ce qui MEURT est l'inventaire (« combien ça
 * coûte ? ») ; ce qui RESTE est la règle (« ça ne doit plus rien coûter »), au même endroit, avec
 * son histoire écrite dedans — sans quoi plus rien n'empêcherait de re-brancher le réglage
 * « pour simplifier ».
 *
 * CE QUI A ÉTÉ FAIT (décision de Marc, 2026-09-03) : le bouton est retiré de
 * `AdvancedProjectionParams`, ET le moteur force le réglage à `false` quoi qu'il y ait dans la
 * configuration enregistrée. Les deux vont ENSEMBLE : le réglage est PERSISTÉ, donc retirer le seul
 * bouton aurait laissé une config déjà à `true` bloquée avec −45,7 % et aucun recours — « un repli
 * persisté est pire qu'un repli calculé ».
 *
 * LE DÉFAUT D'ORIGINE, pour mémoire. Le vrai formulaire T1213 fait réduire la retenue à la source
 * pour tenir compte des cotisations REER : on encaisse davantage CHAQUE PAIE au lieu d'attendre le
 * remboursement d'avril — neutre à positif. Le moteur n'en modélisait que la moitié : il réduisait
 * la retenue estimée (`taxDecember.ts`, `deductionsEmployer*`) mais le net mensuel encaissé vient du
 * `netSalary` SAISI et ne montait jamais. Mesuré avant correctif (célibataire 150 000 $, 3 000 $/mois
 * d'épargne, REER 80 000 $) : **−16,1 % à 5 ans · −24,5 % à 10 ans · −29,2 % à 20 ans · −45,7 %
 * (−1 031 419 $) à 30 ans**. Le pourcentage GRANDISSAIT avec l'horizon — une économie fiscale
 * annuelle qu'on cesse de capitaliser compose par construction.
 *
 * ⚠️ AVANT DE RE-BRANCHER quoi que ce soit : il faut d'abord majorer le net mensuel de
 * `[tax(g,0) − tax(g,d)]/12`, ce qui bute sur une causalité — les déductions REER de l'année ne sont
 * connues qu'en décembre, alors que le net de janvier en dépendrait. Le vrai T1213 résout ça en
 * s'appuyant sur les cotisations PRÉVUES ; le moteur devrait faire de même.
 */import { describe, it, expect } from 'vitest';
import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, User } from '../../types';
import type { AllocationStrategy } from '../../services/projection/types';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stripComments } from '../../utils/stripComments';

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

describe('[ENG-T1213-NET-MONTHLY] le réglage T1213 est INERTE, dans les deux sens', () => {
    it('activer le réglage ne change RIEN au patrimoine, à aucun horizon', () => {
        // Discriminant : avant le lot 118, ces trois écarts valaient −16,1 %, −29,2 % et −45,7 %.
        // `toBe` plutôt qu'une tolérance : le moteur force `false`, donc les deux runs sont le MÊME
        // calcul — une égalité au dollar près est la seule assertion honnête ici.
        for (const annees of [5, 20, 30]) {
            expect(patrimoine(true, annees)).toBe(patrimoine(false, annees));
        }
    });

    it('anti-vacuité : la fixture produit bien un patrimoine, on ne compare pas deux zéros', () => {
        expect(patrimoine(false, 30)).toBeGreaterThan(100_000);
    });

    it('le champ est encore ACCEPTÉ par le type — aucune migration de données n\'a eu lieu', () => {
        // Une config enregistrée avec `optimizeSourceDeductions: true` doit rester lisible et ne
        // rien casser. C'est le pendant de la décision « forcer à OFF sans supprimer le champ » :
        // si ce cas cessait de compiler, c'est qu'on aurait touché au schéma persisté.
        expect(() => patrimoine(true, 5)).not.toThrow();
    });

    it('le moteur ne LIT plus le réglage de la configuration', () => {
        // Garde de SOURCE, parce que le test comportemental ci-dessus resterait vert si quelqu'un
        // re-branchait le réglage ET corrigeait le net mensuel dans le même geste — ce qui serait
        // légitime, mais doit être DÉLIBÉRÉ. Ce cas rougit alors et exige qu'on relise l'en-tête.
        const src = readFileSync(resolve(__dirname, '../../services/projection.ts'), 'utf8');
        expect(stripComments(src)).toContain('optimizeSourceDeductions: false');
    });
});
