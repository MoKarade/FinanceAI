// tests/services/netTransferLiquidVide.test.ts
//
// [ENG-LIQUID-FLUX-FORM] — TEST DE LIMITE **INVERSÉ** (lot 196, 2026-09-06).
//
// ⚠️ Il garde son nom (« Vide ») et son histoire : jusqu'au lot 196, `NetTransferLiquid` valait
// TOUJOURS zéro dans le FUTUR, et ce fichier le MESURAIT sans le corriger — verrouillant le contrat
// d'alors pour qu'il ne dérive pas davantage. Le correctif livré, chaque assertion s'est retournée
// ICI MÊME (`UN-TEST-DE-LIMITE-S-INVERSE-IL-NE-SE-SUPPRIME-PAS`) : supprimé, il laisserait croire
// que la limite n'a jamais existé — et rien n'empêcherait de re-brancher le champ sur les deux
// accumulateurs marginaux « pour simplifier ».
//
// ── CE QUI ÉTAIT MESURÉ AVANT (fixture ordinaire de 30 ans, sans divorce ni stress-test) ─────
//   • `NetTransferLiquid` non nul sur **0 des 361 points** — le champ était CONSTAMMENT zéro ;
//   • **355 mois sur 360** portaient un résiduel de forme-flux > 1 $ ;
//   • pire résiduel **108 608,35 $** (mois 360), cumul absolu **864 592,56 $**.
//   Ce n'était donc pas un cas limite : TOUT le mouvement du compte courant n'était jamais publié.
//
// ── LA CAUSE, ET LE CORRECTIF ──────────────────────────────────────────────────────────────────
// `buildMonthlyDataPoint` calculait `NetTransferLiquid = contribLiquid − withdrawalLiquid`, deux
// accumulateurs que seuls des chemins MARGINAUX alimentaient (immobilier, objectifs enfants, cascade
// de sauvetage). Le flux ORDINAIRE — paie encaissée, dépenses payées, cotisations sorties vers les
// placements — ne les touchait jamais. VÉRIFIÉ à deux mois : le résiduel valait EXACTEMENT
// `(NetSalary − Expenses) − Σcotisations` (m=6 : −18,63 $ · m=120 : −30,00 $).
// Depuis le lot 196, le champ est DÉRIVÉ du solde : `liquid − prevLiquid − growthLiquid` — tout ce
// qui a bougé hors intérêts, le sens que le PASSÉ (`dailyPastLedger` : `income − expenses`) lui
// donnait déjà. Dérivé et non composé, à dessein : ~30 sites dans cinq modules mutent le liquide.
//
// ── CE QUE CE FICHIER PROUVE DÉSORMAIS ─────────────────────────────────────────────────────────
//   1. le champ est publié (mesuré 2026-09-06 : **358 points sur 361** non nuls) ;
//   2. l'identité `ΔLiquidités = MarketGrowthLiquid + NetTransferLiquid` tient à CHAQUE mois ;
//   3. et surtout — parce que 2 tient par construction — qu'un mois ORDINAIRE rend bien le cashflow
//      du ménage (`NetSalary − Expenses − Σcotisations`), la grandeur que l'utilisateur lit.
// Quatre surfaces le consomment : `ProjectionExplains`, `ProjectionTooltip` (somme des `NetTransfer*`),
// `FutureDetailModal` (« Cash (Coussin) ») et `yearlyActions` / plan d'action (« Cash »).

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

describe('[ENG-LIQUID-FLUX-FORM] le flux du compte courant est publié dans le futur (limite INVERSÉE au lot 196)', () => {
    it('INVERSÉ : `NetTransferLiquid` est non nul sur (presque) tous les points de la projection', () => {
        const cd = run();
        const nonNuls = cd.filter((p) => Math.abs(n(p, 'NetTransferLiquid')) > 0.005).length;
        expect(cd.length, 'projection vide : rien à mesurer').toBeGreaterThan(300);
        // Avant le lot 196 : 0. Mesuré après : 358 sur 361 (le point 0 n'a pas de mois précédent,
        // deux mois de transition tombent sous le demi-cent).
        expect(nonNuls, 'RÉGRESSION : le flux du cash a cessé d\'être publié (voir l\'en-tête)')
            .toBeGreaterThan(300);
    });

    it('INVERSÉ : le solde du cash est EXPLIQUÉ par ses flux à chaque mois (résiduel nul)', () => {
        const cd = run();
        let mois = 0, pire = 0, ouPire = -1;
        for (let m = 1; m < cd.length; m++) {
            const delta = n(cd[m], 'Liquidites') - n(cd[m - 1], 'Liquidites');
            const res = delta - (n(cd[m], 'MarketGrowthLiquid') + n(cd[m], 'NetTransferLiquid'));
            if (Math.abs(res) > 1) mois++;
            if (Math.abs(res) > Math.abs(pire)) { pire = res; ouPire = m; }
        }
        // Anti-vacuité : le compte est GARNI et il BOUGE — sinon « tout est expliqué » serait vrai
        // pour la raison sans intérêt d'un compte vide (et le sélecteur, pointé sur un champ
        // inexistant, rougit ici).
        expect(n(cd[6], 'Liquidites'), 'compte courant vide : la garde serait vacueuse').toBeGreaterThan(1_000);
        expect(cd.filter((p) => Math.abs(n(p, 'NetTransferLiquid')) > 1).length, 'aucun flux > 1 $ : rien à raccorder').toBeGreaterThan(100);
        // Avant : 355 mois sur 360, pire 108 608,35 $ au mois 360. Après : 0 mois, pire < 0,05 $
        // (trois arrondis au cent).
        expect(mois, `résiduel de forme-flux réapparu (pire ${pire.toFixed(2)} $ au mois ${ouPire})`).toBe(0);
        expect(Math.abs(pire), `pire résiduel ${pire.toFixed(2)} $ au mois ${ouPire}`).toBeLessThan(0.05);
    });

    /**
     * La garde qui compte : l'identité ci-dessus tient PAR CONSTRUCTION (le champ est dérivé du
     * solde), donc elle ne prouve pas que le chiffre a un SENS. Ce test-ci le prouve : sur un mois
     * ordinaire, le flux publié est le cashflow du ménage — ce que le passé publie déjà, et ce que
     * l'utilisateur lit sous « transfert » / « Cash ». Il rougit si le champ est re-branché sur
     * `contribLiquid − withdrawalLiquid` (0) ou s'il oublie la croissance (écart = intérêts du mois).
     */
    it('INVERSÉ : sur un mois ordinaire, le flux publié EST le cashflow du ménage', () => {
        const cd = run();
        for (const m of [6, 120]) {
            const cashflow = n(cd[m], 'NetSalary') - n(cd[m], 'Expenses')
                - (n(cd[m], 'ContribCELI') + n(cd[m], 'ContribREER') + n(cd[m], 'ContribNonReg'));
            expect(Math.abs(cashflow), `cashflow nul au mois ${m} : ce mois ne mesure rien`).toBeGreaterThan(1);
            expect(n(cd[m], 'NetTransferLiquid'), `au mois ${m}, le flux publié n'est pas le cashflow du ménage`)
                .toBeCloseTo(cashflow, 1);
        }
    });
});
