/**
 * [ENG-RAP-MISSED-REPAYMENT-TAX] Un versement RAP DÛ et non fait est un REVENU IMPOSABLE.
 *
 * Règle ARC : la portion du remboursement RAP non versée pour une année s'ajoute au revenu de cette
 * année (ligne 12900) et le solde du RAP diminue d'autant. Avant ce lot, le moteur ne faisait RIEN
 * sur ce chemin : le versement était reporté en silence, jamais imposé, et le solde restait dû
 * indéfiniment.
 *
 * ⚠️ CE QUI A ÉTÉ MESURÉ AVANT D'ÉCRIRE (célibataire 60 k$, condo 420 k$ acheté en 2027, RAP
 * 60 000 $, projection 20 ans) — la limite était documentée « LOW, impact borné », elle ne l'était
 * pas :
 *   · dépenses 2 500 $/mois → 180 versements dus, 0 sauté (le ménage rembourse) ;
 *   · dépenses 3 400 $/mois → 205 dus, 190 sautés, 63 333 $ jamais portés au revenu ;
 *   · dépenses 3 600 $/mois → 205 dus, 205 sautés, 68 333 $.
 *   « 205 dus pour une obligation de 180 » est le second symptôme : sans réduction du solde,
 *   l'obligation ne s'éteignait jamais.
 * Effet du correctif sur le patrimoine final à 20 ans : −18 121 $ / −19 503 $ / −19 864 $ sur les
 * trois profils qui sautent, et **0 $ exactement** sur celui qui rembourse (contrôle négatif).
 */
import { describe, it, expect } from 'vitest';
import { processRealEstate, type RealEstateState, type RealEstateCtx } from '../../services/projection/realEstateMonth';
import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, RealEstateGoal, User } from '../../types';
import type { AllocationStrategy } from '../../services/projection/types';

const RAP_EMPRUNTE = 60_000;
/** Le versement mensuel du moteur : 1/15 par an, douzième par mois. */
const VERSEMENT = (RAP_EMPRUNTE / 15) / 12;

const etat = (liquid: number): RealEstateState => ({
    liquid, celi: 0, celiapp: 0, reer: 100_000, nonReg: 0, nonRegACB: 0, capitalLossBank: 0,
    monthlyIncome: 0, monthlyExpenses: 0, accRentesYear: 0, accCapitalGainsYear: 0,
    realEstateEquity: 0, mortgageBalance: 0, hasPurchasedPrimary: true,
    hasUsedRap: true, rapBorrowed: RAP_EMPRUNTE, rapRepaymentDueTotal: RAP_EMPRUNTE,
    rapRepaymentStartOffset: 0,
    smithManoeuvreDebt: 0, smithInterestDeductibleYear: 0, fhsaClosingYear: null,
    taxCurrentYearReer: 0, impotReerMois: 0,
    withdrawalLiquid: 0, withdrawalCELI: 0, withdrawalNonReg: 0, withdrawalREER: 0,
    contribLiquid: 0, celiWithdrawalsThisYear: 0, retraitCeliMois: 0, retraitReerMois: 0,
    rrspWithholdingMois: 0, accRetraitsReerYearAdd: 0, rapMissedRepaymentAdd: 0,
    immoInterest: 0, immoPrincipal: 0, immoHypo: 0, immoCharges: 0, totalRentalIncome: 0, rentalEarnedParProprietaire: { user1: 0, user2: 0, joint: 0 },
    lifeEventLogs: [], flowEventLogs: [],
} as unknown as RealEstateState);

const ctx = (): RealEstateCtx => ({
    m: 24, loopYear: 2028, isRetired: false, activeUsersCount: 1, simInflation: 2,
    simSalaryGrowth: 2, grossMarcBaseAnnual: 60_000, grossAnnaBaseAnnual: 0,
    incomeRetirement: 0, useSmithManoeuvre: false, currentRentExpense: 1_400,
} as unknown as RealEstateCtx);

const joue = (liquid: number): RealEstateState => {
    const s = etat(liquid);
    processRealEstate(s, ctx(), [], [], () => 0, () => 0);
    return s;
};

