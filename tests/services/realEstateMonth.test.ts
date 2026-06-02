import { describe, it, expect } from 'vitest';
import {
    processRealEstate,
    type RealEstateState,
    type RealEstateCtx,
    type PropertyStateMutable,
} from '../../services/projection/realEstateMonth';
import type { RealEstateGoal } from '../../types';

// Tests d'INVARIANTS sur processRealEstate (bloc immobilier mensuel) — module
// money-critical de 385 l. qui n'avait aucun test unitaire direct (couvert
// seulement en intégration). On cible les comportements vérifiables :
//   1. amortissement (split intérêt / capital),
//   2. remboursement complet de l'hypothèque (clamp + isPaidOff),
//   3. croissance de la valeur + plafond maxValue,
//   4. achat quand les liquidités suffisent (cash débité, PMT calculé),
//   5. achat reporté quand elles manquent,
//   6. arrêt du loyer après l'achat de la résidence principale,
//   7. revenus locatifs (propriété non-primaire),
//   8. cascade de mise de fonds (CELI ; RAP pour résidence principale).
// processRealEstate MUTE state + propertiesState en place. On NE MODIFIE PAS le
// source ; un comportement surprenant est noté en commentaire, pas corrigé.

const makeState = (over: Partial<RealEstateState> = {}): RealEstateState => ({
    liquid: 0, celi: 0, celiapp: 0, reer: 0, nonReg: 0, nonRegACB: 0, capitalLossBank: 0,
    monthlyIncome: 0, monthlyExpenses: 0, accRentesYear: 0, accCapitalGainsYear: 0,
    realEstateEquity: 0, mortgageBalance: 0, hasPurchasedPrimary: false,
    hasUsedRap: false, rapBorrowed: 0, rapRepaymentDueTotal: 0, rapRepaymentStartOffset: 0,
    smithManoeuvreDebt: 0, smithInterestDeductibleYear: 0, fhsaClosingYear: null,
    taxCurrentYearReer: 0, impotReerMois: 0,
    withdrawalLiquid: 0, withdrawalCELI: 0, withdrawalNonReg: 0, withdrawalREER: 0, contribLiquid: 0,
    celiWithdrawalsThisYear: 0, retraitCeliMois: 0,
    immoInterest: 0, immoPrincipal: 0, immoHypo: 0, immoCharges: 0,
    totalRentalIncome: 0,
    lifeEventLogs: [], flowEventLogs: [],
    ...over,
});

const makeCtx = (over: Partial<RealEstateCtx> = {}): RealEstateCtx => ({
    m: 0, loopYear: 2026, isRetired: false, activeUsersCount: 1,
    simInflation: 0, simSalaryGrowth: 0,
    grossMarcBaseAnnual: 80000, grossAnnaBaseAnnual: 0, incomeRetirement: 0,
    useSmithManoeuvre: false, currentRentExpense: 0,
    ...over,
});

const makeGoal = (over: Partial<RealEstateGoal> = {}): RealEstateGoal => ({
    id: 'p1', name: 'Maison', isActive: true, purchaseDate: '2026-01-01',
    price: 500000, downPayment: 100000, mortgageRate: 5, amortization: 25,
    totalClosingCosts: 0, monthlyPayment: 0, unrecoverableMonthly: 0,
    isPrimaryResidence: true,
    ...over,
});

const makeProp = (over: Partial<PropertyStateMutable> = {}): PropertyStateMutable => ({
    id: 'p1', isBought: false, mortgage: 0, currentValue: 0, calculatedPmt: 0,
    ...over,
});

// Fonctions injectées (neutres / déterministes) : offset d'achat à 0 (achat
// possible dès m=0), taxe de bienvenue nulle, taux marginal fixe à 40 %.
const offset0 = () => 0;
const noWelcomeTax = () => 0;
const marginal40 = () => 0.4;

