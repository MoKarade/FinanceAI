import { describe, it, expect } from 'vitest';
import { calculateFutureProjection, type SimulationParams } from '../../services/projection';
import {
    initRentalStates, processRentalMonth, rentalMonthlyPayment,
    DEFAULT_RENTAL_AMORTIZATION_YEARS,
} from '../../services/projection/rentalMonth';
import type { ProjectionResult, ProjectionChartPoint } from '../../services/projection/types';
import type { BudgetConfig, User, RentalProperty } from '../../types';

/**
 * [ENG-W5-RENTAL-OFFBALANCE] + [ENG-W5-BUSINESS-OFFBALANCE] — vague 1d, 2026-08-19.
 *
 * Deux conteneurs W5 existaient dans le modèle et **pas au bilan** :
 *   • un immeuble locatif ne montrait que son NOI — ni valeur, ni hypothèque, ni service de dette ;
 *   • une entreprise privée ne montrait que son dividende — pas sa valeur.
 *
 * ⚠️ L'invariant de conservation restait VERT dans les deux cas, et c'est le cœur de la leçon : tout
 * était ABSENT du `chartData`, donc il n'y avait rien à réconcilier. **Un actif qu'on n'écrit nulle
 * part ne casse aucun bilan — il ment simplement.** Un invariant de cohérence ne peut pas détecter
 * une omission ; il faut une assertion de PRÉSENCE.
 */

const mkUser = (): User => ({
    name: 'Marc', grossSalary: 8200, netSalary: 5620, color: '#10b981',
    age: 45, birthYear: 1981, canadaArrivalYear: 1981, hasOwnedPropertyLast4Years: false,
} as unknown as User);

const IMMEUBLE: RentalProperty = {
    id: 'r1', name: 'Duplex', purchasePrice: 700_000, currentValue: 800_000,
    mortgageBalance: 500_000, mortgageRate: 5, monthlyRent: 3_800, vacancyPct: 5,
    monthlyExpenses: 900, amortizationYears: 25,
};

const ENTREPRISE = { id: 'b1', name: 'Ma CCPC', ownershipPct: 100, estimatedValue: 2_000_000, retainedEarnings: 400_000 };