describe('[ENG-RAP-MISSED-REPAYMENT-TAX] versement RAP manqué → revenu imposable', () => {
    it('anti-vacuité : le versement mensuel du moteur est bien non nul', () => {
        // Sans ça, « liquide < versement » serait vrai pour un versement de 0 $ et les deux cas
        // ci-dessous mesureraient la même chose.
        expect(VERSEMENT).toBeCloseTo(333.3333, 3);
    });

    it('liquide SUFFISANT : le versement est payé, rien ne va au revenu', () => {
        const s = joue(10_000);
        expect(s.rapMissedRepaymentAdd).toBe(0);
        expect(s.liquid).toBeCloseTo(10_000 - VERSEMENT, 6);
        expect(s.reer).toBeCloseTo(100_000 + VERSEMENT, 6);
        expect(s.rapRepaymentDueTotal).toBeCloseTo(RAP_EMPRUNTE - VERSEMENT, 6);
    });

    it('liquide INSUFFISANT : le versement manqué est porté au revenu imposable', () => {
        const s = joue(10);
        // Discriminant : AVANT ce lot ce champ n'existait pas et la branche ne faisait RIEN.
        expect(s.rapMissedRepaymentAdd).toBeCloseTo(VERSEMENT, 6);
    });

    it('liquide INSUFFISANT : aucun argent ne bouge — c\'est une INCLUSION, pas un retrait', () => {
        const s = joue(10);
        expect(s.liquid).toBe(10);
        expect(s.reer).toBe(100_000);
        // Et surtout : pas de RETENUE à la source, pas de ligne « RetraitREER » à l'affichage.
        expect(s.rrspWithholdingMois).toBe(0);
        expect(s.retraitReerMois).toBe(0);
        expect(s.withdrawalREER).toBe(0);
        expect(s.accRetraitsReerYearAdd).toBe(0);
    });

    it('la dette RAP diminue du versement dans les DEUX cas — elle n\'est jamais reportée', () => {
        // C'est le second défaut que ce lot ferme : sans cette réduction, l'obligation de 180 mois
        // n'expirait jamais (mesuré 205 mois dus sur une fenêtre de 20 ans).
        const paye = joue(10_000);
        const manque = joue(10);
        expect(paye.rapRepaymentDueTotal).toBeCloseTo(manque.rapRepaymentDueTotal, 6);
        expect(manque.rapRepaymentDueTotal).toBeCloseTo(RAP_EMPRUNTE - VERSEMENT, 6);
    });
});

// ── Chaîne complète ──────────────────────────────────────────────────────────
// Un test au PRODUCTEUR ne dit rien de l'acheminement (`GARDE-AU-PRODUCTEUR-NE-PROUVE-PAS-LA-CHAINE`).
// Celui-ci vise une grandeur PUBLIÉE, `rapBalance`, sur une projection de bout en bout.

const users: User[] = [
    { name: 'Marc', grossSalary: 5_000, netSalary: 3_600, color: '#10b981', age: 32, birthYear: 1994, canadaArrivalYear: 1994, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
] as unknown as User[];

const condo: RealEstateGoal = {
    id: 'p1', name: 'Condo', price: 420_000, downPayment: 84_000, totalClosingCosts: 6_000,
    mortgageRate: 5, amortization: 25, purchaseDate: '2027-01-01', isActive: true, isOwned: false,
    propertyGrowthRate: 3, isPrimaryResidence: true,
} as unknown as RealEstateGoal;

const params = (depenses: number): SimulationParams => ({
    projection: {
        years: 20, inflationRate: 2, savingsMode: 'manual', manualContribution: 0,
        usePortfolioRate: false, returnRates: { celi: 5, reer: 5, nonReg: 5, crypto: 5, cash: 1 },
        emergencyFundMonths: 0, salaryGrowth: 2, propertyGrowthRate: 3,
    } as unknown as ProjectionConfig,
    calculatedStartingCash: 5_000,
    liveCSVBalances: { CELI: 5_000, CELIAPP: 0, REER: 90_000, NON_ENREG: 0, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [condo], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: { targetAge: 65, targetMonthlyIncome: 3_000, governmentPension: 1_400, lifeExpectancy: 90, dbPensionMonthly: 0 } as unknown as RetirementGoal,
    config: { users, splitMode: '50/50' } as unknown as BudgetConfig,
    baseGrossAnnual: 60_000, baseNetAnnual: 43_200, currentRentExpense: 1_400,
    baseMonthlyExpenses: depenses, startYear: 2026, startMonth: 0,
} as unknown as SimulationParams);

const courbe = (depenses: number): Array<Record<string, number>> => (__runScenarioForTests(
    params(depenses), 'AUTO_MARGINAL' as AllocationStrategy, true, false, 0, 'BASE', {},
    { verboseMonthlyPoints: true },
) as unknown as { chartData: Array<Record<string, number>> }).chartData;

describe('[ENG-RAP-MISSED-REPAYMENT-TAX] chaîne complète', () => {
    it('un ménage qui ne PEUT pas rembourser voit quand même sa dette RAP s\'éteindre', () => {
        const pts = courbe(3_600);
        const pic = pts.reduce((mx, p) => Math.max(mx, Number(p.rapBalance ?? 0)), 0);
        expect(pic).toBeGreaterThan(50_000); // le RAP a bien été emprunté

        // ANTI-VACUITÉ, et c'est elle qui donne son sens au test : dans ce scénario le ménage n'a
        // PAS de quoi payer. Sur les mois où l'obligation court, la liquidité publiée reste sous le
        // versement dû — la baisse de `rapBalance` ne peut donc pas venir d'un remboursement.
        const enObligation = pts.filter(p => Number(p.rapBalance ?? 0) > 0 && Number(p.rapBalance ?? 0) < pic);
        expect(enObligation.length).toBeGreaterThan(24);
        const pauvres = enObligation.filter(p => Number(p.Liquidites ?? 0) < VERSEMENT);
        expect(pauvres.length).toBeGreaterThan(enObligation.length * 0.8);

        // Le FAIT : discriminant. Avant ce lot, le solde restait figé à son pic pour toujours.
        const fin = Number(pts[pts.length - 1]?.rapBalance ?? NaN);
        expect(fin).toBe(0);
    });
});
