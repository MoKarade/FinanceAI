/* eslint-disable no-console -- script de mesure : la sortie JSON EST le livrable */
/**
 * [ENGINE-IMPLICIT-ORDER] Mesure des grandeurs PUBLIÉES sensibles à l'ordre de la boucle
 * mensuelle de runScenario. Aucun calcul reconstruit : on ne lit que chartData + le résumé
 * rendu par le moteur.
 *
 * Usage :
 *   npx tsx scripts/mesureOrdreBoucle.ts <chemin absolu d'un services/projection.ts>
 * Exemple (baseline) :
 *   npx tsx scripts/mesureOrdreBoucle.ts services/projection.ts (baseline du dépôt)
 */
import type { BudgetConfig, ProjectionConfig, RetirementGoal } from '../types';

import { resolve } from 'node:path';

const engineArg = process.argv[2];
if (!engineArg) throw new Error('usage: npx tsx scripts/mesureOrdreBoucle.ts <chemin de services/projection.ts>');
const enginePath = resolve(engineArg); // un chemin relatif nu ne serait pas importable dynamiquement

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

const proj = (o: Partial<ProjectionConfig> = {}): ProjectionConfig => ({
    years: 25, returnRate: 5, inflationRate: 2, savingsMode: 'manual', manualContribution: 0,
    usePortfolioRate: false, returnRates: { celi: 5, reer: 5, nonReg: 5, crypto: 6, cash: 1 },
    emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3, ...o,
});

const user = (name: string, age: number, gross: number, net: number, color: string) => ({
    name, grossSalary: gross, netSalary: net, color, age, birthYear: 2026 - age,
    canadaArrivalYear: 2026 - age, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0,
});

