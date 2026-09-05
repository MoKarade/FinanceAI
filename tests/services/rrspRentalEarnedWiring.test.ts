// tests/services/rrspRentalEarnedWiring.test.ts
//
// [FISC-RRSP-RENTAL-EARNED] Garde de CHAÎNE : le loyer net d'un immeuble alimente le registre
// per-conjoint des droits REER (`accGrossIncomeYearByUser`), chez SON propriétaire, et c'est bien
// ce que reçoit `processJanuaryReset` — lu par ESPION sur l'argument réel, jamais reconstruit
// (patron de `rrspRoomWiring.test.ts`, leçon « le test écrit pour fermer un trou peut re-commettre
// le trou »). Deux producteurs, deux positions par rapport au reset de janvier : le NOI W5 (avant
// le bloc de janvier, donc via le tampon) et le loyer des buts immobiliers (après, versé direct).
//
// Fixture : couple 200 004 $ / 60 000 $ (salaryGrowth 0, inflation 0 → chaque attendu est EXACT,
// aucune indexation à absorber). Le cas SANS immeuble est le contrôle : il prouve que chaque delta
// vient du loyer et de rien d'autre (`UN-INVARIANT-QUI-NE-TROUVE-RIEN-DOIT-PROUVER-QU-IL-POURRAIT`).

import { describe, it, expect, vi } from 'vitest';

const janCalls: Array<{ byUser: [number, number]; monthIndex: number; m: number }> = [];
vi.mock('../../services/projection/taxJanuary', async (importOriginal) => {
    const orig = await importOriginal<typeof import('../../services/projection/taxJanuary')>();
    return {
        ...orig,
        processJanuaryReset: (...args: Parameters<typeof orig.processJanuaryReset>) => {
            const [monthIndex, ctx] = args;
            janCalls.push({ byUser: [...ctx.accGrossIncomeYearByUser] as [number, number], monthIndex, m: ctx.m });
            return orig.processJanuaryReset(...args);
        },
    };
});

import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, User, RentalProperty, RealEstateGoal } from '../../types';
import type { AllocationStrategy } from '../../services/projection/types';

const marc = { name: 'Marc', grossSalary: 16_667, netSalary: 11_000, color: '#10b981', age: 32, birthYear: 1994, canadaArrivalYear: 1994, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 };
const anna = { name: 'Anna', grossSalary: 5_000, netSalary: 3_300, color: '#3b82f6', age: 32, birthYear: 1994, canadaArrivalYear: 1994, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 };

