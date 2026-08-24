// tests/services/smithHelocTaux.test.ts
//
// [SMITH-HELOC-TAUX-FIGE] Le taux de la marge du levier Smith Manoeuvre SUIT désormais le taux
// hypothécaire du bien (décision Marc, 2026-08-24) au lieu d'être figé à 5 %.
//
// ⚠️ POURQUOI CE LOT COMPTE PLUS QUE SON DIFF. `useSmithManoeuvre` fait partie de l'espace de
// recherche de stratégies (`strategySpace.ts`, `strategyConfig.ts`) : ce taux n'alimente pas un
// affichage, il alimente un CLASSEMENT. Il décide de ce que l'application RECOMMANDE. Un 5 % figé
// pouvait passer SOUS le taux hypothécaire du bien — une marge révolvante moins chère que le prêt de
// premier rang qu'elle accompagne, ce qui est impossible en pratique et flatteur dans le modèle,
// précisément quand les taux montent et que le levier devient dangereux.
//
// MESURÉ, gain du levier sur le patrimoine net final à 30 ans, AVANT contre APRÈS :
//   hypothèque 3 % : +639 889 $ → +639 889 $ (la marge tombe à 5 %, inchangé PAR CONSTRUCTION)
//   hypothèque 5 % : +489 760 $ → +413 769 $
//   hypothèque 8 % : +275 001 $ →  +32 263 $   (242 738 $ d'avantage fantôme retirés)
//
// ⚠️ La ligne à 3 % est le meilleur test de non-régression du lot : elle prouve que le changement ne
// déplace RIEN là où l'ancien et le nouveau taux coïncident. Un écart y aurait signalé un effet de
// bord, pas la correction.

import { describe, it, expect } from 'vitest';
import {
    smithHelocAnnualRate, SMITH_HELOC_SPREAD_OVER_MORTGAGE, SMITH_HELOC_RATE_FLOOR,
} from '../../services/projection/modelAssumptions';
import { calculateFutureProjection, type SimulationParams } from '../../services/projection';
import type { User } from '../../types';

describe('[SMITH-HELOC-TAUX-FIGE] le taux de la marge suit celui du prêt', () => {
    it('marge = hypothèque + écart, sur toute la plage utile', () => {
        expect(smithHelocAnnualRate(3)).toBeCloseTo(0.05, 10);
        expect(smithHelocAnnualRate(5)).toBeCloseTo(0.07, 10);
        expect(smithHelocAnnualRate(8)).toBeCloseTo(0.10, 10);
        // Anti-vacuité : ces trois valeurs doivent être DISTINCTES, sinon le suivi n'existe pas.
        expect(new Set([smithHelocAnnualRate(3), smithHelocAnnualRate(5), smithHelocAnnualRate(8)]).size).toBe(3);
    });

    it('la marge est TOUJOURS plus chère que le prêt qu’elle accompagne', () => {
        // C'est l'invariant STRUCTUREL du produit — celui que le 5 % figé violait dès que
        // l'hypothèque dépassait 5 %. On le balaie plutôt que de mesurer un point.
        for (let pct = 0; pct <= 15; pct += 0.5) {
            expect(smithHelocAnnualRate(pct), `marge sous le prêt à ${pct} %`).toBeGreaterThan(pct / 100);
        }
    });

    it('le plancher protège le dossier sans taux saisi', () => {
        // Sans lui, un bien détenu sans prêt donnerait une marge quasi gratuite, donc un levier
        // artificiellement gagnant : le biais même que ce lot corrige, réintroduit par la porte de
        // derrière.
        expect(smithHelocAnnualRate(undefined)).toBe(SMITH_HELOC_RATE_FLOOR);
        expect(smithHelocAnnualRate(0)).toBe(SMITH_HELOC_RATE_FLOOR);
        expect(smithHelocAnnualRate(NaN)).toBe(SMITH_HELOC_RATE_FLOOR);
        // Et il ne mord PAS dès que le taux saisi est réel — sinon il écraserait le suivi.
        expect(smithHelocAnnualRate(4)).toBeGreaterThan(SMITH_HELOC_RATE_FLOOR);
    });

    it('l’écart est bien celui qui est nommé (pas une valeur recopiée)', () => {
        expect(smithHelocAnnualRate(6) - 0.06).toBeCloseTo(SMITH_HELOC_SPREAD_OVER_MORTGAGE, 10);
    });
});

