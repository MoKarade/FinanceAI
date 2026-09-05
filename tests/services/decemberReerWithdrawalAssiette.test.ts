// tests/services/decemberReerWithdrawalAssiette.test.ts
//
// [FISC-DEC-FLUX-ASSIETTE-TIMING] (lot 179, décision Marc 2026-09-05 — réponse 15 : CORRIGER)
// Garde COMPORTEMENTALE du dépôt fiscal de décembre : un retrait REER fait en DÉCEMBRE est imposé
// dans l'année comme s'il avait été fait en NOVEMBRE. Avant ce lot, `processDecemberTaxFiling`
// lisait `accRetraitsReerYear` AVANT que la cascade d'allocation, le meltdown, l'immobilier et les
// objectifs du même décembre ne l'alimentent, puis janvier remettait l'accumulateur à zéro : le
// retrait de décembre n'entrait dans l'assiette d'AUCUNE année. La garde d'ORDRE
// (`projection.engineOrder.test.ts`) fige la position du bloc ; celle-ci vérifie le FAIT que l'ordre
// protège, sur une grandeur PUBLIÉE (`totalTaxesPaid`), sans reconstruire aucun calcul.
//
// Forme « pente » plutôt que golden : la tolérance est un RATIO entre deux runs du même moteur, qui
// survit à l'indexation des barèmes — un montant épinglé se ferait re-baser à la première.
//
// Perturbation prouvée (2026-09-05) en rejouant ce fichier sur le moteur d'AVANT le lot (copie
// `HEAD~1:services/projection.ts`) : l'assertion « décembre ≈ novembre » rougit (le retrait de
// décembre y coûte 136 $ d'impôt au lieu de 28 019 $), les deux contrôles restent verts.

import { describe, it, expect } from 'vitest';
import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, FinancialGoal } from '../../types';
import type { AllocationStrategy } from '../../services/projection/types';

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

const projection: ProjectionConfig = {
    years: 5, returnRate: 4, inflationRate: 2, savingsMode: 'manual', manualContribution: 0,
    usePortfolioRate: false, returnRates: { celi: 4, reer: 4, nonReg: 4, crypto: 5, cash: 1 },
    emergencyFundMonths: 6, salaryGrowth: 0, propertyGrowthRate: 3,
};

// Retraité SEUL, 62 ans, sans salaire : le seul revenu imposable est ce qu'il tire du REER.
// `config.users` est typé tuple `[User, User]` ; un solo réel = 1 user → même cast documenté que
// `retireeSolo` de projection.item2c.golden.test.ts (le moteur lit `users[1]?.…` partout).
const config: BudgetConfig = {
    users: [
        { name: 'A', grossSalary: 0, netSalary: 0, color: '#10b981', age: 62, birthYear: 1964, canadaArrivalYear: 1964, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
    ] as unknown as BudgetConfig['users'],
    splitMode: '50/50',
};

const GOAL = 60_000;
const goalReer = (deadline: string): FinancialGoal => ({
    id: 'fg_reer_' + deadline, name: 'Retrait REER planifié', type: 'other' as FinancialGoal['type'],
    targetAmount: GOAL, deadline, status: 'active', targetAccount: 'REER',
});

const params = (financialGoals: FinancialGoal[]) => ({
    projection,
    calculatedStartingCash: 40_000,
    liveCSVBalances: { CELI: 0, CELIAPP: 0, REER: 700_000, NON_ENREG: 0, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: { targetAge: 60, targetMonthlyIncome: 3_500, governmentPension: 0, lifeExpectancy: 95 } as RetirementGoal,
    config,
    baseGrossAnnual: 0, baseNetAnnual: 0, currentRentExpense: 0,
    baseMonthlyExpenses: 3_000,
    startYear: 2026, startMonth: 0,
    financialGoals,
} as SimulationParams);

const run = (financialGoals: FinancialGoal[]) =>
    __runScenarioForTests(params(financialGoals), 'AUTO_MARGINAL' as AllocationStrategy, false, false);

describe('[FISC-DEC-FLUX-ASSIETTE-TIMING] un retrait REER de décembre est imposé dans l\'année, comme en novembre', () => {
    const sans = run([]);
    const nov = run([goalReer('2027-11-15')]);
    const dec = run([goalReer('2027-12-15')]);

    // Non-vacuité : le but a VRAIMENT tiré du REER le mois de sa deadline (générer un flux ≠ l'exercer).
    const retraitAu = (r: typeof sans, monthIndex: number) => num(r.chartData.find(p => p.monthIndex === monthIndex)?.RetraitREER);
    const NOV_2027 = 12 + 10;
    const DEC_2027 = 12 + 11;

    it('les deux buts tirent bien 60 000 $ du REER le mois visé (contrôle de fixture)', () => {
        expect(retraitAu(nov, NOV_2027)).toBeGreaterThanOrEqual(GOAL);
        expect(retraitAu(dec, DEC_2027)).toBeGreaterThanOrEqual(GOAL);
        expect(retraitAu(sans, DEC_2027)).toBeLessThan(GOAL / 2);
    });

    it('un retrait de NOVEMBRE coûte de l\'impôt (contrôle : l\'assiette voit les retraits en cours d\'année)', () => {
        // 60 000 $ de plus dans l'assiette d'un déclarant seul → plusieurs milliers de dollars d'impôt.
        // Plancher LARGE (10 % du retrait) : la garde ne pinne pas un barème, elle exige que l'impôt coule.
        expect(nov.totalTaxesPaid - sans.totalTaxesPaid).toBeGreaterThan(GOAL * 0.10);
    });

    it('le retrait de DÉCEMBRE coûte le MÊME impôt que celui de novembre (à ±25 % de son coût)', () => {
        // MESURÉ le 2026-09-05 AVANT d'écrire la bande (un seuil écrit avant sa mesure est un chiffre
        // inventé) : coût novembre 25 951 $, coût décembre 28 019 $ → ratio **1,080** sur le moteur du
        // lot ; **0,0055** (136 $) sur le moteur d'avant, où le retrait de décembre n'entrait dans
        // l'assiette d'AUCUNE année. La bande ±25 % sépare les deux d'un ordre de grandeur.
        // [Probable] Le +8 % de décembre n'est pas un défaut : le retrait de novembre laisse 60 000 $
        // de liquide qui ÉVITE le retrait de subsistance de décembre (≈ 3 650 $, cf. `rSans`), donc
        // ce mois d'assiette glisse hors de l'année ; en décembre il n'y a plus rien à éviter.
        const coutNov = nov.totalTaxesPaid - sans.totalTaxesPaid;
        const coutDec = dec.totalTaxesPaid - sans.totalTaxesPaid;
        expect(coutDec).toBeGreaterThan(coutNov * 0.75);
        expect(coutDec).toBeLessThan(coutNov * 1.25);
    });
});
