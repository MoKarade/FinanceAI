/**
 * [FISC-DIV-ACB-STEPUP] Le dividende réputé du non-enregistré fait monter le prix de base rajusté.
 *
 * LE DÉFAUT. Le moteur impose chaque année un dividende réputé sur le non-enregistré
 * (`computeAnnualNonRegDividends`, 30 % du rendement — `taxCurrent.gains += divTax`), mais son
 * montant RESTE dans le compte : aucun cash n'en sort. C'est donc un dividende RÉINVESTI. Or l'ACB
 * ne montait d'aucun de ses six sites d'écriture — la même somme était donc imposée une SECONDE
 * fois dans le gain latent (`nonReg − nonRegACB`), à la réalisation comme au décès.
 *
 * ⚠️ MESURÉ AVANT D'ÉCRIRE (célibataire, 500 000 $ de non-enregistré, 5 %/an, 2 % d'inflation) — le
 * gain COMPOSE, puisque c'est un pas d'ACB manqué chaque année :
 *   10 ans : patrimoine +1 911 $ · succession +7 739 $
 *   20 ans : patrimoine +12 055 $ · succession +16 703 $
 *   30 ans : patrimoine +31 055 $ · succession +30 975 $
 *
 * ⚠️ LE TICKET SURESTIMAIT, tout en ayant raison sur le mécanisme : il annonçait « ≈ 58 k$ d'impôt
 * en double » à 20 ans par une arithmétique sur l'ACB manquant. Mesuré, c'est 12 à 17 k$ — parce
 * que l'impôt en double n'est dû qu'à la RÉALISATION, et qu'une projection n'en réalise qu'une
 * partie. C'est la SUCCESSION, qui liquide tout, qui approche le coût plein. Un ACB manquant n'est
 * pas un impôt payé : c'est un impôt payé le jour où on vend.
 *
 * ⚠️ POURQUOI LE MONTANT EST LE DIVIDENDE BRUT. Pas le majoré (la majoration est une fiction de
 * calcul de l'impôt, elle n'a jamais été investie), et pas le net d'impôt (l'impôt sort du compte
 * de liquidités, il ne réduit pas la mise réinvestie).
 */
import { describe, it, expect, vi } from 'vitest';
import { processDecemberTaxFiling, computeAnnualNonRegDividends } from '../../services/projection/taxDecember';
import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, User } from '../../types';
import type { AllocationStrategy } from '../../services/projection/types';

const NONREG = 500_000;
const TAUX = 5;

const users: User[] = [
    { name: 'Marc', grossSalary: 10_000, netSalary: 6_500, color: '#10b981', age: 45, birthYear: 1981, canadaArrivalYear: 1981, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
] as unknown as User[];

const params = (annees: number): SimulationParams => ({
    projection: {
        years: annees, inflationRate: 2, savingsMode: 'manual', manualContribution: 500,
        usePortfolioRate: false, returnRates: { celi: 5, reer: 5, nonReg: TAUX, crypto: 5, cash: 1 },
        emergencyFundMonths: 0, salaryGrowth: 2, propertyGrowthRate: 0,
    } as unknown as ProjectionConfig,
    calculatedStartingCash: 50_000,
    liveCSVBalances: { CELI: 50_000, CELIAPP: 0, REER: 100_000, NON_ENREG: NONREG, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: { targetAge: 60, targetMonthlyIncome: 5_000, governmentPension: 1_500, lifeExpectancy: 90, dbPensionMonthly: 0 } as unknown as RetirementGoal,
    config: { users, splitMode: '50/50' } as unknown as BudgetConfig,
    baseGrossAnnual: 120_000, baseNetAnnual: 78_000, currentRentExpense: 1_500,
    baseMonthlyExpenses: 4_000, startYear: 2026, startMonth: 0,
} as unknown as SimulationParams);

// Le delta d'ACB est un ARGUMENT rendu au moteur, pas une grandeur publiée : on l'OBSERVE.
const observations: Array<{ delta: number; nonReg: number; taux: number }> = [];
vi.mock('../../services/projection/taxDecember', async (importOriginal) => {
    const vrai = await importOriginal<typeof import('../../services/projection/taxDecember')>();
    return {
        ...vrai,
        processDecemberTaxFiling: (...args: Parameters<typeof vrai.processDecemberTaxFiling>) => {
            const ctx = args[1] as unknown as { nonReg: number; baseNonRegRate: number };
            const sortie = vrai.processDecemberTaxFiling(...args);
            if (sortie.nonRegACBAdd > 0) {
                observations.push({ delta: sortie.nonRegACBAdd, nonReg: ctx.nonReg, taux: ctx.baseNonRegRate });
            }
            return sortie;
        },
    };
});

const lance = (annees: number): Record<string, number> => {
    observations.length = 0;
    return __runScenarioForTests(
        params(annees), 'AUTO_MARGINAL' as AllocationStrategy, true, false, 0, 'BASE', {}, {},
    ) as unknown as Record<string, number>;
};

describe('[FISC-DIV-ACB-STEPUP] le dividende réinvesti majore le prix de base rajusté', () => {
    it('le pas d\'ACB est EXACTEMENT le dividende brut, sur le solde vu par ce décembre-là', () => {
        lance(10);
        expect(observations.length).toBeGreaterThanOrEqual(5); // anti-vacuité : décembre a bien tiré
        // ⚠️ L'assertion porte sur la RELATION, jamais sur une valeur de fixture supposée. Mon
        // premier jet ancrait « 500 000 × 5 % × 30 % = 7 500 $ » d'après les soldes de DÉPART :
        // mesuré, le premier décembre voit 178 587 $ de non-enregistré, l'allocation ayant déjà
        // déplacé de l'argent. La relation, elle, tient quelle que soit la fixture.
        for (const o of observations) {
            expect(o.delta).toBeCloseTo(computeAnnualNonRegDividends(o.nonReg, o.taux), 6);
        }
    });

    it('anti-vacuité : le pas et son assiette sont non nuls', () => {
        lance(10);
        // Sans ça, l'identité ci-dessus serait satisfaite par « 0 = f(0) » sur toute la série.
        expect(Number(observations[0]?.nonReg)).toBeGreaterThan(50_000);
        expect(Number(observations[0]?.delta)).toBeGreaterThan(1_000);
        // Et la part distribuée reste celle qu'on croit : 30 % du rendement.
        expect(computeAnnualNonRegDividends(100_000, 5)).toBeCloseTo(1_500, 6);
    });

    it('le gain COMPOSE : plus l\'horizon est long, plus le pas manqué aurait coûté', () => {
        // Discriminant : avant ce lot, ces trois patrimoines valaient 1 394 166 / 1 800 985 /
        // 1 944 014 — soit +1 911 $, +12 055 $ et +31 055 $ de moins. Les bornes ci-dessous sont
        // posées ENTRE les deux séries, donc elles rougissent si le pas d'ACB disparaît.
        expect(Number(lance(10).finalNetWorth)).toBeGreaterThan(1_395_000);
        expect(Number(lance(20).finalNetWorth)).toBeGreaterThan(1_806_000);
        expect(Number(lance(30).finalNetWorth)).toBeGreaterThan(1_960_000);
    });

    it('la SUCCESSION en profite davantage : elle liquide tout le gain latent', () => {
        // C'est elle qui approche le coût PLEIN de la double imposition — l'écart y est de
        // +30 975 $ à 30 ans, contre +31 055 $ sur le patrimoine, mais sur une base plus petite.
        expect(Number(lance(30).estateNetWorth)).toBeGreaterThan(1_700_000);
    });
});
