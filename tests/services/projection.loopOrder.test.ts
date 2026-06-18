// tests/services/projection.loopOrder.test.ts
//
// [ORDRE DE LA BOUCLE MENSUELLE] — garde-fou money-critical (ENG-LOOP-ORDER-TEST).
//
// La boucle mensuelle de services/projection.ts applique l'ALLOCATION du cashflow
// (processCashflowAllocation : contributions/retraits, ./projection/cashflowAllocation)
// AVANT la CROISSANCE marché (applyMonthlyGrowth, ./projection/growthApplication).
// Cet ordre est money-critical : il décide si une contribution du mois M gagne une
// DEMI-mois de rendement le mois M lui-même (convention mid-month de applyMidMonthGrowth :
// le solde initial croît le mois entier, le flux du mois ne croît qu'un demi-mois).
//
// Pourquoi un test dédié : une INVERSION de cet ordre (croissance AVANT allocation)
// CONSERVE l'argent — rien ne se crée ni ne se détruit — mais FAUSSE les rendements.
// Donc AUCUN invariant de conservation (projection.moneyConservation, résiduel ≈ 0) ne
// l'attrape : la masse monétaire reste cohérente, seul le rendement est décalé d'un mois.
//
// Signal DISCRIMINANT : un actif INVESTI qui démarre à 0 (liveCSVBalances = NO_INVEST)
// ne peut afficher de croissance le mois 1 QUE si une contribution l'a financé AVANT le
// calcul de croissance ce mois-là. Sous l'ordre inversé, le solde investi vaut encore 0
// au moment de la croissance (la contribution n'est appliquée qu'après) → croissance = 0.
// On somme les 6 actifs investis (le liquide est EXCLU : il démarre à calculatedStartingCash,
// donc ≠ 0, et gagnerait de la croissance « de socle » indépendamment de l'ordre).
//
// Preuve de discrimination (faite à la main, 2026-06-18) : en simulant l'ordre inversé
// (croissance calculée sur les soldes investis PRÉ-allocation), la somme du mois 1 tombe à
// 0 → le 1er test échoue. Voir le commit/PR pour le protocole exact.

import { describe, it, expect } from 'vitest';
import { calculateFutureProjection, type SimulationParams } from '../../services/projection';
import type { ProjectionChartPoint } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal } from '../../types';

const makeProjection = (o: Partial<ProjectionConfig> = {}): ProjectionConfig => ({
    years: 3,
    returnRate: 6,
    inflationRate: 2,
    savingsMode: 'manual',
    manualContribution: 0,
    usePortfolioRate: false,
    returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
    emergencyFundMonths: 6,
    salaryGrowth: 2,
    propertyGrowthRate: 3,
    ...o,
});