const params = (over: Record<string, unknown> = {}): SimulationParams => ({
    projection: {
        years: 25, returnRate: 6, inflationRate: 2, savingsMode: 'manual', manualContribution: 0,
        usePortfolioRate: false, returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
        emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3,
    },
    calculatedStartingCash: 100_000,
    liveCSVBalances: { CELI: 50_000, CELIAPP: 0, REER: 80_000, NON_ENREG: 30_000, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    rentalProperties: [], privateBusinesses: [],
    retirementGoal: { targetAge: 65, targetMonthlyIncome: 4_000, governmentPension: 1_500, lifeExpectancy: 92 } as unknown as SimulationParams['retirementGoal'],
    config: { users: [mkUser()] as unknown as BudgetConfig['users'], splitMode: '50/50' },
    baseGrossAnnual: 98_400, baseNetAnnual: 67_440, currentRentExpense: 1_500,
    baseMonthlyExpenses: 3_000, startYear: 2026, startMonth: 0,
    ...over,
} as SimulationParams);

const pts = (over: Record<string, unknown> = {}): Record<string, number>[] => {
    const r = calculateFutureProjection(params(over));
    const base = (r.allResults as ProjectionResult[]).find((x) => x.stratType === 'BASE')!;
    return (base.chartData as ProjectionChartPoint[]) as unknown as Record<string, number>[];
};

describe('[ENG-W5-RENTAL-OFFBALANCE] l’immeuble locatif entre au bilan — les TROIS volets', () => {
    it('valeur, hypothèque ET service de dette apparaissent ensemble', () => {
        const avec = pts({ rentalProperties: [IMMEUBLE] });
        const sans = pts({});

        // Non-vacuité : les deux séries existent et le scénario SANS immeuble est bien à zéro.
        expect(avec.length).toBeGreaterThan(200);
        expect(sans[0].Immobilier || 0).toBe(0);
        expect(sans[0].DetteTotale || 0).toBe(0);

        // ⚠️ Les trois volets vont ENSEMBLE. Mesurés au mois 0 :
        //   équité       +302 574 $   (valeur 800 k$ − hypothèque 500 k$, après un mois de croissance)
        //   hypothèque    499 160 $   (au bilan, plus invisible)
        //   service      +2 922,95 $/mois
        expect(avec[0].Immobilier, 'la valeur de l’immeuble n’entre pas au bilan').toBeGreaterThan(295_000);
        expect(avec[0].DetteTotale, 'l’hypothèque locative reste invisible').toBeGreaterThan(490_000);
        expect(avec[0].Expenses - sans[0].Expenses, 'le service de dette n’est pas payé')
            .toBeGreaterThan(2_500);
    });

    it('l’hypothèque s’AMORTIT jusqu’à extinction (elle n’est pas figée au bilan)', () => {
        // Mettre la dette au bilan sans la servir la gèlerait pour toujours — la moitié d'un
        // correctif serait pire que pas de correctif du tout.
        const avec = pts({ rentalProperties: [IMMEUBLE] });
        const fin = avec[avec.length - 1];
        expect(fin.DetteTotale, 'l’hypothèque locative ne descend jamais').toBeLessThan(1);
        // Et la valeur, elle, a bien crû (3 %/an sur 25 ans sur 800 k$).
        expect(fin.Immobilier).toBeGreaterThan(1_500_000);
    });

    it('AUCUN immeuble : sortie strictement inchangée (rétrocompat)', () => {
        const a = pts({});
        const b = pts({ rentalProperties: [] });
        expect(a.length).toBe(b.length);
        for (let i = 0; i < a.length; i++) expect(b[i].NetWorth).toBe(a[i].NetWorth);
    });
});

describe('[ENG-W5-RENTAL-OFFBALANCE] le module pur', () => {
    it('la mensualité est une annuité constante, et le taux 0 ne divise pas par zéro', () => {
        // 500 k$ à 5 % sur 25 ans ≈ 2 923 $/mois (formule d'annuité standard).
        expect(rentalMonthlyPayment(500_000, 5, 25)).toBeCloseTo(2_922.95, 1);
        // Taux 0 : amortissement linéaire, pas un NaN ni un Infinity.
        expect(rentalMonthlyPayment(120_000, 0, 10)).toBeCloseTo(1_000, 6);
        // Solde nul ou négatif : aucun paiement (un immeuble payé ne se sert pas).
        expect(rentalMonthlyPayment(0, 5, 25)).toBe(0);
        expect(rentalMonthlyPayment(-1, 5, 25)).toBe(0);
    });

    it('le dernier versement ne rembourse JAMAIS plus que la dette (pas de création d’argent)', () => {
        const states = initRentalStates([{ ...IMMEUBLE, mortgageBalance: 1_000, mortgageRate: 5, amortizationYears: 25 }]);
        // Mensualité artificiellement énorme : le plafond doit mordre.
        states[0].monthlyPayment = 999_999;
        const r = processRentalMonth(states, 3, ['Duplex']);
        expect(states[0].mortgage).toBe(0);
        // Le service payé vaut le solde + son intérêt du mois, pas la mensualité folle.
        expect(r.debtService).toBeLessThan(1_100);
        expect(r.debtService).toBeGreaterThan(1_000);
        expect(r.logs.some((l) => /remboursée/i.test(l))).toBe(true);
    });

    it('un amortissement ABSENT retombe sur le défaut documenté, pas sur NaN', () => {
        const sansAmort = { ...IMMEUBLE, amortizationYears: undefined } as unknown as RentalProperty;
        const states = initRentalStates([sansAmort]);
        expect(Number.isFinite(states[0].monthlyPayment)).toBe(true);
        expect(states[0].monthlyPayment).toBeCloseTo(
            rentalMonthlyPayment(500_000, 5, DEFAULT_RENTAL_AMORTIZATION_YEARS), 6,
        );
    });

    it('l’équité rendue est DÉJÀ nette (ne jamais re-soustraire l’hypothèque)', () => {
        const states = initRentalStates([IMMEUBLE]);
        const r = processRentalMonth(states, 0, ['Duplex']);   // croissance 0 → arithmétique lisible
        expect(r.equity).toBeCloseTo(states[0].currentValue - states[0].mortgage, 6);
        expect(r.equity + r.mortgageBalance).toBeCloseTo(states[0].currentValue, 6);
    });
});

describe('[ENG-W5-BUSINESS-OFFBALANCE] l’entreprise privée entre au patrimoine', () => {
    it('la valeur au prorata détenu compte — et les BNR ne sont PAS ajoutés en plus', () => {
        const avec = pts({ privateBusinesses: [ENTREPRISE] });
        const sans = pts({});
        const delta = avec[0].NetWorth - sans[0].NetWorth;

        // ⚠️ Le point le plus important : 2 M$, PAS 2,4 M$. Une valeur juste marchande EMBARQUE
        // déjà les bénéfices non répartis — les additionner double-compterait de 400 k$.
        expect(delta).toBeCloseTo(2_000_000, 0);
        expect(delta, 'les BNR ont été ajoutés en double').toBeLessThan(2_100_000);
    });

    it('le prorata de détention s’applique', () => {
        const moitie = pts({ privateBusinesses: [{ ...ENTREPRISE, ownershipPct: 50 }] });
        const sans = pts({});
        expect(moitie[0].NetWorth - sans[0].NetWorth).toBeCloseTo(1_000_000, 0);
    });

    it('AUCUNE entreprise : sortie strictement inchangée (rétrocompat)', () => {
        const a = pts({});
        const b = pts({ privateBusinesses: [] });
        for (let i = 0; i < a.length; i++) expect(b[i].NetWorth).toBe(a[i].NetWorth);
    });
});