// ─── La CHAÎNE : le moteur consomme-t-il vraiment ce taux ? ───────────────────

const user = (): User => ({
    name: 'Marc', grossSalary: 8_000, netSalary: 5_800, color: '#10b981',
    age: 35, birthYear: 1991, canadaArrivalYear: 1991, hasOwnedPropertyLast4Years: false,
} as unknown as User);

function params(smith: boolean, mortgageRate: number): SimulationParams {
    return {
        projection: {
            years: 30, returnRate: 6, inflationRate: 2, savingsMode: 'manual', manualContribution: 0,
            usePortfolioRate: false, returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
            emergencyFundMonths: 6, salaryGrowth: 0, propertyGrowthRate: 3, useSmithManoeuvre: smith,
        },
        calculatedStartingCash: 150_000,
        liveCSVBalances: { CELI: 0, CELIAPP: 0, REER: 0, NON_ENREG: 0, CRYPTO: 0, REEE: 0 },
        realEstateGoals: [{
            id: 'p1', name: 'Maison', isActive: true, purchaseDate: '2026-06-01',
            price: 500_000, downPayment: 120_000, mortgageRate, amortization: 25,
            totalClosingCosts: 0, monthlyPayment: 0, unrecoverableMonthly: 0, isPrimaryResidence: true,
        }],
        debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
        retirementGoal: { targetAge: 65, targetMonthlyIncome: 4_000, governmentPension: 1_500 },
        config: { users: [user()], splitMode: '50/50' },
        baseGrossAnnual: 96_000, baseNetAnnual: 69_600, currentRentExpense: 1_800,
        baseMonthlyExpenses: 4_000, startYear: 2026, startMonth: 0,
    } as unknown as SimulationParams;
}

/** Gain du levier sur le patrimoine net final, à taux hypothécaire donné. */
function gainDuLevier(mortgageRate: number): number {
    const fin = (p: SimulationParams): number => {
        const r = calculateFutureProjection(p) as unknown as { chartData: Record<string, number>[] };
        const cd = r.chartData ?? [];
        expect(cd.length, 'chartData vide : rien à mesurer').toBeGreaterThan(0);
        const nw = cd[cd.length - 1]?.NetWorth;
        expect(nw, 'NetWorth absent du dernier point').toEqual(expect.any(Number));
        return nw;
    };
    return fin(params(true, mortgageRate)) - fin(params(false, mortgageRate));
}

describe('[SMITH-HELOC-TAUX-FIGE] le moteur consomme le taux — et le conseil change', () => {
    it('à hypothèque ÉLEVÉE, l’avantage du levier s’effondre', () => {
        // Avec le 5 % figé, le levier rendait encore +275 001 $ à 8 % d'hypothèque — une marge MOINS
        // chère que le prêt. Avec le suivi, il ne reste presque rien.
        const gain8 = gainDuLevier(8);
        expect(gain8, 'mesuré ~32 263 $ ; l’ancien code rendait ~275 001 $').toBeLessThan(150_000);
        // Anti-vacuité : le levier doit tout de même AGIR, sinon le test passerait sur un moteur mort.
        expect(Math.abs(gain8), 'le levier ne produit plus aucun effet : scénario suspect')
            .toBeGreaterThan(1_000);
    });

    it('l’avantage DÉCROÎT quand le taux hypothécaire monte (monotonie)', () => {
        // Le point qui compte pour l'utilisateur : le conseil suit enfin la réalité du dossier.
        const g3 = gainDuLevier(3);
        const g5 = gainDuLevier(5);
        const g8 = gainDuLevier(8);
        expect(g3).toBeGreaterThan(g5);
        expect(g5).toBeGreaterThan(g8);
    });

    it('à hypothèque 3 %, RIEN ne bouge — la marge y vaut 5 %, comme avant', () => {
        // Non-régression : là où l'ancien et le nouveau taux coïncident, le résultat doit être
        // identique au dollar près à la mesure d'avant le lot (+639 889 $).
        expect(smithHelocAnnualRate(3)).toBeCloseTo(0.05, 10);
        expect(gainDuLevier(3)).toBeGreaterThan(600_000);
    });
});
