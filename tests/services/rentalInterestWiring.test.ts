// tests/services/rentalInterestWiring.test.ts
//
// [W5-RENTAL-INTERET-DPA] Garde de CÂBLAGE : l'intérêt hypothécaire du mois que `services/projection.ts`
// passe aux effets W5 (`rentalInterestMensuelParImmeuble`) est EXACTEMENT celui que `processRentalMonth`
// publie pour le même mois (`ImmoInterest` du point). Les deux lisent la même source unique
// (`rentalInterestOfMonth`) sur le même solde de début de mois — si l'ordre de la boucle changeait
// (mois locatif AVANT les effets W5), l'égalité casserait d'un mois d'amortissement.
//
// L'argument est OBSERVÉ par espion sur `applyW5Effects`, jamais reconstruit
// (`TEST-AU-CONTRAT-NE-VOIT-PAS-L-APPELANT`). Perturbations mesurées séparément :
//   · argument retiré au site d'appel → « câblage » rougit (table vide contre intérêts publiés > 0) ;
//   · `w5Effects.test.ts` couvre la moitié module (contexte ignoré → 7 rouges).

import { describe, it, expect, vi } from 'vitest';

const ctxCaptures: Array<Readonly<Record<string, number>> | undefined> = [];
vi.mock('../../services/projection/w5Effects', async (importOriginal) => {
    const orig = await importOriginal<typeof import('../../services/projection/w5Effects')>();
    return {
        ...orig,
        applyW5Effects: (...args: Parameters<typeof orig.applyW5Effects>) => {
            ctxCaptures.push(args[0].rentalInterestMensuelParImmeuble);
            return orig.applyW5Effects(...args);
        },
    };
});

import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, User, RentalProperty } from '../../types';
import type { AllocationStrategy } from '../../services/projection/types';

const marc = { name: 'Marc', grossSalary: 16_667, netSalary: 11_000, color: '#10b981', age: 32, birthYear: 1994, canadaArrivalYear: 1994, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 };
const anna = { name: 'Anna', grossSalary: 5_000, netSalary: 3_300, color: '#3b82f6', age: 32, birthYear: 1994, canadaArrivalYear: 1994, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 };

const plex = (over: Partial<RentalProperty> = {}): RentalProperty => ({
    id: 'rp1', name: 'Plex', purchasePrice: 400_000, currentValue: 450_000, mortgageBalance: 300_000,
    mortgageRate: 5, monthlyRent: 2_500, vacancyPct: 5, monthlyExpenses: 500, amortizationYears: 25, ...over,
});

const params = (rentals: RentalProperty[]): SimulationParams => ({
    projection: {
        years: 4, returnRate: 4, inflationRate: 2, savingsMode: 'manual', manualContribution: 500,
        usePortfolioRate: false, returnRates: { celi: 4, reer: 4, nonReg: 4, crypto: 4, cash: 1 },
        emergencyFundMonths: 3, salaryGrowth: 2, propertyGrowthRate: 3,
    } as unknown as ProjectionConfig,
    calculatedStartingCash: 40_000,
    liveCSVBalances: { CELI: 20_000, CELIAPP: 0, REER: 50_000, NON_ENREG: 0, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: [], travelGoals: [], lifeEvents: [], childGoals: [],
    retirementGoal: { targetAge: 62, targetMonthlyIncome: 5_000, governmentPension: 2_000, lifeExpectancy: 92 } as unknown as RetirementGoal,
    config: { users: [marc, anna] as unknown as [User, User], splitMode: '50/50' } as unknown as BudgetConfig,
    baseGrossAnnual: 260_004, baseNetAnnual: 171_600, currentRentExpense: 1_700,
    baseMonthlyExpenses: 5_200, startYear: 2026, startMonth: 0, rentalProperties: rentals,
} as unknown as SimulationParams);

type Point = { ImmoInterest?: number };
const lance = (rentals: RentalProperty[]): { passes: number[]; publies: number[] } => {
    ctxCaptures.length = 0;
    const r = __runScenarioForTests(params(rentals), 'AUTO_MARGINAL' as AllocationStrategy, false, false) as unknown as { chartData: Point[] };
    expect(ctxCaptures.length, 'applyW5Effects non appelé → rien mesuré').toBeGreaterThan(0);
    const passes = ctxCaptures.map(t => Object.values(t ?? {}).reduce((s, v) => s + v, 0));
    const publies = r.chartData.map(p => p.ImmoInterest ?? 0);
    return { passes, publies };
};

describe('[W5-RENTAL-INTERET-DPA] l’intérêt passé aux effets W5 est celui que le mois locatif PUBLIE', () => {
    it('mois par mois, la somme de la table passée == `ImmoInterest` du point (au cent, arrondi de publication)', () => {
        const { passes, publies } = lance([plex()]);
        expect(publies.length, 'chartData vide').toBeGreaterThan(12);
        expect(passes.length).toBe(publies.length);
        // Anti-vacuité : la fixture produit bien des intérêts (≈ 1 250 $ le premier mois).
        expect(publies[0]).toBeGreaterThan(1_000);
        for (let i = 0; i < publies.length; i++) {
            expect(passes[i], `mois ${i}`).toBeCloseTo(publies[i], 2);
        }
        // Et ils DÉCROISSENT avec l'amortissement : la table suit le solde, pas une constante d'origine.
        expect(passes[publies.length - 1]).toBeLessThan(passes[0]);
    });

    it('deux immeubles : la table porte une clé PAR immeuble et la somme reste celle du point', () => {
        ctxCaptures.length = 0;
        const { passes, publies } = lance([plex(), plex({ id: 'rp2', mortgageBalance: 100_000, mortgageRate: 3 })]);
        expect(Object.keys(ctxCaptures[0] ?? {}).sort()).toEqual(['rp1', 'rp2']);
        expect((ctxCaptures[0] ?? {}).rp2).toBeCloseTo(100_000 * 0.03 / 12, 6);
        expect(passes[0]).toBeCloseTo(publies[0], 2);
    });

    it('contrôle : sans immeuble, la table est VIDE et aucun intérêt n’est publié', () => {
        const { passes, publies } = lance([]);
        expect(passes.every(v => v === 0)).toBe(true);
        expect(publies.every(v => v === 0)).toBe(true);
        expect(ctxCaptures[0]).toEqual({});
    });
});