const params = (o: Record<string, unknown> = {}): SimulationParams => ({
    projection: {
        years: 3, returnRate: 4, inflationRate: 0, savingsMode: 'manual', manualContribution: 500,
        usePortfolioRate: false, returnRates: { celi: 4, reer: 4, nonReg: 4, crypto: 4, cash: 1 },
        emergencyFundMonths: 3, salaryGrowth: 0, propertyGrowthRate: 0,
    } as unknown as ProjectionConfig,
    calculatedStartingCash: 40_000,
    liveCSVBalances: { CELI: 20_000, CELIAPP: 0, REER: 50_000, NON_ENREG: 0, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: [], travelGoals: [], lifeEvents: [], childGoals: [],
    retirementGoal: { targetAge: 62, targetMonthlyIncome: 5_000, governmentPension: 2_000, lifeExpectancy: 92 } as unknown as RetirementGoal,
    config: { users: [marc, anna] as unknown as [User, User], splitMode: '50/50' } as unknown as BudgetConfig,
    baseGrossAnnual: 260_004, baseNetAnnual: 171_600, currentRentExpense: 1_700,
    baseMonthlyExpenses: 5_200, startYear: 2026, startMonth: 0,
    ...o,
} as unknown as SimulationParams);

/** Immeuble W5 : loyer 2 500, vacance 5 %, charges 500 → NOI 28 500 − 6 000 = 22 500 $/an.
 *  ⚠️ Le loyer BRUT (28 500) et le NOI (22 500) diffèrent : l'attendu ci-dessous discrimine « base =
 *  ce que le moteur impose » (le NOI) d'un câblage sur le loyer brut. */
const plex = (over: Partial<RentalProperty> = {}): RentalProperty => ({
    id: 'rp1', name: 'Plex', purchasePrice: 400_000, currentValue: 450_000, mortgageBalance: 300_000,
    mortgageRate: 5, monthlyRent: 2_500, vacancyPct: 5, monthlyExpenses: 500, ...over,
});
const NOI_PLEX = 22_500;

/** But immobilier LOCATIF déjà détenu (achat passé) : 1 500 $/mois → 18 000 $/an à inflation 0. */
const condoLoue = (over: Partial<RealEstateGoal> = {}): RealEstateGoal => ({
    id: 'g1', name: 'Condo loué', isActive: true, isOwned: true, purchaseDate: '2020-01-01',
    price: 350_000, downPayment: 70_000, mortgageRate: 4.5, amortization: 25, totalClosingCosts: 5_000,
    monthlyPayment: 1_550, unrecoverableMonthly: 400, isPrimaryResidence: false, isRented: true,
    rentalIncomeMonthly: 1_500, propertyGrowthRate: 0, ...over,
} as unknown as RealEstateGoal);
const LOYER_CONDO = 18_000;

const premierJanvier = (p: SimulationParams): [number, number] => {
    janCalls.length = 0;
    __runScenarioForTests(p, 'AUTO_MARGINAL' as AllocationStrategy);
    const jan = janCalls.find(c => c.monthIndex === 0 && c.m > 0);
    expect(jan, 'aucun janvier capturé').toBeTruthy();
    return jan!.byUser;
};

describe('[FISC-RRSP-RENTAL-EARNED] le loyer net entre dans le revenu gagné de SON propriétaire (espion)', () => {
    it('contrôle : sans immeuble, le premier janvier voit exactement les deux salaires', () => {
        const [u0, u1] = premierJanvier(params());
        expect(u0).toBeCloseTo(200_004, 0);
        expect(u1).toBeCloseTo(60_000, 0);
    });

    it('immeuble W5 détenu par user2 : +NOI (pas le loyer brut) chez Anna, Marc intact', () => {
        const [u0, u1] = premierJanvier(params({ rentalProperties: [plex({ owner: 'user2' })] }));
        expect(u1).toBeCloseTo(60_000 + NOI_PLEX, 0);
        expect(u0).toBeCloseTo(200_004, 0);
        // Discrimine la BASE : un câblage sur le loyer brut donnerait 88 500, pas 82 500.
        expect(u1).not.toBeCloseTo(60_000 + 2_500 * 12 * 0.95, 0);
    });

    it('immeuble W5 détenu par user1 : tout chez Marc, Anna intacte', () => {
        const [u0, u1] = premierJanvier(params({ rentalProperties: [plex({ owner: 'user1' })] }));
        expect(u0).toBeCloseTo(200_004 + NOI_PLEX, 0);
        expect(u1).toBeCloseTo(60_000, 0);
    });

    it('immeuble W5 SANS propriétaire : 50/50 (défaut Marc), la somme des deux deltas vaut le NOI', () => {
        const [u0, u1] = premierJanvier(params({ rentalProperties: [plex()] }));
        expect(u0).toBeCloseTo(200_004 + NOI_PLEX / 2, 0);
        expect(u1).toBeCloseTo(60_000 + NOI_PLEX / 2, 0);
    });

    it('perte locative (charges > loyer) : le revenu gagné du propriétaire BAISSE (T4040 : pertes déduites)', () => {
        // loyer 1 000 × 12 × 0,95 = 11 400 ; charges 1 500 × 12 = 18 000 → NOI −6 600.
        const [u0, u1] = premierJanvier(params({ rentalProperties: [plex({ owner: 'user2', monthlyRent: 1_000, monthlyExpenses: 1_500 })] }));
        expect(u1).toBeCloseTo(60_000 - 6_600, 0);
        expect(u0).toBeCloseTo(200_004, 0);
    });

    it('but immobilier locatif détenu (achat passé) par user1 : +12 loyers chez Marc, versés APRÈS le reset', () => {
        const [u0, u1] = premierJanvier(params({ realEstateGoals: [condoLoue({ owner: 'user1' })] }));
        expect(u0).toBeCloseTo(200_004 + LOYER_CONDO, 0);
        expect(u1).toBeCloseTo(60_000, 0);
    });

    it('but immobilier locatif sans propriétaire : 50/50', () => {
        const [u0, u1] = premierJanvier(params({ realEstateGoals: [condoLoue()] }));
        expect(u0).toBeCloseTo(200_004 + LOYER_CONDO / 2, 0);
        expect(u1).toBeCloseTo(60_000 + LOYER_CONDO / 2, 0);
    });

    it('résidence PRINCIPALE avec un loyer saisi : le moteur ne produit pas ce loyer → aucun droit', () => {
        const [u0, u1] = premierJanvier(params({ realEstateGoals: [condoLoue({ isPrimaryResidence: true, owner: 'user1' })] }));
        expect(u0).toBeCloseTo(200_004, 0);
        expect(u1).toBeCloseTo(60_000, 0);
    });

    it('ménage SOLO : un immeuble dit « user2 » revient quand même au seul déclarant (index 0)', () => {
        const [u0, u1] = premierJanvier(params({
            config: { users: [marc] as unknown as [User, User], splitMode: '50/50' } as unknown as BudgetConfig,
            baseGrossAnnual: 200_004, baseNetAnnual: 132_000,
            rentalProperties: [plex({ owner: 'user2' })],
        }));
        expect(u0).toBeCloseTo(200_004 + NOI_PLEX, 0);
        expect(u1).toBeCloseTo(0, 0);
    });
});