describe('realEstateMonth — amortissement (propriété détenue)', () => {
    it('sépare intérêt et capital : intérêt = solde × taux mensuel, capital = PMT − intérêt', () => {
        const state = makeState();
        // taux 6 %/an → 0,5 %/mois ; solde 300 000 → intérêt 1 500 ; PMT 2 000 → capital 500.
        const goal = makeGoal({ mortgageRate: 6, isPrimaryResidence: false, propertyGrowthRate: 0 });
        const prop = makeProp({ isBought: true, mortgage: 300000, currentValue: 600000, calculatedPmt: 2000 });

        // m=12 (pas un multiple de 60 → aucun renouvellement déclenché).
        processRealEstate(state, makeCtx({ m: 12 }), [goal], [prop], offset0, noWelcomeTax, marginal40);

        expect(state.immoInterest).toBeCloseTo(1500, 6);
        expect(state.immoPrincipal).toBeCloseTo(500, 6);
        expect(prop.mortgage).toBeCloseTo(299500, 6);
    });

    it('rembourse à 100 % quand le capital dépasse le solde : clamp à 0, isPaidOff, PMT remis à 0', () => {
        const state = makeState();
        const goal = makeGoal({ mortgageRate: 3, isPrimaryResidence: false, propertyGrowthRate: 0 });
        // solde résiduel 400 $, PMT 10 000 → le capital efface tout.
        const prop = makeProp({ isBought: true, mortgage: 400, currentValue: 500000, calculatedPmt: 10000 });

        processRealEstate(state, makeCtx({ m: 12 }), [goal], [prop], offset0, noWelcomeTax, marginal40);

        expect(prop.mortgage).toBe(0);
        expect(prop.isPaidOff).toBe(true);
        expect(prop.calculatedPmt).toBe(0);
    });
});

describe('realEstateMonth — valeur de la propriété', () => {
    it('croît mensuellement au taux annuel composé', () => {
        const state = makeState();
        const goal = makeGoal({ propertyGrowthRate: 12, isPrimaryResidence: false });
        const prop = makeProp({ isBought: true, mortgage: 0, currentValue: 500000, calculatedPmt: 0 });

        processRealEstate(state, makeCtx({ m: 1 }), [goal], [prop], offset0, noWelcomeTax, marginal40);

        expect(prop.currentValue).toBeCloseTo(500000 * Math.pow(1.12, 1 / 12), 2);
    });

    it('plafonne la valeur à maxValue', () => {
        const state = makeState();
        const goal = makeGoal({ propertyGrowthRate: 12, maxValue: 502000, isPrimaryResidence: false });
        const prop = makeProp({ isBought: true, mortgage: 0, currentValue: 500000, calculatedPmt: 0 });

        processRealEstate(state, makeCtx({ m: 1 }), [goal], [prop], offset0, noWelcomeTax, marginal40);

        // 500 000 × 1,0095 ≈ 504 746 > 502 000 → écrêté.
        expect(prop.currentValue).toBe(502000);
    });
});

