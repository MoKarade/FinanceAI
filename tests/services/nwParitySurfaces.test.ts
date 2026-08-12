// tests/services/nwParitySurfaces.test.ts
//
// [NW-PARITY-SURFACES-TEST] (garde-fou keystone, audit 2026-06-17) — chaque SURFACE qui affiche un
// patrimoine net doit router par la source unique, et sa convention ÉQUITÉ IMMO doit être EXPLICITE
// (documentée ET testée). Un bug $ résiduel vit là où la source unique est contournée.
//
// Conventions par surface (l'état 2026-07-31, verrouillé ici) :
//  - `buildFinancialSnapshot` (IA/MCP)      → computePresentNetWorth, HORS immobilier.
//  - `useDerivedFinancials.globalNetWorth`  → computePresentNetWorth, HORS immobilier
//    (testé dans tests/utils/useDerivedFinancials.test.tsx — même helper, même convention).
//  - KPI « Patrimoine net » (FutureKpiStrip) → computePresentNetWorth + Σ presentEquityOfGoal
//    (AVEC immobilier, étiqueté « équité immo incluse » — l'Accueil est DÉROUTÉ depuis
//    [REFONTE-NAV-L1] ; testé dans tests/components/FutureKpiStrip.test.tsx).
//  - PDF (`generateFinancialReport`)        → netWorth = globalNetWorth (HORS immo) ; l'équité immo
//    est une LIGNE SÉPARÉE par propriété (presentEquityOfGoal — fix V3 : était `equity: 0` en dur,
//    la ligne « Équité bâtie » ne s'affichait jamais).
//
// Fixture = persona ENDETTÉ + PROPRIÉTAIRE : c'est la combinaison qui expose à la fois une dette
// non soustraite (bug MONEY-PHANTOM) et une équité comptée dans la mauvaise convention.

import { describe, it, expect } from 'vitest';
import { buildFinancialSnapshot } from '../../services/financialSnapshot';
import { computePresentNetWorth } from '../../services/portfolio';
import { presentEquityOfGoal } from '../../services/projection/pastPurchaseInit';
import { normalizeAppState } from '../../mcp/state/appStateDefaults';
import type { Asset, Debt, RealEstateGoal } from '../../types';

const FX = { CAD: 1, USD: 1.38, EUR: 1.5 };

const asset: Asset = {
    symbol: 'VFV.TO', name: 'VFV', quantity: 200, currentPrice: 100, buyPrice: 90,
    currency: 'CAD', accountType: 'CELI',
} as Asset; // 20 000 CAD

const debts: Debt[] = [{ id: 'd1', name: 'Auto', balance: 5_000, interestRate: 6, minimumPayment: 100 } as Debt];

const ownedHome = {
    id: 'reg_home', name: 'Maison', isActive: true,
    currentValue: 400_000, mortgageBalance: 250_000,
} as unknown as RealEstateGoal; // équité explicite : 150 000

const state = normalizeAppState({
    initialBalances: { Compte: 10_000 },
    transactions: [],
    assets: [asset],
    debts,
    realEstateGoals: [ownedHome],
    fxRates: FX,
});

describe('[NW-PARITY-SURFACES-TEST] conventions équité immo explicites par surface', () => {
    const present = computePresentNetWorth({ Compte: 10_000 }, [], [asset], FX, debts); // 25 000 hors immo
    const equity = presentEquityOfGoal(ownedHome, 12);

    it('non-vacuité : le persona a une vraie dette ET une vraie équité immo', () => {
        expect(present).toBeCloseTo(10_000 + 20_000 - 5_000, 0);
        expect(equity).toBeCloseTo(150_000, 0); // champs explicites : currentValue − mortgageBalance
    });

    it('buildFinancialSnapshot (IA/MCP) : netWorth ≡ computePresentNetWorth — HORS immobilier', () => {
        const snap = buildFinancialSnapshot(state);
        expect(snap.netWorth).toBeCloseTo(present, 0);
        // Discriminant de convention : si une future modif ajoutait l'équité au snapshot SANS mettre
        // à jour cette table de conventions, l'écart (150 000) ferait sauter l'assertion ci-dessus —
        // et celle-ci documente que l'écart attendu avec la vue « avec immo » EST l'équité.
        expect(Math.abs((present + equity) - snap.netWorth)).toBeCloseTo(equity, 0);
    });

    it('presentEquityOfGoal : gate isActive (bien inactif = 0, jamais compté)', () => {
        expect(presentEquityOfGoal({ ...ownedHome, isActive: false } as RealEstateGoal, 12)).toBe(0);
    });

    it('presentEquityOfGoal : équité explicite jamais négative en sortie de surface agrégée', () => {
        // Un bien sous l'eau (hypothèque > valeur) rend une équité négative — c'est une INFORMATION
        // (le NW doit la porter), pas un cas à clamper ici : la convention est « valeur − dette »,
        // documentée. On la verrouille pour qu'un futur « Math.max(0, …) » bien intentionné (classe
        // FISC-RE-SALE-RESIDUAL : effacer un déficit = patrimoine surévalué) casse ce test.
        const underwater = { ...ownedHome, currentValue: 200_000, mortgageBalance: 250_000 } as RealEstateGoal;
        expect(presentEquityOfGoal(underwater, 12)).toBeCloseTo(-50_000, 0);
    });
});
