import { describe, it, expect } from 'vitest';
import {
    generateStrategySpace,
    countConfigs,
    estimateRuntimeMs,
    configToEngine,
    type LeverSelection,
    type SpaceContext,
} from '../../services/projection/strategySpace';
import type { SimulationParams } from '../../services/projection';

const ctx = (over: Partial<SpaceContext> = {}): SpaceContext => ({
    hasPrimaryPurchase: true, currentAge: 35, ...over,
});

describe('strategySpace — génération & dédoublonnage', () => {
    it('sélection vide → 1 config (tous les défauts)', () => {
        expect(countConfigs({}, ctx())).toBe(1);
        expect(generateStrategySpace({}, ctx())).toHaveLength(1);
    });

    it('produit cartésien : 4 ordres × 5 âges = 20 configs', () => {
        const sel: LeverSelection = {
            withdrawalOrder: ['AUTO_MARGINAL', 'PRIO_REER', 'PRIO_CELI', 'MELTDOWN_REER'],
            retirementAge: [55, 58, 60, 63, 65],
        };
        expect(countConfigs(sel, ctx())).toBe(20);
        expect(generateStrategySpace(sel, ctx())).toHaveLength(20);
    });

    it('skipRap collapse si pas d\'achat immo prévu', () => {
        const sel: LeverSelection = { skipRap: [false, true] };
        expect(countConfigs(sel, ctx({ hasPrimaryPurchase: false }))).toBe(1); // collapse
        expect(countConfigs(sel, ctx({ hasPrimaryPurchase: true }))).toBe(2); // gardé
    });

    it('âges de retraite < âge actuel filtrés', () => {
        const sel: LeverSelection = { retirementAge: [55, 58, 60, 63, 65] };
        // À 60 ans, seuls 60/63/65 restent.
        expect(countConfigs(sel, ctx({ currentAge: 60 }))).toBe(3);
    });

    it('doublons dans la sélection dédupliqués', () => {
        const sel: LeverSelection = { emergencyFundMonths: [6, 6, 12] };
        expect(countConfigs(sel, ctx())).toBe(2);
    });

    it('toutes les configs générées sont complètes (10 leviers définis)', () => {
        const configs = generateStrategySpace({ withdrawalOrder: ['PRIO_REER', 'PRIO_CELI'] }, ctx());
        for (const c of configs) {
            expect(c.withdrawalOrder).toBeDefined();
            expect(c.retirementAge).toBeDefined();
            expect(typeof c.skipRap).toBe('boolean');
            expect(typeof c.smithManoeuvre).toBe('boolean');
            expect(c.emergencyFundMonths).toBeGreaterThan(0);
        }
    });
});

describe('strategySpace — estimateRuntimeMs', () => {
    it('produit configs × itérations × coût', () => {
        expect(estimateRuntimeMs(240, 1000, 2)).toBe(480_000);
        expect(estimateRuntimeMs(80, 1000, 1)).toBe(80_000);
    });
});

describe('strategySpace — configToEngine', () => {
    const baseParams = (): SimulationParams => ({
        projection: {
            years: 30, returnRate: 6, inflationRate: 2, savingsMode: 'manual',
            manualContribution: 1500, usePortfolioRate: false,
            returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
            emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3,
            useSmithManoeuvre: false,
        } as any,
        calculatedStartingCash: 25000,
        liveCSVBalances: { CELI: 30000, CELIAPP: 0, REER: 50000, NON_ENREG: 10000, CRYPTO: 0, REEE: 0 },
        realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
        retirementGoal: { targetAge: 65, targetMonthlyIncome: 5000, governmentPension: 1500 },
        config: { users: [{ name: 'T', grossSalary: 5000, netSalary: 3500, color: '#0f0', age: 35, birthYear: 1991, canadaArrivalYear: 1991, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 }], splitMode: '50/50' } as any,
        baseGrossAnnual: 114000, baseNetAnnual: 80400, currentRentExpense: 1500,
        baseMonthlyExpenses: 5000, startYear: 2026, startMonth: 0,
    });

    it('traduit les leviers en clone params + overrides, sans muter la base', () => {
        const base = baseParams();
        const args = configToEngine({
            withdrawalOrder: 'PRIO_REER', delayPensions: true, retirementAge: 60,
            skipRap: true, contributionOrder: 'REER_FIRST', retirementSpending: 1.1,
            smithManoeuvre: true, debtFirst: true, emergencyFundMonths: 12, assetLocation: true,
        }, base);

        expect(args.strategy).toBe('PRIO_REER');
        expect(args.delayPensions).toBe(true);
        expect(args.params.retirementGoal.targetAge).toBe(60);
        expect(args.params.retirementGoal.targetMonthlyIncome).toBe(5500); // 5000 × 1.1
        expect(args.params.projection.emergencyFundMonths).toBe(12);
        expect((args.params.projection as any).useSmithManoeuvre).toBe(true);
        expect(args.overrides).toEqual({
            skipRapForPurchase: true, contributionOrder: 'REER_FIRST', debtFirst: true,
        });

        // Immutabilité : la base n'a pas bougé.
        expect(base.retirementGoal.targetAge).toBe(65);
        expect(base.retirementGoal.targetMonthlyIncome).toBe(5000);
        expect(base.projection.emergencyFundMonths).toBe(6);
    });

    it('assetLocation=true applique un bonus de rendement au compte NonReg', () => {
        const base = baseParams();
        const baseNonReg = base.projection.returnRates!.nonReg; // 6
        const off = configToEngine({
            withdrawalOrder: 'AUTO_MARGINAL', delayPensions: false, retirementAge: 65,
            skipRap: false, contributionOrder: 'CELI_FIRST', retirementSpending: 1,
            smithManoeuvre: false, debtFirst: false, emergencyFundMonths: 6, assetLocation: false,
        }, base);
        const on = configToEngine({
            withdrawalOrder: 'AUTO_MARGINAL', delayPensions: false, retirementAge: 65,
            skipRap: false, contributionOrder: 'CELI_FIRST', retirementSpending: 1,
            smithManoeuvre: false, debtFirst: false, emergencyFundMonths: 6, assetLocation: true,
        }, base);

        expect(off.params.projection.returnRates!.nonReg).toBe(baseNonReg); // inchangé
        expect(on.params.projection.returnRates!.nonReg).toBeGreaterThan(baseNonReg); // bonus
        // Les autres comptes ne bougent pas.
        expect(on.params.projection.returnRates!.celi).toBe(base.projection.returnRates!.celi);
        // Immutabilité : la base n'a pas bougé.
        expect(base.projection.returnRates!.nonReg).toBe(baseNonReg);
    });
});
