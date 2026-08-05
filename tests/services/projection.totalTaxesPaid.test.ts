// tests/services/projection.totalTaxesPaid.test.ts
//
// [PROJ-TTP-DOUBLECOUNT] (panel #551 MESURÉ, corrigé 2026-08-01) — « Impôt à vie » = les flux
// d'impôt réellement DÉBITÉS du liquide, c.-à-d. Σ FluxImpots : avril débite le bucket `.reer`
// ENTIER (retenues cascade + meltdown + FERR, provisionnées) + le complément `.revenu` de
// décembre — la retenue « n'est débitée qu'UNE fois, en avril » (contrat FISC-REER-WHT-DOUBLE).
// L'ancien compteur ajoutait EN PLUS `rrspWithholdingMois` et `taxOnRrif` → les mêmes dollars
// comptés deux fois : MELTDOWN affichait 321 122 $ pour 131 871 $ réels (+144 %), AUTO
// 229 338 $ pour 29 806 $. DISCRIMINANT : sur l'ancien code, l'identité du 1er test casse de
// +189 251 $ (meltdown), +199 532 $ (auto) et +59 131 $ (FERR).

import { describe, it, expect } from 'vitest';
import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal } from '../../types';
import type { AllocationStrategy } from '../../services/projection/types';

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

