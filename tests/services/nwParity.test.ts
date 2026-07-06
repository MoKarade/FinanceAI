// tests/services/nwParity.test.ts
//
// [NW-PARITY-INVARIANT] — garde-fou KEYSTONE : le patrimoine net PRÉSENT affiché (UI,
// `computePresentNetWorth`) doit ÉGALER le patrimoine net de DÉPART du moteur de projection
// (extension d'INV-1 « reconstructabilité » au présent). Sans ça, l'app peut afficher NW=X
// aujourd'hui pendant que la projection démarre d'un NW=Y → incohérence pour l'utilisateur.
//
// Le cash s'aligne par CONSTRUCTION : `computeStartingCash` (input moteur via
// `deriveSimulationInputsFromState`) ≡ `computeCurrentLiquidity` (NW présent) — même somme
// (initialBalances + transactions non-dup/non-transfer). Le SEUL risque de divergence est la
// valorisation du PORTEFEUILLE : `derivePortfolioStartingBalances` RECONSTRUIT une histoire de prix
// (`reconstructPortfolioHistory`) et prend le dernier point, alors que `computeInvestmentsValue`
// (NW présent) valorise point-par-point (quantité × prix courant × FX). Ce test VÉRIFIE qu'ils
// concordent — la parité n'est PAS « par construction » côté placements.
//
// ⚠️ LIMITE ASSUMÉE : la parité est définie HORS IMMOBILIER. `computePresentNetWorth` (NW présent UI)
// EXCLUT l'immobilier par design (cash + placements − dettes seulement) ; le moteur, lui, porte
// `realEstateEquity` dans `chartData[0]` si une propriété est détenue au départ → avec immo, l'écart
// (= l'équité immobilière) est ATTENDU, pas une régression (mesuré ~1,5 % sur un persona propriétaire).
// Les fixtures ci-dessous n'ont donc PAS d'immobilier. Une future fixture avec propriété DOIT comparer
// hors `chartData[0].Immobilier`, sinon la parité « casse » à raison.

import { describe, it, expect } from 'vitest';
import {
    computeInvestmentsValue,
    computePresentNetWorth,
    computeCurrentLiquidity,
    computeTotalDebt,
} from '../../services/portfolio';
import { computeStartingCash, derivePortfolioStartingBalances } from '../../services/projection/buildSimulationParams';
import { calculateFutureProjection, type SimulationParams } from '../../services/projection';
import type { Asset, Transaction, Debt, ProjectionConfig, BudgetConfig, RetirementGoal } from '../../types';

const FX = { CAD: 1, USD: 1.38, EUR: 1.50 };

// Actif COHÉRENT : `priceHistory` se terminant EXACTEMENT au `currentPrice` (dans la devise de l'actif),
// achat passé → la reconstruction d'historique (moteur) doit le valoriser au prix courant aujourd'hui,
// comme le point-par-point (NW présent). On construit l'historique à partir du prix courant pour garantir
// la cohérence (un `currentPrice` qui DIVERGE du dernier point d'historique briserait la parité — c'est
// précisément la condition à ne pas tester involontairement).
const makeAsset = (o: Partial<Asset> & { quantity: number; currentPrice: number }): Asset => {
    const px = o.currentPrice;
    // Actif RÉALISTE (comme dans l'app) : UN achat passé de `quantity` parts à `buyPrice`, `buyPrice`
    // défini, historique de prix cohérent finissant au prix courant. `getEffectivePurchases` rend alors
    // l'achat explicite (quantité = `quantity`) → la reconstruction d'historique doit valoriser au prix
    // courant aujourd'hui, comme le point-par-point.
    return {
        symbol: 'AAA', currency: 'CAD', accountType: 'CELI', performance: 0,
        dateBought: '2023-01-15', buyPrice: px * 0.6,
        purchases: [{ date: '2023-01-15', quantity: o.quantity, price: px * 0.6 }],
        priceHistory: [
            { date: '2023-01-15', price: px * 0.6 },
            { date: '2024-06-01', price: px * 0.8 },
            { date: '2025-06-01', price: px },
        ],
        ...o,
    } as Asset;
};

// Somme des 6 BUCKETS de placement que le moteur reçoit (PAS les champs dérivés `TOTAL` ni
// `historicalRate` que `LiveCSVBalances` porte aussi — les sommer double-compterait).
const BUCKETS = ['CELI', 'CELIAPP', 'REER', 'NON_ENREG', 'CRYPTO', 'REEE'] as const;
const sumBalances = (b: Record<string, number>): number =>
    BUCKETS.reduce((s, k) => s + (Number(b[k]) || 0), 0);

