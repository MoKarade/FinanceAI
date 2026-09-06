// tests/services/savingsSensitivity.test.ts
//
// [BUDGET-SENSIBILITE-MOTEUR] « Si j'épargne 100 $/mois de plus, combien ça change à la fin ? »
// La tuile de Budget répondait par une formule locale (valeur future d'une rente à 5 % en dur) qui
// rendait **145 648 $ pour les sept personas** — supprimée au lot 89. La vraie réponse dépend du
// ménage (mesurée : 18 k$ à 307 k$, rapport 16,6×), et seul le MOTEUR peut la donner : depuis le
// lot 198, `calculateFutureProjection` publie `savingsSensitivity`, un second scénario BASE
// déterministe à dépenses − 100 $/mois. Coût mesuré : +2,5 à 4,1 % d'une projection de production.
//
// Ce que ce fichier prouve, dans l'ordre : (1) le champ est publié et FINI sur le chemin de
// production ; (2) il vaut ce qu'une seconde projection indépendante donnerait (la relation, pas un
// montant : un golden bougerait au premier barème) ; (3) le piège du mode « dépenses théoriques »
// (réduire `baseMonthlyExpenses` seul rendrait 0) ; (4) les chemins ciblés (`onlyStratTypes`) ne
// paient pas le run et rendent `null` — jamais un 0 crédible.

import { describe, it, expect } from 'vitest';
import { calculateFutureProjection, SAVINGS_SENSITIVITY_MONTHLY, type SimulationParams } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, User } from '../../types';

const users: User[] = ([
    { name: 'Marc', grossSalary: 6_500, netSalary: 4_600, color: '#10b981', age: 40, birthYear: 1986, canadaArrivalYear: 1986, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
] as unknown as User[]);

const params = (proj: Partial<ProjectionConfig> = {}, extra: Partial<SimulationParams> = {}): SimulationParams => ({
    projection: {
        years: 25, returnRate: 6, inflationRate: 2, savingsMode: 'budget', manualContribution: 0,
        usePortfolioRate: false, returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
        emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3, ...proj,
    } as ProjectionConfig,
    calculatedStartingCash: 20_000,
    liveCSVBalances: { CELI: 30_000, CELIAPP: 0, REER: 60_000, NON_ENREG: 10_000, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: { targetAge: 65, targetMonthlyIncome: 3_500, governmentPension: 1_400, lifeExpectancy: 90, dbPensionMonthly: 0 } as unknown as RetirementGoal,
    config: { users, splitMode: '50/50' } as unknown as BudgetConfig,
    baseGrossAnnual: 78_000, baseNetAnnual: 55_200, currentRentExpense: 1_400,
    baseMonthlyExpenses: 3_600, startYear: 2026, startMonth: 0,
    ...extra,
} as unknown as SimulationParams);

const estateOf = (p: SimulationParams): number => {
    const r = calculateFutureProjection(p, false, 0, ['BASE']);
    return r.allResults!.find((s) => s.stratType === 'BASE')!.estateNetWorth ?? NaN;
};

describe('[BUDGET-SENSIBILITE-MOTEUR] le moteur publie la sensibilité à +100 $/mois d\'épargne', () => {
    it('sur le chemin de production, le champ est publié, fini, et STRICTEMENT positif', () => {
        const r = calculateFutureProjection(params());
        const s = r.savingsSensitivity;
        expect(s, 'champ absent ou null sur le chemin de production').not.toBeNull();
        expect(s!.extraMonthlySavings).toBe(SAVINGS_SENSITIVITY_MONTHLY);
        expect(Number.isFinite(s!.deltaEstateNetWorth)).toBe(true);
        expect(Number.isFinite(s!.deltaFinalNetWorth)).toBe(true);
        // 100 $/mois pendant 25 ans, capitalisés : le delta dépasse de loin la mise (30 000 $ nominal).
        expect(s!.deltaEstateNetWorth).toBeGreaterThan(30_000);
        expect(s!.deltaFinalNetWorth).toBeGreaterThan(30_000);
    });

    /**
     * La RELATION, pas un montant : le delta publié est exactement ce qu'une seconde projection
     * indépendante (dépenses − 100) donnerait. Rougit si le second run n'utilise pas la même
     * stratégie / le même report de rentes que `resBase`, ou si l'écart est pris sur autre chose.
     */
    it('le delta publié == projection(dépenses − 100) − projection(dépenses)', () => {
        const base = params();
        const r = calculateFutureProjection(base);
        const attendu = estateOf(params({}, { baseMonthlyExpenses: 3_600 - SAVINGS_SENSITIVITY_MONTHLY })) - estateOf(base);
        expect(Math.abs(attendu), 'écart nul : la fixture ne mesure rien').toBeGreaterThan(1);
        expect(r.savingsSensitivity!.deltaEstateNetWorth).toBeCloseTo(attendu, 2);
    });

    /**
     * Le piège : en mode « dépenses théoriques », le moteur lit `theoreticalExpenses`, pas
     * `baseMonthlyExpenses`. Un second run qui ne réduirait que ce dernier rendrait un delta
     * NUL — crédible, faux. Mesuré avant d'écrire : la perturbation (ne réduire que
     * `baseMonthlyExpenses`) rend exactement 0 ici.
     */
    it('en mode « dépenses théoriques », la sensibilité reste non nulle (c\'est theoreticalExpenses qui est réduit)', () => {
        const r = calculateFutureProjection(params({ useTheoretical: true, theoreticalExpenses: 3_600 }));
        expect(r.savingsSensitivity).not.toBeNull();
        expect(r.savingsSensitivity!.deltaEstateNetWorth).toBeGreaterThan(30_000);
    });

    it('un appel CIBLÉ (`onlyStratTypes`, goal seek / stress-test) rend `null`, jamais un 0', () => {
        const r = calculateFutureProjection(params(), false, 0, ['BASE']);
        expect(r.savingsSensitivity).toBeNull();
    });
});
