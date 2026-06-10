// tests/services/projection.overdraft.test.ts
//
// [PV-1] Conservation du patrimoine quand un DÉBIT DIRECT du liquide dépasse le
// solde disponible (impôt d'avril, véhicule/réno W5, échéance d'objectif).
//
// Bug corrigé : le liquide devenait négatif, puis applyMidMonthGrowth le clampait
// à 0 (`Math.max(0, …)`, helpers.ts) → la dette était EFFACÉE silencieusement et le
// patrimoine projeté surévalué du montant du découvert. Correctif (choix Marc
// 2026-06-10) : sauvetage AVANT la croissance — le découvert est couvert par la
// même cascade de retraits que le shortfall régulier (vente CELI/REER/NonReg).
//
// Déclencheur de test : une rénovation majeure (subtractLiquid direct, date unique,
// déterministe) >> liquide disponible. Le MÊME chemin de sauvetage couvre l'impôt
// d'avril (subtractLiquid identique dans taxApril.ts).

import { describe, it, expect } from 'vitest';
import { calculateFutureProjection, type SimulationParams } from '../../services/projection';
import type { ProjectionResult, ProjectionChartPoint } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal } from '../../types';

const makeProjection = (overrides: Partial<ProjectionConfig> = {}): ProjectionConfig => ({
    years: 10,
    returnRate: 6,
    inflationRate: 2,
    savingsMode: 'manual',
    manualContribution: 1500,
    usePortfolioRate: false,
    returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
    emergencyFundMonths: 6,
    salaryGrowth: 2,
    propertyGrowthRate: 3,
    ...overrides,
});

const makeConfig = (): BudgetConfig => ({
    users: [
        {
            name: 'Alex', grossSalary: 7700, netSalary: 5300, color: '#10b981',
            age: 35, birthYear: 1991, canadaArrivalYear: 1991,
            hasOwnedPropertyLast4Years: false,
            celiContributed: 0, rrspContributed: 0,
        },
        {
            name: 'Sam', grossSalary: 6000, netSalary: 4210, color: '#3b82f6',
            age: 33, birthYear: 1993, canadaArrivalYear: 1993,
            hasOwnedPropertyLast4Years: false,
            celiContributed: 0, rrspContributed: 0,
        },
    ],
    splitMode: '50/50',
});

const makeRetirementGoal = (): RetirementGoal => ({
    targetAge: 60,
    targetMonthlyIncome: 5500,
    governmentPension: 1850,
    lifeExpectancy: 92,
});

const BALANCES = { CELI: 200_000, CELIAPP: 0, REER: 12_500, NON_ENREG: 3_500, CRYPTO: 0, REEE: 0 };

const makeParams = (overrides: Partial<SimulationParams> = {}): SimulationParams => ({
    projection: makeProjection(),
    calculatedStartingCash: 8_500,
    liveCSVBalances: BALANCES,
    realEstateGoals: [],
    debts: [],
    childGoals: [],
    travelGoals: [],
    lifeEvents: [],
    retirementGoal: makeRetirementGoal(),
    config: makeConfig(),
    baseGrossAnnual: 164_400,
    baseNetAnnual: 114_120,
    currentRentExpense: 1_500,
    baseMonthlyExpenses: 5_000,
    startYear: 2026,
    startMonth: 0,
    ...overrides,
});

// Rénovation à 2026-07-15 → monthIndex 6 ; coût >> liquide (~8,5 k$ + surplus de 6 mois).
const RENO_COST = 120_000;
const RENO_MONTH = 6;

const run = (params: SimulationParams): ProjectionResult => calculateFutureProjection(params);

const pointAt = (r: ProjectionResult, mi: number): ProjectionChartPoint => {
    const p = r.chartData.find(pt => pt.monthIndex === mi);
    expect(p, `point monthIndex=${mi} absent`).toBeTruthy();
    return p as ProjectionChartPoint;
};

describe('[PV-1] Découvert de liquidités — conservation du patrimoine', () => {
    const baseline = run(makeParams());
    const withReno = run(makeParams({
        majorRenovations: [{ id: 'reno-1', date: '2026-07-15', cost: RENO_COST, description: 'agrandissement' }],
    }));

    it('le débit direct réduit RÉELLEMENT le patrimoine du plein montant (pas effacé par le clamp)', () => {
        // Avant le fix : seul le liquide disponible (≤ coussin, ~10-40 k$) était perdu,
        // le reste du découvert était clampé → l'écart de NW restait << coût réel.
        const nwBase = pointAt(baseline, RENO_MONTH + 1).NetWorth;
        const nwReno = pointAt(withReno, RENO_MONTH + 1).NetWorth;
        const delta = nwBase - nwReno;
        // Plein coût (±retenue REER éventuelle, ±1 mois d'écart de croissance sur les soldes).
        expect(delta).toBeGreaterThan(RENO_COST * 0.9);
        expect(delta).toBeLessThan(RENO_COST * 1.25);
    });

    it('conservation : la perte de patrimoine persiste (pas un trou re-rempli plus tard)', () => {
        // Anti-régression discriminante (revue) : avant le fix, le découvert clampé revenait à
        // « cadeau » — la trajectoire post-réno restait quasi-parallèle à la baseline. Avec le
        // fix, l'écart de NW doit RESTER de l'ordre du coût (modulo croissance composée sur des
        // soldes plus bas) un an plus tard, pas se refermer.
        const nwBase12 = pointAt(baseline, RENO_MONTH + 12).NetWorth;
        const nwReno12 = pointAt(withReno, RENO_MONTH + 12).NetWorth;
        expect(nwBase12 - nwReno12).toBeGreaterThan(RENO_COST * 0.85);
    });

    it('le découvert est couvert par la cascade (retraits visibles) + événement journalisé', () => {
        const p = pointAt(withReno, RENO_MONTH);
        // NetTransferNonReg < 0 = vente nette NonReg ce mois (le chart n'expose pas de
        // champ withdrawalNonReg — revue PV-1).
        const soldNonReg = Math.max(0, -(Number(p.NetTransferNonReg) || 0));
        const totalDrawn = (p.RetraitCELI || 0) + (p.RetraitREER || 0) + soldNonReg;
        // La quasi-totalité du coût excède le liquide → la cascade doit avoir vendu.
        expect(totalDrawn).toBeGreaterThan(RENO_COST * 0.5);
        const flows = (p.flowEvents ?? []).join(' | ');
        expect(flows).toContain('Découvert de liquidités couvert');
    });

    it('sans débit direct, aucun événement de sauvetage (pas de faux positifs)', () => {
        for (const p of baseline.chartData) {
            const flows = (p.flowEvents ?? []).join(' | ');
            expect(flows).not.toContain('Découvert de liquidités');
        }
    });
});