const makeConfig = (): BudgetConfig => ({
    users: [
        { name: 'Marc', grossSalary: 8200, netSalary: 5620, color: '#10b981', age: 30, birthYear: 1996, canadaArrivalYear: 1996, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
        { name: 'Anna', grossSalary: 7100, netSalary: 4995, color: '#3b82f6', age: 30, birthYear: 1996, canadaArrivalYear: 1996, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
    ],
    splitMode: '50/50',
});

const makeRetirementGoal = (): RetirementGoal => ({ targetAge: 60, targetMonthlyIncome: 5500, governmentPension: 1850, lifeExpectancy: 92 });

const NO_INVEST = { CELI: 0, CELIAPP: 0, REER: 0, NON_ENREG: 0, CRYPTO: 0, REEE: 0 };

const makeParams = (o: Partial<SimulationParams> = {}): SimulationParams => ({
    projection: makeProjection(),
    calculatedStartingCash: 15_000,
    liveCSVBalances: NO_INVEST,
    realEstateGoals: [],
    debts: [],
    childGoals: [],
    travelGoals: [],
    lifeEvents: [],
    retirementGoal: makeRetirementGoal(),
    config: makeConfig(),
    baseGrossAnnual: 183_600,
    baseNetAnnual: 127_380,
    currentRentExpense: 1_800,
    baseMonthlyExpenses: 6_801,
    startYear: 2026,
    startMonth: 0,
    ...o,
});

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Croissance marché des SEULS actifs investis (liquide exclu). Tous démarrent à 0
// sous NO_INVEST → toute croissance au mois 1 vient d'une contribution du mois 1.
const investedGrowth = (p: ProjectionChartPoint): number =>
    num((p as Record<string, unknown>).MarketGrowthCELI) +
    num((p as Record<string, unknown>).MarketGrowthCELIAPP) +
    num((p as Record<string, unknown>).MarketGrowthREER) +
    num((p as Record<string, unknown>).MarketGrowthNonReg) +
    num((p as Record<string, unknown>).MarketGrowthCrypto) +
    num((p as Record<string, unknown>).MarketGrowthREEE);

const investedBalance = (p: ProjectionChartPoint): number =>
    num((p as Record<string, unknown>).CELI) +
    num((p as Record<string, unknown>).CELIAPP) +
    num((p as Record<string, unknown>).REER) +
    num((p as Record<string, unknown>).NonReg) +
    num((p as Record<string, unknown>).Crypto) +
    num((p as Record<string, unknown>).REEE);

// Sanité « le moteur a bien produit un point » : le liquide démarre toujours à
// calculatedStartingCash (> 0), donc Liquidites > 0 prouve que la simulation a tourné.
// Sans cette garde, un point de sortie VIDE (tous champs absents → num()=0) ferait passer
// le scénario de contrôle pour la mauvaise raison (faux vert sur un renommage global).
const liquid = (p: ProjectionChartPoint): number => num((p as Record<string, unknown>).Liquidites);

describe("[ORDRE BOUCLE] allocation AVANT croissance (money-critical)", () => {
    it("la contribution du mois finance la croissance du même mois : actifs investis partis de 0 → croissance mois 1 > 0", () => {
        // Coussin d'urgence DÉJÀ couvert (cash 80k > targetEF d'1 mois) : le surplus est balayé
        // (cash-drag sweep) puis investi dès le mois 1. Les actifs investis démarrent à 0
        // (NO_INVEST) → leur croissance au mois 1 ne peut venir QUE de la contribution du mois 1,
        // donc de l'allocation effectuée AVANT la croissance.
        const cd = calculateFutureProjection(makeParams({
            calculatedStartingCash: 80_000,
            projection: makeProjection({ emergencyFundMonths: 1 }),
        })).chartData;
        const m1 = cd[0];
        // Quelque chose a bien été investi au mois 1 (sinon le test ne prouverait rien).
        const balance = investedBalance(m1);
        expect(balance).toBeGreaterThan(1_000);
        // … et cet investissement a gagné une demi-mois de croissance LE MOIS 1. Comme les actifs
        // partent de 0, leur solde du mois 1 EST la contribution du mois → la croissance attendue ≈
        // solde × (demi-mois à ~6 % ≈ 0,248 % − MER) ≈ solde × 0,0023. Le seuil 0,002 est donc lié
        // algébriquement au solde constaté (pas un nombre magique) et garde une marge sous le réel.
        // Sous l'ordre INVERSÉ (croissance avant allocation) cette somme serait 0 → ÉCHEC.
        expect(investedGrowth(m1)).toBeGreaterThan(balance * 0.002);
    });

    it("contrôle : sans contribution au mois 1, aucune croissance investie fantôme (somme === 0)", () => {
        // Même persona, mais coussin d'urgence ÉNORME (240 mois) + cash modeste : tout le surplus
        // est aspiré par le coussin (liquide), aucun actif investi n'est financé au mois 1 → ils
        // restent à 0. Prouve que la croissance positive du 1er test est CAUSÉE par la contribution
        // du même mois, pas par un artefact de socle (le liquide, lui, croît mais est exclu).
        const cd = calculateFutureProjection(makeParams({
            calculatedStartingCash: 15_000,
            projection: makeProjection({ emergencyFundMonths: 240 }),
        })).chartData;
        const m1 = cd[0];
        // Sanité : le moteur a bien tourné (liquide ≠ 0) — sinon un point vide (tous champs absents)
        // ferait passer les deux assertions ci-dessous pour la mauvaise raison.
        expect(liquid(m1)).toBeGreaterThan(1_000);
        expect(investedBalance(m1)).toBeLessThan(1);
        expect(investedGrowth(m1)).toBe(0);
    });
});