describe('[NW-PARITY-INVARIANT] NW présent (UI) ≡ NW de départ du moteur', () => {
    const initialBalances = { 'Compte courant': 40_000 };
    const transactions: Transaction[] = [];
    const assets: Asset[] = [
        makeAsset({ symbol: 'CAD1', accountType: 'CELI', quantity: 100, currentPrice: 50, currency: 'CAD' }),   // 5 000 CAD
        makeAsset({ symbol: 'USD1', accountType: 'REER', quantity: 20, currentPrice: 100, currency: 'USD' }),   // 2 000 USD
    ];
    const debts: Debt[] = [{ name: 'Auto', balance: 12_000 } as Debt, { name: 'Carte', balance: 3_000 } as Debt];

    it('valorisation du portefeuille : Σ derivePortfolioStartingBalances ≡ computeInvestmentsValue', () => {
        // Le cœur du risque : la reconstruction d'historique (moteur) doit donner la même valeur CAD
        // que la valorisation point-par-point (NW présent). Divergence = NW présent ≠ départ moteur.
        const moteur = sumBalances(derivePortfolioStartingBalances(assets, FX));
        const present = computeInvestmentsValue(assets, FX);
        expect(present).toBeGreaterThan(1_000); // non-vacuité : la fixture a de vrais placements (≠ 0≡0)
        expect(moteur).toBeCloseTo(present, 0);
    });

    it('cash : computeStartingCash (moteur) ≡ computeCurrentLiquidity (présent) — par construction', () => {
        expect(computeStartingCash(initialBalances, transactions))
            .toBeCloseTo(computeCurrentLiquidity(initialBalances, transactions), 6);
    });

    it('PARITÉ NW : (cash moteur + portefeuille moteur − dettes) ≡ computePresentNetWorth', () => {
        const moteurNW = computeStartingCash(initialBalances, transactions)
            + sumBalances(derivePortfolioStartingBalances(assets, FX))
            - computeTotalDebt(debts);
        const presentNW = computePresentNetWorth(initialBalances, transactions, assets, FX, debts);
        // Discriminant : si la valorisation portefeuille divergeait, l'écart sauterait (≫ 1 $).
        expect(moteurNW).toBeCloseTo(presentNW, 0);
    });

    it('FX étranger : la parité SUIT le taux fourni (pas de divergence sur devise)', () => {
        const fx2 = { CAD: 1, USD: 2, EUR: 1.5 };
        const moteurNW = computeStartingCash(initialBalances, transactions)
            + sumBalances(derivePortfolioStartingBalances(assets, fx2))
            - computeTotalDebt(debts);
        const presentNW = computePresentNetWorth(initialBalances, transactions, assets, fx2, debts);
        expect(moteurNW).toBeCloseTo(presentNW, 0);
    });

    // END-TO-END (lettre du backlog : « NW présent ≡ chartData[0].NetWorth ») — extension d'INV-1 au présent.
    // À FLUX NULS (revenu/dépense/croissance = 0, sans dette ni immobilier), le mois 0 du moteur ne change
    // RIEN → chartData[0].NetWorth = NW de départ = NW présent. Isole la parité des dynamiques du mois 0.
    it('chartData[0].NetWorth (projection à flux nuls) ≡ computePresentNetWorth — AVEC dettes', () => {
        // Dettes AUX DEUX côtés (intérêt 0 + paiement 0 → aucun flux au mois 0) : couvre la soustraction
        // des dettes END-TO-END (la surface exacte du bug MONEY-PHANTOM : dettes non soustraites → NW gonflé).
        const e2eDebts: Debt[] = [{ id: 'ed', name: 'Prêt', balance: 18_000, interestRate: 0, minimumPayment: 0, category: 'Personal' } as Debt];
        const presentNW = computePresentNetWorth(initialBalances, transactions, assets, FX, e2eDebts);
        expect(presentNW).toBeGreaterThan(1_000); // non-vacuité
        const projection: ProjectionConfig = {
            years: 1, returnRate: 0, inflationRate: 0, savingsMode: 'manual', manualContribution: 0,
            usePortfolioRate: false, returnRates: { celi: 0, reer: 0, nonReg: 0, crypto: 0, cash: 0 },
            emergencyFundMonths: 6, salaryGrowth: 0, propertyGrowthRate: 0,
        };
        // Salaires à 0 → la fiscalité n'est PAS exercée ici (`isImmigrant`/`canadaArrivalYear` sans effet) ;
        // `SimulationParams` ci-dessous est MINIMAL à dessein (seuls les champs affectant `chartData[0].NetWorth`
        // à flux nuls sont renseignés — TS impose les champs obligatoires).
        const u = (name: string, color: string) => ({ name, grossSalary: 0, netSalary: 0, color, age: 40, birthYear: 1986, canadaArrivalYear: 1986, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 });
        const config: BudgetConfig = { users: [u('X', '#10b981'), u('Y', '#3b82f6')], splitMode: '50/50' };
        const retirementGoal: RetirementGoal = { targetAge: 65, targetMonthlyIncome: 0, governmentPension: 0, lifeExpectancy: 90 };
        const params: SimulationParams = {
            projection,
            calculatedStartingCash: computeStartingCash(initialBalances, transactions),
            liveCSVBalances: derivePortfolioStartingBalances(assets, FX),
            realEstateGoals: [], debts: e2eDebts, childGoals: [], travelGoals: [], lifeEvents: [],
            retirementGoal, config,
            baseGrossAnnual: 0, baseNetAnnual: 0, currentRentExpense: 0, baseMonthlyExpenses: 0,
            startYear: 2026, startMonth: 0,
        };
        const cd = calculateFutureProjection(params).chartData;
        expect(cd.length).toBeGreaterThan(0);
        const nw0 = Number(cd[0].NetWorth);
        // chartData[0] est APRÈS le mois 0 : même à flux nuls, le moteur ALLOUE le cash de départ vers le
        // CELI (la part investissable), puis applique un FRAIS MER 0,0020/12 sur ce solde investi (~45 k$
        // après allocation) → écart ~8 $ sur ~48 k$ (0,017 %, mesuré : CELI −7,50 + REER −0,46). Tolérance
        // RELATIVE 0,1 % : absorbe ce bruit du mois 0 MAIS attraperait une vraie divergence de départ (un
        // bug type 2× = ~16 % d'écart). La parité EXACTE est garantie au niveau INPUT par les tests ci-dessus.
        expect(Math.abs(nw0 - presentNW) / presentNW).toBeLessThan(0.001);
    });
});
