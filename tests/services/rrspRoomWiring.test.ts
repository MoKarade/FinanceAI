// tests/services/rrspRoomWiring.test.ts
//
// [FISC-RRSP-ROOM-PER-USER] Gardes de CÂBLAGE (revue #679 MOYEN-2/3 + ÉLEVÉ-1) : les tests
// unitaires de rrspRoomPerUser.test.ts prouvent le producteur (activeIncome) et le consommateur
// (taxJanuary) en isolation — RIEN ne prouvait le tuple réellement câblé dans projection.ts
// (`GARDE-AU-PRODUCTEUR-NE-PROUVE-PAS-LA-CHAINE`). Perturbations mesurées par la revue : le
// croisement d'index et l'inversion de l'attribution du congé parental laissaient la suite
// complète VERTE (4 545/4 545) en déplaçant jusqu'à 7 911 $ de REER.
//
// Espion (patron rqapPrestationCotisations) : on intercepte `processJanuaryReset` et on lit
// l'ARGUMENT réellement passé — jamais une reconstruction.

import { describe, it, expect, vi } from 'vitest';

const janCalls: Array<{ byUser: [number, number]; monthIndex: number; m: number }> = [];
vi.mock('../../services/projection/taxJanuary', async (importOriginal) => {
    const orig = await importOriginal<typeof import('../../services/projection/taxJanuary')>();
    return {
        ...orig,
        processJanuaryReset: (...args: Parameters<typeof orig.processJanuaryReset>) => {
            const [monthIndex, ctx] = args;
            // La fonction est appelée CHAQUE mois (elle rend null hors janvier) : on garde tout
            // et on filtre côté assertions sur le VRAI janvier (monthIndex === 0, m > 0).
            janCalls.push({ byUser: [...ctx.accGrossIncomeYearByUser] as [number, number], monthIndex, m: ctx.m });
            return orig.processJanuaryReset(...args);
        },
    };
});

import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, User } from '../../types';
import type { AllocationStrategy } from '../../services/projection/types';