describe('realEstateMonth — achat', () => {
    it('achète quand les liquidités couvrent mise de fonds + frais ; débite le cash et calcule le PMT', () => {
        const state = makeState({ liquid: 200000 });
        const goal = makeGoal({
            price: 500000, downPayment: 100000, totalClosingCosts: 5000,
            mortgageRate: 5, amortization: 25, isPrimaryResidence: true, propertyGrowthRate: 0,
        });
        // Solde du prêt pré-initialisé par le moteur (prix − mise de fonds). MDF 20 % → pas de SCHL.
        const prop = makeProp({ isBought: false, mortgage: 400000, currentValue: 500000 });

        processRealEstate(state, makeCtx({ m: 0 }), [goal], [prop], offset0, noWelcomeTax, marginal40);

        // totalCashNeeded = 100 000 + 5 000 + 0 (taxe bienvenue) − 0 (pas de neuf) = 105 000.
        expect(prop.isBought).toBe(true);
        expect(state.liquid).toBeCloseTo(95000, 6);
        expect(state.withdrawalLiquid).toBeCloseTo(105000, 6);
        expect(state.hasPurchasedPrimary).toBe(true);

        const r = 0.05 / 12;
        const n = 25 * 12;
        const expectedPmt = (400000 * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
        expect(prop.calculatedPmt).toBeCloseTo(expectedPmt, 2);
    });

    it("reporte l'achat quand les liquidités (et comptes) sont insuffisants", () => {
        // reer=0 → la cascade REER/CELI/NonReg n'est même pas tentée (gardée par reer>0).
        const state = makeState({ liquid: 50000, reer: 0, celi: 0, nonReg: 0, celiapp: 0 });
        const goal = makeGoal({ price: 500000, downPayment: 100000, totalClosingCosts: 5000, isPrimaryResidence: true });
        const prop = makeProp({ isBought: false, mortgage: 400000, currentValue: 500000 });

        processRealEstate(state, makeCtx({ m: 0 }), [goal], [prop], offset0, noWelcomeTax, marginal40);

        expect(prop.isBought).toBe(false);
        expect(state.liquid).toBe(50000); // intact
    });

    it('puise dans le CELI pour compléter la mise de fonds (RAP sauté hors résidence principale)', () => {
        // Non-primaire → pas de RAP ; reer>0 pour entrer dans la cascade ; CELI couvre le manque.
        const state = makeState({ liquid: 50000, reer: 10000, celi: 100000, nonReg: 0, celiapp: 0 });
        const goal = makeGoal({ price: 500000, downPayment: 100000, totalClosingCosts: 5000, isPrimaryResidence: false });
        const prop = makeProp({ isBought: false, mortgage: 400000, currentValue: 500000 });

        processRealEstate(state, makeCtx({ m: 0 }), [goal], [prop], offset0, noWelcomeTax, marginal40);

        // manque = 105 000 − 50 000 = 55 000 → tiré du CELI.
        expect(state.withdrawalCELI).toBeCloseTo(55000, 6);
        expect(state.celi).toBeCloseTo(45000, 6);
        expect(prop.isBought).toBe(true);
    });

    it('utilise le RAP (REER, sans impôt) pour une résidence principale', () => {
        const state = makeState({ liquid: 50000, reer: 80000, celi: 0, nonReg: 0, celiapp: 0 });
        const goal = makeGoal({ price: 500000, downPayment: 100000, totalClosingCosts: 5000, isPrimaryResidence: true });
        const prop = makeProp({ isBought: false, mortgage: 400000, currentValue: 500000 });

        processRealEstate(state, makeCtx({ m: 0, loopYear: 2026, activeUsersCount: 1 }), [goal], [prop], offset0, noWelcomeTax, marginal40);

        expect(state.hasUsedRap).toBe(true);
        expect(state.rapBorrowed).toBeGreaterThan(0);
        expect(state.rapRepaymentDueTotal).toBeGreaterThan(0);
        expect(state.rapRepaymentStartOffset).toBeGreaterThan(0); // délai de grâce posé
        expect(prop.isBought).toBe(true);
    });
});

describe('realEstateMonth — flux post-achat', () => {
    it('arrête de compter le loyer une fois la résidence principale achetée', () => {
        const state = makeState({ monthlyExpenses: 5000, hasPurchasedPrimary: true });

        // Aucune propriété active : seule la logique « plus de loyer » s'applique.
        processRealEstate(state, makeCtx({ m: 0, currentRentExpense: 2000, simInflation: 0 }), [], [], offset0, noWelcomeTax, marginal40);

        expect(state.monthlyExpenses).toBeCloseTo(3000, 6); // 5 000 − 2 000
    });

    it('comptabilise les revenus locatifs des propriétés non-primaires', () => {
        const state = makeState();
        const goal = makeGoal({ isPrimaryResidence: false, rentalIncomeMonthly: 2000, propertyGrowthRate: 0 });
        const prop = makeProp({ isBought: true, mortgage: 0, currentValue: 400000, calculatedPmt: 0 });

        processRealEstate(state, makeCtx({ m: 0, simInflation: 0 }), [goal], [prop], offset0, noWelcomeTax, marginal40);

        expect(state.monthlyIncome).toBeCloseTo(2000, 6);
        expect(state.accRentesYear).toBeCloseTo(2000, 6);
        expect(state.totalRentalIncome).toBeCloseTo(2000, 6);
    });
});

describe('realEstateMonth — chemins-bords', () => {
    it('Smith Manoeuvre : le capital remboursé est réemprunté en non-enregistré + intérêts capitalisés', () => {
        const state = makeState();
        const goal = makeGoal({ mortgageRate: 6, isPrimaryResidence: true, propertyGrowthRate: 0 });
        // solde 300 000 @ 6 % → intérêt 1 500 ; PMT 2 000 → capital 500. Valeur haute → pas d'appel de marge.
        const prop = makeProp({ isBought: true, mortgage: 300000, currentValue: 1000000, calculatedPmt: 2000 });

        processRealEstate(state, makeCtx({ m: 12, useSmithManoeuvre: true }), [goal], [prop], offset0, noWelcomeTax, marginal40);

        expect(state.nonReg).toBeCloseTo(500, 6);
        expect(state.nonRegACB).toBeCloseTo(500, 6);
        // dette Smith = capital 500 + intérêt capitalisé (500 × 0,05/12)
        const smithInterest = 500 * (0.05 / 12);
        expect(state.smithManoeuvreDebt).toBeCloseTo(500 + smithInterest, 4);
        expect(state.smithInterestDeductibleYear).toBeCloseTo(smithInterest, 4);
    });

    it('remboursement RAP : déplace ~1/180 du montant emprunté de liquide vers REER, après le délai de grâce', () => {
        const state = makeState({
            liquid: 10000, reer: 5000,
            hasUsedRap: true, rapBorrowed: 30000, rapRepaymentDueTotal: 30000, rapRepaymentStartOffset: 24,
        });

        // m = 24 = début du remboursement ; aucune propriété active (on isole le RAP).
        processRealEstate(state, makeCtx({ m: 24 }), [], [], offset0, noWelcomeTax, marginal40);

        const monthly = (30000 / 15) / 12; // 166,67 $
        expect(state.liquid).toBeCloseTo(10000 - monthly, 4);
        expect(state.reer).toBeCloseTo(5000 + monthly, 4);
        expect(state.rapRepaymentDueTotal).toBeCloseTo(30000 - monthly, 4);
    });

    it('ne rembourse pas le RAP avant le délai de grâce (m < rapRepaymentStartOffset)', () => {
        const state = makeState({
            liquid: 10000, reer: 5000,
            hasUsedRap: true, rapBorrowed: 30000, rapRepaymentDueTotal: 30000, rapRepaymentStartOffset: 24,
        });

        processRealEstate(state, makeCtx({ m: 12 }), [], [], offset0, noWelcomeTax, marginal40);

        expect(state.liquid).toBe(10000);
        expect(state.reer).toBe(5000);
        expect(state.rapRepaymentDueTotal).toBe(30000);
    });

    it('renouvellement à 5 ans (m=60) : recalcule le PMT sur la durée résiduelle', () => {
        const state = makeState();
        // id 'p1' → charCodeAt(0)=112, 112%3=1 → choc de taux nul → renouvellement au même taux 6 %.
        const goal = makeGoal({ mortgageRate: 6, amortization: 25, isPrimaryResidence: false, propertyGrowthRate: 0 });
        const prop = makeProp({ id: 'p1', isBought: true, mortgage: 280000, currentValue: 600000, calculatedPmt: 1 });

        processRealEstate(state, makeCtx({ m: 60 }), [goal], [prop], offset0, noWelcomeTax, marginal40);

        // 240 mois restants @ 6 % sur 280 000.
        const nr = 0.06 / 12;
        const rem = 240;
        const expectedPmt = (280000 * nr * Math.pow(1 + nr, rem)) / (Math.pow(1 + nr, rem) - 1);
        expect(prop.calculatedPmt).toBeCloseTo(expectedPmt, 2);
        expect(state.lifeEventLogs.some((l) => l.includes('Renouvellement'))).toBe(true);
    });
});