// ---------------------------------------------------------------------------
// F_MELT — meltdown ↔ retirementIncome
// Couple DÉJÀ retraité (62 ans), AUCUN salaire. Contraintes SATURANTES écrites ici :
//  · REER = 900 000 $ ⇒ jamais épuisé sur 25 ans ⇒ `Math.min(reer, …)` ne sature PAS
//    (sinon les deux ordres tirent le même plafond et la mesure est aveugle).
//  · revenu de retraite ciblé ≈ 4 500 $/mois ménage ⇒ currentTotalGross ≈ 54 k$ < cible
//    (90 k$ × 2 déclarants = 180 k$, ou 140 k$/tête si actifs > 1 M$) ⇒ le meltdown TIRE
//    tous les mois (`currentTotalGross >= targetMeltGross` ne coupe pas).
//  · stratégie MELTDOWN_REER : sans elle `processReerMeltdown` rend null à la 1re ligne.
// ---------------------------------------------------------------------------
const F_MELT = {
    projection: proj({ years: 25, withdrawalStrategy: 'MELTDOWN_REER' } as Partial<ProjectionConfig>),
    calculatedStartingCash: 20_000,
    liveCSVBalances: { CELI: 0, CELIAPP: 0, REER: 900_000, NON_ENREG: 0, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: { targetAge: 60, targetMonthlyIncome: 4_500, governmentPension: 1_500, lifeExpectancy: 95 } as RetirementGoal,
    config: { users: [user('Marc', 62, 0, 0, '#10b981'), user('Anna', 62, 0, 0, '#3b82f6')], splitMode: '50/50' } as BudgetConfig,
    baseGrossAnnual: 0, baseNetAnnual: 0, currentRentExpense: 0, baseMonthlyExpenses: 3_800,
    startYear: 2026, startMonth: 0,
};

// ---------------------------------------------------------------------------
// F_AVRIL — taxApril ↔ taxDecember (buffer taxPreviousYear)
// Couple ACTIF (35 ans), salaires MENSUELS (grossSalary/netSalary = mensuels, ×12 côté moteur).
// Contraintes saturantes écrites ici :
//  · horizon 12 ans ⇒ 12 décembres et 12 avrils EXÉCUTÉS (m>0) ⇒ le couple de blocs tire.
//  · immeuble locatif ⇒ `applyW5Effects` alimente taxCurrentYear.divers TOUS les mois
//    (impôt locatif proxy) : ce bucket est le SEUL de `.revenu/.divers` à SURVIVRE à
//    l'écrasement de décembre (taxDecember.ts:641 `taxCurrent.revenu = …`).
//  · liquidités de départ modestes (25 k$) ⇒ le débit d'avril MORD sur le liquide, donc
//    la position d'avril vis-à-vis de l'allocation de trésorerie est observable.
// ---------------------------------------------------------------------------
const F_AVRIL = {
    projection: proj({ years: 12 }),
    calculatedStartingCash: 25_000,
    liveCSVBalances: { CELI: 30_000, CELIAPP: 0, REER: 120_000, NON_ENREG: 60_000, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: { targetAge: 62, targetMonthlyIncome: 5_500, governmentPension: 1_800, lifeExpectancy: 92 } as RetirementGoal,
    config: { users: [user('Marc', 35, 9_000, 6_050, '#10b981'), user('Anna', 35, 7_000, 4_900, '#3b82f6')], splitMode: '50/50' } as BudgetConfig,
    baseGrossAnnual: 192_000, baseNetAnnual: 131_400, currentRentExpense: 1_900, baseMonthlyExpenses: 7_200,
    startYear: 2026, startMonth: 0,
    rentalProperties: [{
        id: 'rp1', name: 'Duplex', isActive: true, purchaseDate: '2020-01', price: 500_000,
        downPayment: 100_000, mortgageRate: 4, amortization: 25, monthlyRent: 2_600,
        monthlyExpenses: 900, vacancyRate: 5, appreciationRate: 3,
    }],
};

// F_MELT_DEC — même que F_MELT mais avec un immeuble locatif : accRentesYear devient non nul,
// ce qui rend le couple (realEstateMonth → meltdown) observable en plus de incomeRetirement.
const F_MELT_DEC = { ...F_MELT, rentalProperties: F_AVRIL.rentalProperties };


// ---------------------------------------------------------------------------
// F_ROOM — accumulateur annuel ↔ son RESET (revenu gagné vs janvier, [RRSP-FIRST-YEAR-13M])
// Contrainte SATURANTE écrite ici : les DROITS REER doivent LIMITER la cotisation, sinon
// l'année de 13 mois de revenu gagné ne change rien (mesure aveugle).
//  · salaires modestes (4 000 $/mois brut × 2 ⇒ droits ≈ 18 % × 96 k$ ≈ 17 k$/an)
//  · dépenses basses + 300 k$ de liquide ⇒ le surplus dépasse LARGEMENT les droits
//    ⇒ `rrspRoom` est bien le facteur limitant chaque année.
//  · stratégie PRIO_REER : la cascade vise le REER en premier.
// ---------------------------------------------------------------------------
const F_ROOM = {
    projection: proj({ years: 15 }),
    calculatedStartingCash: 300_000,
    liveCSVBalances: { CELI: 0, CELIAPP: 0, REER: 0, NON_ENREG: 0, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: { targetAge: 62, targetMonthlyIncome: 4_000, governmentPension: 1_500, lifeExpectancy: 92 } as RetirementGoal,
    config: { users: [user('Marc', 35, 4_000, 3_050, '#10b981'), user('Anna', 35, 4_000, 3_050, '#3b82f6')], splitMode: '50/50' } as BudgetConfig,
    baseGrossAnnual: 96_000, baseNetAnnual: 73_200, currentRentExpense: 1_200, baseMonthlyExpenses: 2_600,
    startYear: 2026, startMonth: 0,
};

const resume = (label: string, res: Record<string, unknown>) => {
    const cd = res.chartData as Record<string, unknown>[];
    const som = (k: string) => r2(cd.reduce((s, p) => s + num(p[k]), 0));
    // Points d'AVRIL et de DÉCEMBRE (le point m est le mois m+1 ; startMonth=0 ⇒ index 3 = avril).
    const avr = cd.filter((_, i) => (i + 1) % 12 === 4).map(p => num(p.FluxImpots));
    const dec = cd.filter((_, i) => (i + 1) % 12 === 0);
    return {
        label,
        finalNetWorth: r2(num(res.finalNetWorth)),
        estateNetWorth: r2(num(res.estateNetWorth)),
        totalTaxesPaid: r2(num(res.totalTaxesPaid)),
        unsettledTaxAtHorizon: r2(num(res.unsettledTaxAtHorizon)),
        totalEstateTax: r2(num(res.totalEstateTax)),
        totalGrowth: r2(num(res.totalGrowth)),
        points: cd.length,
        sumFluxImpots: som('FluxImpots'),
        sumRetraitREER: som('RetraitREER'),
        sumImpotRetraitREER: som('ImpotRetraitREER'),
        sumImpotDivers: som('ImpotDivers'),
        sumRentalIncome: som('RentalIncome'),
        lastREER: r2(num(cd[cd.length - 1].REER)),
        lastNonReg: r2(num(cd[cd.length - 1].NonReg)),
        lastCELI: r2(num(cd[cd.length - 1].CELI)),
        lastLiquidites: r2(num(cd[cd.length - 1].Liquidites)),
        lastDettesNonImmo: r2(num(cd[cd.length - 1].DettesNonImmo)),
        fluxImpotsAvril: avr.map(r2),
        retraitReerDecembre: dec.map(p => r2(num(p.RetraitREER))),
        reerDecembre: dec.map(p => r2(num(p.REER))),
    };
};

const main = async () => {
    const mod = await import(enginePath);
    const run = mod.__runScenarioForTests as (p: unknown, s: string, mc?: boolean, d?: boolean) => Record<string, unknown>;
    const out = [
        resume('F_MELT / MELTDOWN_REER', run(F_MELT, 'MELTDOWN_REER', false, false)),
        resume('F_MELT / AUTO_MARGINAL (contrôle : meltdown DÉBRANCHÉ)', run(F_MELT, 'AUTO_MARGINAL', false, false)),
        resume('F_MELT_DEC / MELTDOWN_REER (+ locatif)', run(F_MELT_DEC, 'MELTDOWN_REER', false, false)),
        resume('F_AVRIL / AUTO_MARGINAL', run(F_AVRIL, 'AUTO_MARGINAL', false, false)),
        resume('F_ROOM / PRIO_REER (droits REER saturants)', run(F_ROOM, 'PRIO_REER', false, false)),
    ];
    console.log(JSON.stringify(out, null, 1));
};

main().catch((e) => { console.error(e); process.exit(1); });
