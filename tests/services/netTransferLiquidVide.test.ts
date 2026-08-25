// tests/services/netTransferLiquidVide.test.ts
//
// [ENG-LIQUID-FLUX-FORM] ⚠️ **`NetTransferLiquid` vaut TOUJOURS zéro dans le FUTUR.** Ce fichier ne
// corrige rien : il MESURE le défaut, verrouille le contrat actuel pour qu'il ne dérive pas
// davantage, et s'inversera le jour où le correctif sera décidé (`UN-TEST-DE-LIMITE-S-INVERSE`).
//
// ── LE TICKET SOUS-ESTIMAIT LARGEMENT LE DÉFAUT ────────────────────────────────────────────────
// Il annonçait « le compte Liquidités n'est pas conforme à la forme-flux : 7 638,44 $ au mois 324 ».
// MESURÉ sur une fixture ordinaire de 30 ans, SANS divorce ni stress-test :
//   • `NetTransferLiquid` est non nul sur **0 des 361 points** — le champ est CONSTAMMENT zéro ;
//   • **355 mois sur 360** portent un résiduel de forme-flux > 1 $ ;
//   • pire résiduel **108 608,35 $** (mois 360), cumul absolu **864 592,56 $**.
// Ce n'est donc pas un cas limite : c'est TOUT le mouvement du compte courant qui n'est jamais publié.
//
// ── LA CAUSE, LISIBLE DANS LE CODE ─────────────────────────────────────────────────────────────
// `buildMonthlyDataPoint` calcule `NetTransferLiquid = contribLiquid − withdrawalLiquid`. Or ces
// deux accumulateurs ne sont alimentés que par des chemins MARGINAUX (immobilier, objectifs enfants,
// cascade de sauvetage de découvert) : le flux ORDINAIRE du ménage — salaire net encaissé, dépenses
// payées, cotisations sorties vers les placements — ne les touche jamais.
// VÉRIFIÉ à deux mois : le résiduel vaut EXACTEMENT `(NetSalary − Expenses) − Σcotisations`
// (m=6 : −18,63 $ · m=120 : −30,00 $), c'est-à-dire le cashflow non publié.
//
// ── ⚠️ ET LE PASSÉ, LUI, LE PUBLIE ─────────────────────────────────────────────────────────────
// `services/history/dailyPastLedger.ts` pose `NetTransferLiquid: income - expenses`. Le MÊME champ a
// donc DEUX sens selon le côté de « aujourd'hui » : le vrai cashflow dans le passé, zéro dans le
// futur. Quatre surfaces le consomment — `ProjectionExplains`, `ProjectionTooltip` (qui SOMME tous
// les `NetTransfer*`), `FutureDetailModal` (« Cash (Coussin) ») et `yearlyActions` (« Cash ») : la
// ligne de flux du cash affiche donc 0 sur tout l'horizon futur pendant que le solde bouge.
//
// ── POURQUOI CE LOT NE CORRIGE PAS ─────────────────────────────────────────────────────────────
// La DIRECTION est déterminée (aligner le futur sur le passé : `income − expenses`), mais le
// correctif fait passer une ligne d'interface constamment nulle à ~10 k$/mois sur quatre surfaces,
// et `contribLiquid` traverse `realEstateMonth` et les objectifs enfants. Ça mérite son propre lot,
// avec la mesure de chaque consommateur — pas un « pendant qu'on y est » au bout d'un lot de mesure.
// Routé : `[ENG-LIQUID-FLUX-FORM]`.

import { describe, it, expect } from 'vitest';
import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, User } from '../../types';
import type { AllocationStrategy } from '../../services/projection/types';