const couple = (grossMarc: number, grossAnna: number): User[] => ([
    { name: 'Marc', grossSalary: grossMarc, netSalary: Math.round(grossMarc * 0.66), color: '#10b981', age: 32, birthYear: 1994, canadaArrivalYear: 1994, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
    { name: 'Anna', grossSalary: grossAnna, netSalary: Math.round(grossAnna * 0.66), color: '#3b82f6', age: 32, birthYear: 1994, canadaArrivalYear: 1994, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
] as unknown as User[]);

const params = (o: Record<string, unknown> = {}): SimulationParams => ({
    projection: {
        years: 3, returnRate: 4, inflationRate: 2, savingsMode: 'manual', manualContribution: 500,
        usePortfolioRate: false, returnRates: { celi: 4, reer: 4, nonReg: 4, crypto: 4, cash: 1 },
        emergencyFundMonths: 3, salaryGrowth: 0, propertyGrowthRate: 0,
    } as unknown as ProjectionConfig,
    calculatedStartingCash: 40_000,
    liveCSVBalances: { CELI: 20_000, CELIAPP: 0, REER: 50_000, NON_ENREG: 0, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: [], travelGoals: [], lifeEvents: [], childGoals: [],
    retirementGoal: { targetAge: 62, targetMonthlyIncome: 5_000, governmentPension: 2_000, lifeExpectancy: 92 } as unknown as RetirementGoal,
    config: { users: couple(16_667, 5_000), splitMode: '50/50' } as unknown as BudgetConfig,
    baseGrossAnnual: 260_004, baseNetAnnual: 171_600, currentRentExpense: 1_700,
    baseMonthlyExpenses: 5_200, startYear: 2026, startMonth: 0,
    ...o,
} as unknown as SimulationParams);

const run = (p: SimulationParams): void => {
    janCalls.length = 0;
    __runScenarioForTests(p, 'AUTO_MARGINAL' as AllocationStrategy);
};

describe('[FISC-RRSP-ROOM-PER-USER] le tuple CÂBLÉ dans projection.ts (espion, pas reconstruction)', () => {
    it('couple asymétrique 200 k/60 k : chaque index porte le brut de SA personne (pas de croisement)', () => {
        run(params());
        const jan = janCalls.find(c => c.monthIndex === 0 && c.m > 0);
        expect(jan, 'aucun janvier capturé').toBeTruthy();
        // 16 667 × 12 = 200 004 $/an et 5 000 × 12 = 60 000 $/an (salaryGrowth 0).
        // ⚠️ Ces deux ancres portaient `× 13 / 12` et l'expliquaient par « biais préexistant
        // documenté — [RRSP-FIRST-YEAR-13M] » : elles ÉPINGLAIENT le défaut. Le lot 113 l'a corrigé
        // (le revenu du mois est désormais versé APRÈS le reset de janvier, donc janvier n'entre
        // plus dans l'année qui vient de se clore) et ces assertions ont rougi — c'était leur
        // travail (`UN-INVENTAIRE-DE-DETTE-DOIT-SAVOIR-MOURIR`). Le premier janvier voit maintenant
        // 12 mois pleins. Ce que ce test DÉFEND — chaque index porte le brut de SA personne, sans
        // croisement — n'a pas bougé d'un iota ; seule l'ancre de valeur change.
        expect(jan!.byUser[0]).toBeCloseTo(200_004, 0);
        expect(jan!.byUser[1]).toBeCloseTo(60_000, 0);
        // Ancre négative contre le CROISEMENT (perturbation restée verte sur 4 545 tests) :
        expect(jan!.byUser[0]).toBeGreaterThan(jan!.byUser[1]);
    });

    it('congé parental : le retrait du salaire s\'impute à ANNA (index 1), Marc intact', () => {
        run(params({
            childGoals: [{ id: 'c1', name: 'Bébé', isActive: true, birthDate: '2026-03-01', initialCost: 2_000,
                monthlyDiapers: 80, monthlyFood: 200, monthlyClothing: 60, monthlyDaycare: 700,
                governmentBenefits: 0 }],
        }));
        const jan = janCalls.find(c => c.monthIndex === 0 && c.m > 0);
        expect(jan, 'aucun janvier capturé').toBeTruthy();
        // Marc n'est PAS en congé : son brut est identique au run sans bébé (12 mois du salaire —
        // re-basé au lot 113, cf. le commentaire du premier cas).
        expect(jan!.byUser[0]).toBeCloseTo(200_004, 0);
        // Anna est en congé ~10 des 13 mois (naissance 2026-03) : son slot doit être NETTEMENT
        // réduit — en dessous de 50 % de son brut plein. L'inversion de l'attribution (perturbée
        // par la revue : +7 911 $ de REER, suite verte) mettrait ce retrait chez Marc.
        expect(jan!.byUser[1]).toBeLessThan(60_000 * 13 / 12 * 0.5);
        expect(jan!.byUser[1]).toBeGreaterThanOrEqual(0);
    });

    it('[ÉLEVÉ-1] ménage SOLO en mode sandbox : les 45 % du split théorique ne sont PLUS droppés', () => {
        const soloUser = couple(0, 0).slice(0, 1);
        run(params({
            config: { users: soloUser, splitMode: '50/50' } as unknown as BudgetConfig,
            projection: {
                years: 3, returnRate: 4, inflationRate: 2, savingsMode: 'manual', manualContribution: 500,
                usePortfolioRate: false, returnRates: { celi: 4, reer: 4, nonReg: 4, crypto: 4, cash: 1 },
                emergencyFundMonths: 3, salaryGrowth: 0, propertyGrowthRate: 0,
                useTheoretical: true, theoreticalIncome: 9_000,
            } as unknown as ProjectionConfig,
        }));
        const jan = janCalls.find(c => c.monthIndex === 0 && c.m > 0);
        expect(jan, 'aucun janvier capturé').toBeTruthy();
        // computeIncomeBaseline splitte le théorique 55/45 MÊME en solo : sans le repli, la part
        // 45 % (brut ≈ 67 629 $/an) atterrissait à l'index 1 qu'aucun roomUsers ne lit — MESURÉ
        // −12 173 $/an de droits, −50 159 $ de NW à 12 ans. Le repli remet TOUT à l'index 0.
        expect(jan!.byUser[1]).toBeCloseTo(0, 6);
        // Le brut total solo (55 % ET 45 % réunis) dépasse largement le seul 55 % (86 022) : on
        // exige > 120 000 pour prouver que la part 45 % est bien LÀ. Le seuil est inchangé au
        // lot 113 — il était déjà largement au-dessus des deux valeurs, avec ou sans le 13e mois.
        expect(jan!.byUser[0]).toBeGreaterThan(120_000);
    });
});
