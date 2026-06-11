import { describe, it, expect } from 'vitest';
import {
    generateStrategySpace,
    countConfigs,
    estimateRuntimeMs,
    configToEngine,
    ASSET_LOCATION_BONUS_PP,
    type LeverSelection,
    type SpaceContext,
} from '../../services/projection/strategySpace';
import { RETURN_RATE_PRESETS, type StrategyConfig } from '../../services/projection/strategyConfig';
import type { SimulationParams } from '../../services/projection';
import type { BudgetConfig, ProjectionConfig } from '../../types';

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
        } as unknown as ProjectionConfig,
        calculatedStartingCash: 25000,
        liveCSVBalances: { CELI: 30000, CELIAPP: 0, REER: 50000, NON_ENREG: 10000, CRYPTO: 0, REEE: 0 },
        realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
        retirementGoal: { targetAge: 65, targetMonthlyIncome: 5000, governmentPension: 1500 },
        config: { users: [{ name: 'T', grossSalary: 5000, netSalary: 3500, color: '#0f0', age: 35, birthYear: 1991, canadaArrivalYear: 1991, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 }], splitMode: '50/50' } as unknown as BudgetConfig,
        baseGrossAnnual: 114000, baseNetAnnual: 80400, currentRentExpense: 1500,
        baseMonthlyExpenses: 5000, startYear: 2026, startMonth: 0,
    });

    // StrategyConfig « tous défauts » ; on surcharge juste le levier testé.
    const cfg = (over: Partial<StrategyConfig> = {}): StrategyConfig => ({
        withdrawalOrder: 'AUTO_MARGINAL', delayPensions: false, retirementAge: 65, skipRap: false,
        contributionOrder: 'CELI_FIRST', retirementSpending: 1, smithManoeuvre: false, debtFirst: false,
        emergencyFundMonths: 6, assetLocation: false, gainHarvesting: false,
        returnRateProfile: 'balanced', pensionSplitting: true, ...over,
    });

    it('traduit les leviers en clone params + overrides, sans muter la base', () => {
        const base = baseParams();
        const args = configToEngine({
            withdrawalOrder: 'PRIO_REER', delayPensions: true, retirementAge: 60,
            skipRap: true, contributionOrder: 'REER_FIRST', retirementSpending: 1.1,
            smithManoeuvre: true, debtFirst: true, emergencyFundMonths: 12, assetLocation: true,
            gainHarvesting: false,
            returnRateProfile: 'balanced',
            pensionSplitting: true,
        }, base);

        expect(args.strategy).toBe('PRIO_REER');
        expect(args.delayPensions).toBe(true);
        expect(args.params.retirementGoal.targetAge).toBe(60);
        expect(args.params.retirementGoal.targetMonthlyIncome).toBe(5500); // 5000 × 1.1
        expect(args.params.projection.emergencyFundMonths).toBe(12);
        expect((args.params.projection as ProjectionConfig & { useSmithManoeuvre?: boolean }).useSmithManoeuvre).toBe(true);
        // Le profil de rendement N'EST PAS un EngineOverride : il agit sur returnRates,
        // pas sur les overrides (cf. *.returnProfile.test.ts).
        expect(args.overrides).toEqual({
            skipRapForPurchase: true, contributionOrder: 'REER_FIRST', debtFirst: true,
            gainHarvesting: false,
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
            gainHarvesting: false,
            returnRateProfile: 'balanced',
            pensionSplitting: true,
        }, base);
        const on = configToEngine({
            withdrawalOrder: 'AUTO_MARGINAL', delayPensions: false, retirementAge: 65,
            skipRap: false, contributionOrder: 'CELI_FIRST', retirementSpending: 1,
            smithManoeuvre: false, debtFirst: false, emergencyFundMonths: 6, assetLocation: true,
            gainHarvesting: false,
            returnRateProfile: 'balanced',
            pensionSplitting: true,
        }, base);

        expect(off.params.projection.returnRates!.nonReg).toBe(baseNonReg); // inchangé sans le levier
        // Bonus appliqué à TOUS les comptes (le moteur draine le NonReg vers CELI/REER,
        // un bonus NonReg-seul s'évaporerait → on relève le rendement mélangé).
        expect(on.params.projection.returnRates!.nonReg).toBeGreaterThan(baseNonReg);
        expect(on.params.projection.returnRates!.celi).toBeGreaterThan(base.projection.returnRates!.celi);
        expect(on.params.projection.returnRates!.reer).toBeGreaterThan(base.projection.returnRates!.reer);
        // Immutabilité : la base n'a pas bougé.
        expect(base.projection.returnRates!.nonReg).toBe(baseNonReg);
    });

    // ----- PH4-FUT-B : levier profil de rendement dans configToEngine -----

    it("returnRateProfile='aggressive' → params.returnRates = preset agressif (exact)", () => {
        const base = baseParams();
        const args = configToEngine(cfg({ returnRateProfile: 'aggressive' }), base);
        expect(args.params.projection.returnRates).toEqual(RETURN_RATE_PRESETS.aggressive);
        // Le profil ne fuit PAS dans les overrides (c'est un effet returnRates).
        expect(args.overrides).not.toHaveProperty('returnRateProfile');
        // Immutabilité : la base garde ses taux.
        expect(base.projection.returnRates).toEqual({ celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 });
    });

    it("returnRateProfile='conservative' → params.returnRates = preset conservateur (exact)", () => {
        const args = configToEngine(cfg({ returnRateProfile: 'conservative' }), baseParams());
        expect(args.params.projection.returnRates).toEqual(RETURN_RATE_PRESETS.conservative);
    });

    it("returnRateProfile='balanced' → params.returnRates = baseRates du params (inchangés)", () => {
        const base = baseParams();
        const args = configToEngine(cfg({ returnRateProfile: 'balanced' }), base);
        expect(args.params.projection.returnRates).toEqual(base.projection.returnRates);
        expect(args.params.projection.returnRates).toEqual({ celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 });
    });

    it("'aggressive' + assetLocation=true → preset agressif + 0.4pp sur celi/reer/nonReg (cumul exact, pas de double application)", () => {
        const base = baseParams();
        const args = configToEngine(cfg({ returnRateProfile: 'aggressive', assetLocation: true }), base);
        const p = RETURN_RATE_PRESETS.aggressive;
        const b = ASSET_LOCATION_BONUS_PP;
        // celi/reer/nonReg = preset + bonus UNE seule fois ; crypto/cash = preset nu (pas de bonus).
        expect(args.params.projection.returnRates).toEqual({
            celi: p.celi + b,     // 9   + 0.4 = 9.4
            reer: p.reer + b,     // 8.5 + 0.4 = 8.9
            nonReg: p.nonReg + b, // 8.5 + 0.4 = 8.9
            crypto: p.crypto,     // 14  (pas de bonus asset-location)
            cash: p.cash,         // 3
        });
        // Garde anti-régression : pas de double bonus (≠ preset + 0.8).
        expect(args.params.projection.returnRates!.celi).toBeCloseTo(9.4, 10);
        // Le preset source n'a pas été muté par l'addition du bonus.
        expect(RETURN_RATE_PRESETS.aggressive).toEqual({ celi: 9, reer: 8.5, nonReg: 8.5, crypto: 14, cash: 3 });
    });

    it("'balanced' + assetLocation=true → baseRates + 0.4pp (le bonus s'empile sur les taux courants, pas sur un preset)", () => {
        const base = baseParams();
        const args = configToEngine(cfg({ returnRateProfile: 'balanced', assetLocation: true }), base);
        const r = base.projection.returnRates!;
        const b = ASSET_LOCATION_BONUS_PP;
        expect(args.params.projection.returnRates).toEqual({
            celi: r.celi + b, reer: r.reer + b, nonReg: r.nonReg + b, crypto: r.crypto, cash: r.cash,
        });
    });

    // ----- PH4-FUT-B : levier fractionnement de pension dans configToEngine -----

    it('pensionSplitting transite par params.projection.appliedPensionSplitting (recherche ↔ courbe)', () => {
        const off = configToEngine(cfg({ pensionSplitting: false }), baseParams());
        expect(off.params.projection.appliedPensionSplitting).toBe(false);
        const on = configToEngine(cfg({ pensionSplitting: true }), baseParams());
        expect(on.params.projection.appliedPensionSplitting).toBe(true);
        // Comme le profil, le flag n'est PAS un EngineOverride (il est lu par runScenario → DecemberContext).
        expect(off.overrides).not.toHaveProperty('pensionSplitting');
    });
});
