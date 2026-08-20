// tests/services/rqapPrestationCotisations.test.ts
//
// [RQAP-PRESTATION-COTISATIONS] Une prestation RQAP est du revenu IMPOSABLE à assiette de
// cotisation NULLE (règle sourcée, décision Marc 2026-08-20, FISCAL_REFERENCE §2). Avant le fix,
// `childrenReee.ts` appelait `calculateFiscalReport` SANS le 7e argument : le défaut retombait sur
// `grossIncome` et la prestation payait RRQ + RQAP + AE — MESURÉ 4 328,50 $/an de cotisations
// fantômes sur une prestation au plafond.
//
// ⚠️ Test de CÂBLAGE par espion (pas une reconstruction) : on intercepte la fonction fiscale
// injectée et on vérifie l'ARGUMENT réellement passé — la leçon du proxy DB
// (`TEST-AU-CONTRAT-NE-VOIT-PAS-L-APPELANT`, un test qui reconstruit laisse passer tout).

import { describe, it, expect, vi } from 'vitest';

const appelsRqap: Array<{ gross: number; employmentIncome: unknown; nbArgs: number }> = [];
vi.mock('../../utils/tax', async (importOriginal) => {
    const orig = await importOriginal<typeof import('../../utils/tax')>();
    return {
        ...orig,
        calculateFiscalReport: (...args: Parameters<typeof orig.calculateFiscalReport>) => {
            // Ne capturer que les appels de la fenêtre RQAP (base = 55 % d'un salaire plafonné,
            // toujours < 60 k$) — les autres appels du moteur passent par la même fonction.
            appelsRqap.push({ gross: args[0], employmentIncome: args[6], nbArgs: args.length });
            return orig.calculateFiscalReport(...args);
        },
    };
});

import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import { calculateFiscalReport, RQAP_MAX_INCOME } from '../../utils/tax';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, User } from '../../types';
import type { AllocationStrategy } from '../../services/projection/types';

const users = (): User[] => ([
    { name: 'Marc', grossSalary: 8_200, netSalary: 5_620, color: '#10b981', age: 32, birthYear: 1994, canadaArrivalYear: 1994, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
    { name: 'Anna', grossSalary: 9_000, netSalary: 6_100, color: '#3b82f6', age: 32, birthYear: 1994, canadaArrivalYear: 1994, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
] as unknown as User[]);

const params = (): SimulationParams => ({
    projection: {
        years: 4, returnRate: 4, inflationRate: 2, savingsMode: 'manual', manualContribution: 500,
        usePortfolioRate: false, returnRates: { celi: 4, reer: 4, nonReg: 4, crypto: 4, cash: 1 },
        emergencyFundMonths: 3, salaryGrowth: 2, propertyGrowthRate: 0,
    } as unknown as ProjectionConfig,
    calculatedStartingCash: 40_000,
    liveCSVBalances: { CELI: 20_000, CELIAPP: 0, REER: 50_000, NON_ENREG: 0, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: [], travelGoals: [], lifeEvents: [],
    // Naissance au mois 6 → congé RQAP d'Anna les 12 mois suivants. ⚠️ `isActive: true` REQUIS —
    // décision Marc A5 : un enfant inactif ne compte pas tant qu'on ne l'active pas (c'est voulu).
    childGoals: [{ id: 'c1', name: 'Bébé', isActive: true, birthDate: '2026-07-01', initialCost: 2_000,
        monthlyDiapers: 80, monthlyFood: 200, monthlyClothing: 60, monthlyDaycare: 700,
        governmentBenefits: 0 }],
    retirementGoal: { targetAge: 62, targetMonthlyIncome: 5_000, governmentPension: 2_000, lifeExpectancy: 92 } as unknown as RetirementGoal,
    config: { users: users(), splitMode: '50/50' } as unknown as BudgetConfig,
    baseGrossAnnual: 206_400, baseNetAnnual: 140_640, currentRentExpense: 1_700,
    baseMonthlyExpenses: 5_200, startYear: 2026, startMonth: 0,
} as unknown as SimulationParams);

describe('[RQAP-PRESTATION-COTISATIONS] la prestation de congé parental ne cotise plus', () => {
    it('chaque appel fiscal de la fenêtre RQAP porte employmentIncome: 0 — vérifié par ESPION', () => {
        appelsRqap.length = 0;
        // ⚠️ COUPLAGE DE FIXTURE, rendu EXPLICITE (finding de revue) : la fenêtre en dollars plus
        // bas (base > 50 k$) n'est valide QUE parce qu'Anna gagne AU-DESSUS du plafond RQAP — sa
        // base plafonnée est alors toujours ≈ 103 k$. MESURÉ à 42 k$ de brut : la fenêtre RATE les
        // vrais appels RQAP (23 100 $) ET attrape le calcul salarial de décembre à la place. Cette
        // assertion casse EN PREMIER, avec le bon message, si quelqu'un abaisse le salaire.
        expect((users()[1].grossSalary ?? 0) * 12, 'fixture invalide : Anna doit gagner > plafond RQAP')
            .toBeGreaterThan(RQAP_MAX_INCOME);
        __runScenarioForTests(params(), 'AUTO_MARGINAL' as AllocationStrategy, false, false);
        // La fenêtre RQAP : base = 55 % d'un salaire ≤ plafond (~108 k × 0,55 ≈ 59 k) — on identifie
        // les appels dont le gross est EXACTEMENT 0,55 × min(salaire indexé, plafond projeté).
        const candidats = appelsRqap.filter(a => { const b = a.gross / 0.55; return b > 50_000 && b <= RQAP_MAX_INCOME * 1.2; });
        expect(candidats.length, 'fenêtre vide : le congé RQAP n\u2019a pas produit ses appels dans la plage attendue')
            .toBeGreaterThanOrEqual(12);
        // TOUS les appels de la fenêtre doivent porter l'assiette d'emploi NULLE (le `toBe(0)`
        // couvre aussi « l'argument est explicitement passé » : undefined échouerait).
        for (const a of candidats) {
            expect(a.employmentIncome, `appel RQAP à ${a.gross.toFixed(0)} $ sans employmentIncome: 0`).toBe(0);
        }
    });

    it('le NET de la prestation vaut celui d\'une assiette nulle — 4 328,50 $/an d\'écart au plafond', () => {
        // Ancrage direct de la règle, indépendant du moteur : la différence avec/sans assiette
        // d'emploi sur la prestation au plafond EST le montant des cotisations fantômes.
        const prestation = 103_000 * 0.55;
        const avecCotisations = calculateFiscalReport(prestation, 0, 0, 2026, false).netIncome;
        const assietteNulle = calculateFiscalReport(prestation, 0, 0, 2026, false, undefined, 0).netIncome;
        expect(assietteNulle - avecCotisations).toBeCloseTo(4_328.50, 1);
    });
});