const users = (age: number): User[] => ([
    { name: 'Marc', grossSalary: 8_200, netSalary: 5_620, color: '#10b981', age, birthYear: 2026 - age, canadaArrivalYear: 2026 - age, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
    { name: 'Anna', grossSalary: 7_100, netSalary: 4_995, color: '#3b82f6', age, birthYear: 2026 - age, canadaArrivalYear: 2026 - age, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
] as unknown as User[]);

const params = (): SimulationParams => ({
    projection: {
        years: 30, returnRate: 6, inflationRate: 2, savingsMode: 'manual', manualContribution: 1_500,
        usePortfolioRate: false, returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
        emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3,
    } as ProjectionConfig,
    calculatedStartingCash: 40_000,
    liveCSVBalances: { CELI: 90_000, CELIAPP: 12_000, REER: 150_000, NON_ENREG: 60_000, CRYPTO: 25_000, REEE: 18_000 },
    realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: { targetAge: 62, targetMonthlyIncome: 5_000, governmentPension: 1_500, lifeExpectancy: 92, dbPensionMonthly: 0 } as unknown as RetirementGoal,
    config: { users: users(45), splitMode: '50/50' } as unknown as BudgetConfig,
    baseGrossAnnual: 183_600, baseNetAnnual: 127_380, currentRentExpense: 1_800,
    baseMonthlyExpenses: 4_500, startYear: 2026, startMonth: 0,
} as unknown as SimulationParams);

const run = () => (__runScenarioForTests(
    params(), 'AUTO_MARGINAL' as AllocationStrategy, true, false, 0, 'BASE', {},
    { verboseMonthlyPoints: true },
) as unknown as { chartData: Array<Record<string, number>> }).chartData;

const n = (o: Record<string, number> | undefined, k: string): number => Number(o?.[k] ?? NaN);

describe('[ENG-LIQUID-FLUX-FORM] le flux du compte courant n\'est jamais publié dans le futur', () => {
    /**
     * ⚠️ TEST DE LIMITE — il verrouille un DÉFAUT, pas une propriété souhaitable. Le jour où le
     * correctif est livré, il doit être INVERSÉ ici même (avec son histoire), jamais supprimé :
     * supprimé, il laisserait croire que la limite n'a jamais existé.
     */
    it('LIMITE CONNUE : `NetTransferLiquid` est nul sur TOUS les points de la projection', () => {
        const cd = run();
        const nonNuls = cd.filter((p) => Math.abs(n(p, 'NetTransferLiquid')) > 0.005).length;
        expect(cd.length, 'projection vide : rien à mesurer').toBeGreaterThan(300);
        expect(nonNuls, 'BONNE NOUVELLE : le flux du cash est enfin publié → INVERSER ce test (voir l\'en-tête)')
            .toBe(0);
    });

    it('la conséquence : le solde du cash bouge sans flux qui l\'explique, presque tous les mois', () => {
        const cd = run();
        let mois = 0, pire = 0, ouPire = -1;
        for (let m = 1; m < cd.length; m++) {
            const delta = n(cd[m], 'Liquidites') - n(cd[m - 1], 'Liquidites');
            const res = delta - (n(cd[m], 'MarketGrowthLiquid') + n(cd[m], 'NetTransferLiquid'));
            if (Math.abs(res) > 1) mois++;
            if (Math.abs(res) > Math.abs(pire)) { pire = res; ouPire = m; }
        }
        // Anti-vacuité : le compte est GARNI et il BOUGE — sinon « rien n'est expliqué » serait vrai
        // pour la raison sans intérêt d'un compte vide.
        // ⚠️ Vider `calculatedStartingCash` ne suffit PAS à produire ce cas (essayé) : le salaire
        // regarnit le compte en quelques mois et les trois tests restent verts. Ce que ce plancher
        // protège vraiment, c'est le SÉLECTEUR — vérifié en le pointant sur un champ inexistant,
        // qui le fait rougir.
        expect(n(cd[6], 'Liquidites'), 'compte courant vide : le défaut serait invisible').toBeGreaterThan(1_000);
        // Mesuré : 355 mois sur 360, pire 108 608,35 $ au mois 360.
        expect(mois, 'le défaut a changé d\'ampleur — re-mesurer avant de toucher au ticket').toBeGreaterThan(300);
        expect(Math.abs(pire), `pire résiduel ${pire.toFixed(2)} $ au mois ${ouPire}`).toBeGreaterThan(10_000);
    });

    /**
     * La CAUSE, pas seulement le symptôme : le résiduel est exactement le cashflow du ménage
     * (`NetSalary − Expenses − Σcotisations`). C'est cette égalité qui dit où le correctif doit
     * brancher, et elle rougirait si le défaut venait d'ailleurs.
     */
    it('le résiduel EST le cashflow du ménage, pas un artefact d\'arrondi', () => {
        const cd = run();
        for (const m of [6, 120]) {
            const delta = n(cd[m], 'Liquidites') - n(cd[m - 1], 'Liquidites');
            const residuel = delta - (n(cd[m], 'MarketGrowthLiquid') + n(cd[m], 'NetTransferLiquid'));
            const cashflow = n(cd[m], 'NetSalary') - n(cd[m], 'Expenses')
                - (n(cd[m], 'ContribCELI') + n(cd[m], 'ContribREER') + n(cd[m], 'ContribNonReg'));
            expect(Math.abs(residuel), `résiduel nul au mois ${m} : ce mois ne mesure rien`).toBeGreaterThan(1);
            expect(residuel, `au mois ${m}, le résiduel ne correspond pas au cashflow non publié`)
                .toBeCloseTo(cashflow, 1);
        }
    });
});
