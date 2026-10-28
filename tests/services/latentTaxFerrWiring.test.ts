// tests/services/latentTaxFerrWiring.test.ts
//
// [FISC-LATENT-PENSION-CREDIT] (lot 200) — câblage de la moitié FERR de l'assiette du crédit pour
// revenu de retraite dans l'impôt latent. On OBSERVE l'argument que le moteur remet à
// `computeLatentTax` (espion sur le vrai module), jamais on ne le reconstruit
// (`UN-TROU-ENTRE-DEUX-MOITIES-TESTEES-N-APPARTIENT-A-PERSONNE`).
//
// Ce que le câblage doit prouver, et qui n'est pas une valeur : (1) ZÉRO tant qu'aucun déclarant
// n'a l'âge FERR ; (2) strictement POSITIF dès le janvier des 72 ans ; (3) CONSTANT à l'intérieur
// d'une année — c'est la propriété qui autorisait enfin le câblage (un cumul année-à-date aurait
// rendu l'impôt latent dépendant du mois de lancement) ; (4) RÉ-ÉVALUÉ au janvier suivant.

import { describe, it, expect, vi } from 'vitest';
import type { LatentTaxCtx } from '../../services/projection/latentTax';

vi.mock('../../services/projection/latentTax', async (importOriginal) => {
    const mod = await importOriginal<typeof import('../../services/projection/latentTax')>();
    return { ...mod, computeLatentTax: vi.fn(mod.computeLatentTax) };
});

import { computeLatentTax } from '../../services/projection/latentTax';
import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, User } from '../../types';
import type { AllocationStrategy } from '../../services/projection/types';

const spy = vi.mocked(computeLatentTax);

/** Retraité SEUL de 70 ans, REER 300 k$, AUCUNE rente DB : la moitié FERR est la seule assiette. */
const params = (age: number): SimulationParams => ({
    projection: {
        years: 6, returnRate: 5, inflationRate: 2, savingsMode: 'manual', manualContribution: 0,
        usePortfolioRate: false, returnRates: { celi: 5, reer: 5, nonReg: 5, crypto: 6, cash: 1 },
        emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3,
    } as ProjectionConfig,
    calculatedStartingCash: 30_000,
    liveCSVBalances: { CELI: 50_000, CELIAPP: 0, REER: 300_000, NON_ENREG: 80_000, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: { targetAge: 65, targetMonthlyIncome: 3_500, governmentPension: 1_400, lifeExpectancy: 92, dbPensionMonthly: 0 } as unknown as RetirementGoal,
    config: {
        users: [{ name: 'Gilles', grossSalary: 0, netSalary: 0, color: '#10b981', age, birthYear: 2026 - age, canadaArrivalYear: 2026 - age, hasOwnedPropertyLast4Years: true, celiContributed: 0, rrspContributed: 0 }] as unknown as User[],
        splitMode: '50/50',
    } as unknown as BudgetConfig,
    baseGrossAnnual: 0, baseNetAnnual: 0, currentRentExpense: 0,
    baseMonthlyExpenses: 3_000, startYear: 2026, startMonth: 0,
} as unknown as SimulationParams);

/** Le 1er argument de CHAQUE appel, dans l'ordre des mois (un appel par point complet). */
const relever = (age: number): LatentTaxCtx[] => {
    spy.mockClear();
    __runScenarioForTests(params(age), 'AUTO_MARGINAL' as AllocationStrategy, false, false, 0, 'BASE', {}, { verboseMonthlyPoints: true });
    return spy.mock.calls.map((c) => c[0] as LatentTaxCtx);
};
const ferr0 = (ctx: LatentTaxCtx): number => Number(ctx.ferrAnnualPerUser?.[0] ?? 0);

describe('[FISC-LATENT-PENSION-CREDIT] la moitié FERR atteint l\'impôt latent, annualisée', () => {
    it('à 70 ans : zéro pendant les deux premières années, positif dès le janvier des 72 ans', () => {
        const ctxs = relever(70);
        expect(ctxs.length, 'aucun appel observé : le point est allégé ou l\'espion n\'est pas câblé').toBeGreaterThan(60);
        // m = 0..23 : 70 et 71 ans — aucun retrait obligatoire.
        for (let m = 0; m < 24; m++) expect(ferr0(ctxs[m]), `mois ${m}`).toBe(0);
        // m = 24 : janvier des 72 ans — le retrait obligatoire de l'année est connu.
        expect(ferr0(ctxs[24])).toBeGreaterThan(5_000); // 300 k$ × 5,40 % ≈ 16 k$ avant croissance
    });

    it('CONSTANT à l\'intérieur d\'une année (ce n\'est PAS un cumul année-à-date), ré-évalué en janvier', () => {
        const ctxs = relever(70);
        const annee72 = ctxs.slice(24, 36).map(ferr0);
        expect(new Set(annee72).size, `valeurs vues sur l'année des 72 ans : ${[...new Set(annee72)].join(', ')}`).toBe(1);
        const annee73 = ctxs.slice(36, 48).map(ferr0);
        expect(new Set(annee73).size).toBe(1);
        expect(annee73[0], 'le janvier suivant doit ré-évaluer le retrait (solde et facteur changent)').not.toBe(annee72[0]);
    });

    it('déjà 74 ans au départ : positif dès le premier janvier traversé, zéro avant', () => {
        const ctxs = relever(74);
        // m = 0 est un janvier (startMonth 0) : `taxJanuary` s'exécute dès m = 0 ? Non — les
        // déclencheurs annuels exigent m > 0, donc la première évaluation tombe à m = 12.
        expect(ferr0(ctxs[12])).toBeGreaterThan(5_000);
    });

    it('CONTRÔLE NÉGATIF — sans REER, la moitié FERR reste à zéro à tout âge', () => {
        spy.mockClear();
        const p = params(74);
        (p as unknown as { liveCSVBalances: { REER: number } }).liveCSVBalances.REER = 0;
        __runScenarioForTests(p, 'AUTO_MARGINAL' as AllocationStrategy, false, false, 0, 'BASE', {}, { verboseMonthlyPoints: true });
        const ctxs = spy.mock.calls.map((c) => c[0] as LatentTaxCtx);
        expect(ctxs.length).toBeGreaterThan(60);
        for (const c of ctxs) expect(ferr0(c)).toBe(0);
    });
});