const projection: ProjectionConfig = {
    years: 25, returnRate: 5, inflationRate: 2, savingsMode: 'manual', manualContribution: 0,
    usePortfolioRate: false, returnRates: { celi: 5, reer: 5, nonReg: 5, crypto: 6, cash: 1 },
    emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3,
};
const config: BudgetConfig = {
    users: [
        { name: 'M', grossSalary: 0, netSalary: 0, color: '#fff', age: 62, birthYear: 1964, canadaArrivalYear: 1964, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
        { name: 'A', grossSalary: 0, netSalary: 0, color: '#fff', age: 62, birthYear: 1964, canadaArrivalYear: 1964, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
    ], splitMode: '50/50',
};
const base = (over: Partial<SimulationParams> = {}): SimulationParams => ({
    projection, calculatedStartingCash: 20_000,
    liveCSVBalances: { CELI: 0, CELIAPP: 0, REER: 700_000, NON_ENREG: 0, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: { targetAge: 60, targetMonthlyIncome: 4500, governmentPension: 1500, lifeExpectancy: 95 } as RetirementGoal,
    config, baseGrossAnnual: 0, baseNetAnnual: 0, currentRentExpense: 0, baseMonthlyExpenses: 3_800,
    startYear: 2026, startMonth: 0, ...over,
} as SimulationParams);

// Fixture FERR (couple 73 ans, pension couvre les dépenses — les retenues RRIF dominent).
const ferrParams = base({
    projection: { ...projection, years: 10, returnRates: { celi: 3, reer: 3, nonReg: 3, crypto: 4, cash: 1 } },
    liveCSVBalances: { CELI: 0, CELIAPP: 0, REER: 400_000, NON_ENREG: 0, CRYPTO: 0, REEE: 0 },
    retirementGoal: { targetAge: 60, targetMonthlyIncome: 3000, governmentPension: 4500, lifeExpectancy: 95 } as RetirementGoal,
    baseMonthlyExpenses: 2_800,
    config: { ...config, users: config.users.map(u => ({ ...u, age: 73, birthYear: 1953 })) as typeof config.users },
});

const run = (p: SimulationParams, s: string) => __runScenarioForTests(p, s as AllocationStrategy, false, false);
const sumFlux = (r: ReturnType<typeof run>): number =>
    (r.chartData as Array<Record<string, unknown>>).reduce((s, d) => s + num(d.FluxImpots), 0);

describe('[PROJ-TTP-DOUBLECOUNT] totalTaxesPaid = Σ FluxImpots (les retenues ne comptent qu\'une fois)', () => {
    it('IDENTITÉ sur 3 scénarios : meltdown, cascade, FERR — ± 1 $ (échoue de +59 k à +199 k avant)', () => {
        for (const [p, s, minTax] of [
            [base(), 'MELTDOWN_REER', 100_000],
            [base(), 'AUTO_MARGINAL', 20_000],
            [ferrParams, 'AUTO_MARGINAL', 4_000],
        ] as const) {
            const r = run(p, s);
            expect(r.totalTaxesPaid).toBeGreaterThan(minTax); // non-vacuité : de l'impôt coule vraiment
            expect(Math.abs(r.totalTaxesPaid - sumFlux(r))).toBeLessThan(1);
        }
    });

    it('NEUTRALITÉ NW : le fix du compteur ne touche AUCUN patrimoine (goldens mesurés avant/après)', () => {
        // Mesuré identique avant/après le fix TTP (compteur d'affichage pur). Re-basé SCIEMMENT
        // 2026-08-01 ([FISC-BRACKET-REALINDEX], était 3627,79 / 375783,25) : le fix des paliers
        // réels est un VRAI changement fiscal (impôt tardif ↑ → NW ↓) — la neutralité du COMPTEUR,
        // elle, reste garantie par l'identité ttp == Σ FluxImpots du 1er test.
        expect(run(base(), 'MELTDOWN_REER').finalNetWorth).toBeCloseTo(-7169.52, 0);
        expect(run(ferrParams, 'AUTO_MARGINAL').finalNetWorth).toBeCloseTo(372625.14, 0);
    });

    it('[ENG-TTP-UNSETTLED-HORIZON] la dette fiscale réconciliée non réglée à l\'horizon est EXPOSÉE', () => {
        // La dernière année réconciliée par décembre n'a jamais son avril → son débit échappe au
        // compteur. `unsettledTaxAtHorizon` = EXACTEMENT ce qu'avril aurait débité (les 4 buckets
        // SIGNÉS — le panel #554 annonçait 5 815 $ sur la fixture FERR en sommant le BRUT ; le NET
        // réel y est 171,89 $ car la réconciliation contient un remboursement qui compense la
        // retenue RRIF). Discriminant : le champ n'existe pas sur l'ancien code (undefined).
        const solvable = base({
            projection: { ...projection, years: 10, returnRate: 4, returnRates: { celi: 4, reer: 4, nonReg: 4, crypto: 5, cash: 1 } },
            calculatedStartingCash: 10_000,
            liveCSVBalances: { CELI: 0, CELIAPP: 0, REER: 1_500_000, NON_ENREG: 0, CRYPTO: 0, REEE: 0 },
            retirementGoal: { targetAge: 60, targetMonthlyIncome: 8000, governmentPension: 800, lifeExpectancy: 95 } as RetirementGoal,
            baseMonthlyExpenses: 7_000,
        });
        const rs = run(solvable, 'AUTO_MARGINAL');
        // Solvable 10 ans : vraie dette nette au dernier décembre (mesuré 16 404,67 — re-basé
        // [FISC-BRACKET-REALINDEX] 2026-08-01, était 13 542,07 : impôt réel tardif ↑).
        expect(rs.unsettledTaxAtHorizon).toBeCloseTo(16_404.67, 0);
        // FERR 10 ans : net PETIT (remboursement compense la retenue) — pin de la sémantique NETTE
        // (re-basé, était 171,89).
        expect(run(ferrParams, 'AUTO_MARGINAL').unsettledTaxAtHorizon).toBeCloseTo(907.71, 0);
        // Portefeuille épuisé avant la fin : plus d'impôt la dernière année → 0 (jamais un fantôme).
        expect(Math.abs(run(base(), 'MELTDOWN_REER').unsettledTaxAtHorizon ?? Number.NaN)).toBeLessThan(1);

        // ADDITIVITÉ (contre-vérif #555, la propriété la plus discriminante — exacte au cent) :
        // l'unsettled du run N == le FluxImpots d'avril du run N+1 ⇒ TTP(N) + unsettled(N) == TTP(N+1)
        // (le seul flux d'impôt des mois N*12..N*12+11 est cet avril).
        const solvable11 = { ...solvable, projection: { ...solvable.projection, years: 11 } } as SimulationParams;
        expect((rs.totalTaxesPaid ?? 0) + (rs.unsettledTaxAtHorizon ?? 0))
            .toBeCloseTo(run(solvable11, 'AUTO_MARGINAL').totalTaxesPaid, 0); // mesuré : 184 686,88 des deux côtés

        // SIGNE : année finale en REMBOURSEMENT net (salarié PRIO_REER, grosses déductions) →
        // négatif porté honnêtement, aucun clamp (re-basé [FISC-WHT-92PCT] 2026-08-01, était
        // −17 159,55 : retenue 100 % → remboursement d'avril plus gros de 8 % de l'impôt employeur).
        const salarie = base({
            liveCSVBalances: { CELI: 0, CELIAPP: 0, REER: 100_000, NON_ENREG: 0, CRYPTO: 0, REEE: 0 },
            projection: { ...projection, years: 10, returnRate: 4, returnRates: { celi: 4, reer: 4, nonReg: 4, crypto: 5, cash: 1 } },
            calculatedStartingCash: 10_000,
            retirementGoal: { targetAge: 75, targetMonthlyIncome: 8000, governmentPension: 800, lifeExpectancy: 95 } as RetirementGoal,
            config: { ...config, users: config.users.map(u => ({ ...u, grossSalary: 10_000, netSalary: 7_000, age: 45, birthYear: 1981 })) as typeof config.users },
            baseGrossAnnual: 240_000, baseNetAnnual: 168_000, baseMonthlyExpenses: 9_000,
        });
        expect(run(salarie, 'PRIO_REER').unsettledTaxAtHorizon).toBeCloseTo(-23_552.86, 0);
    });

    it('ratio MELT/AUTO borné (~2,8 mesuré post-REALINDEX, était ~4,4) — PAS un pin d\'ordre du ranking complet', () => {
        // ⚠️ Le validator #554 a MESURÉ que l'ordre de rankStrategies CHANGE avec le compteur
        // corrigé (balanced : best PRIO_REER → MELTDOWN sur le retraité 62) — voulu, l'ancien
        // ordre reposait sur le double-comptage. Le pin d'ordre COMPLET (objectifs tax/balanced)
        // est le ticket [ENG-RANKING-ORDER-PIN]. Ici : la paire MELT/AUTO seulement.
        const melt = run(base(), 'MELTDOWN_REER');
        const auto = run(base(), 'AUTO_MARGINAL');
        const ratio = melt.totalTaxesPaid / auto.totalTaxesPaid;
        expect(ratio).toBeGreaterThan(2);   // discriminant : ancien code = 1,400 → échoue
        expect(ratio).toBeLessThan(8);      // borné (un ×20 signalerait une régression d'assiette)
    });
});
