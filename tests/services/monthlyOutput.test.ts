/**
 * [ENG-MONTHLYOUTPUT-TEST] buildMonthlyDataPoint — seul des sous-modules de
 * `services/projection/` qui assemblait le ProjectionChartPoint mensuel SANS
 * test direct (audit financier 2026-06-17, finding L2). Fonction pure
 * ctx→point : on vérifie (1) le mode Monte-Carlo minimal, (2) les mappings
 * DÉRIVÉS non triviaux (formules de dette, diff, Max, NetTransfer, arrondi)
 * — là où une régression de câblage passerait silencieusement, car les
 * invariants de conservation ne testent QUE NetWorth, pas les ~100 champs UI.
 */
import { describe, it, expect } from 'vitest';
import { buildMonthlyDataPoint, type MonthlyOutputCtx } from '../../services/projection/monthlyOutput';

/** Factory : tous les champs à 0 / valeurs neutres, surchargés par test. */
const makeCtx = (overrides: Partial<MonthlyOutputCtx> = {}): MonthlyOutputCtx => ({
    m: 0,
    retirementMonthIndex: 240,
    fireTargetNetWorth: 0,
    futureFireTarget: 0,
    simInflation: 2,
    expenseMultiplier: 1,
    effectiveBaseExpenses: 0,
    enableMonteCarlo: false,
    rawNetWorth: 0,
    currentLoopDate: new Date(2026, 0, 15),
    loopYear: 2026,
    age: 40,
    isRetired: false,
    incomeMarc: 0,
    incomeAnna: 0,
    incomeRetirement: 0,
    monthlyIncome: 0,
    monthlyExpenses: 0,
    childMonthlyCost: 0,
    childGrossCost: 0,
    childBenefits: 0,
    reeeContribMonthly: 0,
    reeePayoutMonthly: 0,
    reeeContribCum: 0,
    reeeGrantsCum: 0,
    dividendIncome: 0,
    taxableInvIncome: 0,
    marginalTaxRate: 0,
    effectiveTaxRate: 0,
    pensionRRQ: 0,
    pensionPSV: 0,
    pensionPrivee: 0,
    immoHypo: 0,
    immoCharges: 0,
    immoInterest: 0,
    immoPrincipal: 0,
    totalRentalIncome: 0,
    liquid: 0,
    celi: 0,
    celiapp: 0,
    reer: 0,
    reee: 0,
    nonReg: 0,
    crypto: 0,
    retraitReerMois: 0,
    retraitCeliMois: 0,
    celiRoom: 0,
    rrspRoom: 0,
    fhsaRoom: 0,
    rapRepaymentDueTotal: 0,
    realEstateEquity: 0,
    mortgageBalance: 0,
    activeDebtsTotal: 0,
    liquidDebt: 0,
    smithManoeuvreDebt: 0,
    prevNW: 0,
    prevCELI: 0,
    prevREER: 0,
    prevLiquid: 0,
    impotLatent: 0,
    fluxImpots: 0,
    impotReerMois: 0,
    impotSalaireMois: 0,
    impotGainsMois: 0,
    impotDiversMois: 0,
    taxPaidRevenu: 0,
    taxPaidGains: 0,
    taxPaidDivers: 0,
    taxPaidREER: 0,
    taxOnRrif: 0,
    contribCELI: 0,
    withdrawalCELI: 0,
    contribREER: 0,
    withdrawalREER: 0,
    contribNonReg: 0,
    withdrawalNonReg: 0,
    contribCrypto: 0,
    withdrawalCrypto: 0,
    contribLiquid: 0,
    withdrawalLiquid: 0,
    contribCELIAPP: 0,
    withdrawalCELIAPP: 0,
    contribREEE: 0,
    withdrawalREEE: 0,
    growthCELI: 0,
    growthREER: 0,
    growthNonReg: 0,
    growthCrypto: 0,
    growthLiquid: 0,
    growthCELIAPP: 0,
    growthREEE: 0,
    growthPctCELI: 0,
    growthPctREER: 0,
    growthPctNonReg: 0,
    growthPctCrypto: 0,
    growthPctLiquid: 0,
    growthPctCELIAPP: 0,
    growthPctREEE: 0,
    taxCurrentYear: { revenu: 0, gains: 0, reer: 0, divers: 0 },
    taxPreviousYear: { revenu: 0, gains: 0, reer: 0, divers: 0 },
    lifeEventsLog: [],
    flowEventsLog: [],
    ...overrides,
});

describe('buildMonthlyDataPoint — mode Monte-Carlo', () => {
    it('retourne un point MINIMAL { NetWorth, monthIndex } et rien d’autre', () => {
        const point = buildMonthlyDataPoint(makeCtx({ enableMonteCarlo: true, m: 7, rawNetWorth: 123456.789 }));
        expect(Object.keys(point).sort()).toEqual(['NetWorth', 'monthIndex']);
        expect(point.NetWorth).toBe(123456.79); // arrondi 2 décimales
        expect(point.monthIndex).toBe(7);
    });
});

describe('buildMonthlyDataPoint — mode déterministe : mappings dérivés', () => {
    it('NetWorth = rawNetWorth arrondi à 2 décimales (mappage source unique)', () => {
        // Valeur non-boundary IEEE-754 (la 3e décimale=6 arrondit sans ambiguïté half-even).
        const point = buildMonthlyDataPoint(makeCtx({ rawNetWorth: 250000.456 }));
        expect(point.NetWorth).toBe(250000.46);
    });

    it('monthIndex = m en mode déterministe (pas hardcodé à 0)', () => {
        const point = buildMonthlyDataPoint(makeCtx({ m: 5 }));
        expect(point.monthIndex).toBe(5);
    });

    it('DetteTotale = hypothèque + dettes actives + découvert + HELOC Smith', () => {
        const point = buildMonthlyDataPoint(makeCtx({
            mortgageBalance: 300000, activeDebtsTotal: 15000, liquidDebt: 2000, smithManoeuvreDebt: 50000,
        }));
        expect(point.DetteTotale).toBe(367000);
    });

    it('DettesNonImmo = dettes actives + découvert + HELOC SANS hypothèque [M5/INV-9]', () => {
        // Discriminant : DettesNonImmo NE DOIT PAS inclure l’hypothèque (déjà nette
        // dans Immobilier=équité). Si un refactor la rajoutait, NW reconstruit casserait.
        const point = buildMonthlyDataPoint(makeCtx({
            mortgageBalance: 300000, activeDebtsTotal: 15000, liquidDebt: 2000, smithManoeuvreDebt: 50000,
        }));
        expect(point.DettesNonImmo).toBe(67000);
        expect(point.DettesNonImmo).not.toBe(point.DetteTotale); // l’hypothèque les distingue
    });

    it('reconstructabilité : Σ(actifs, Immobilier=équité) − DettesNonImmo === NetWorth', () => {
        // ctx cohérent : rawNetWorth EST la somme des actifs moins les dettes hors-immo.
        const liquid = 10000, celi = 40000, celiapp = 5000, reer = 80000, reee = 12000, nonReg = 25000, crypto = 8000;
        const realEstateEquity = 150000; // équité déjà nette d’hypothèque
        const activeDebtsTotal = 9000, liquidDebt = 0, smithManoeuvreDebt = 0;
        const assetsSum = liquid + celi + celiapp + reer + reee + nonReg + crypto + realEstateEquity;
        const rawNetWorth = assetsSum - (activeDebtsTotal + liquidDebt + smithManoeuvreDebt);
        const point = buildMonthlyDataPoint(makeCtx({
            liquid, celi, celiapp, reer, reee, nonReg, crypto, realEstateEquity,
            activeDebtsTotal, liquidDebt, smithManoeuvreDebt, mortgageBalance: 200000, rawNetWorth,
        }));
        // `?? 0` : ces champs sont optionnels sur ProjectionChartPoint (absents en mode MC) ;
        // en mode déterministe ils sont tous définis — le `?? 0` satisfait tsc strict sans rien changer.
        const reconstructed =
            (point.Liquidites ?? 0) + (point.CELI ?? 0) + (point.CELIAPP ?? 0) + (point.REER ?? 0) + (point.REEE ?? 0) +
            (point.NonReg ?? 0) + (point.Crypto ?? 0) + (point.Immobilier ?? 0) - (point.DettesNonImmo ?? 0);
        expect(reconstructed).toBeCloseTo(point.NetWorth ?? 0, 2);
    });

    it('Savings = revenu − dépenses (flux net)', () => {
        const point = buildMonthlyDataPoint(makeCtx({ monthlyIncome: 6000, monthlyExpenses: 4200 }));
        expect(point.Savings).toBe(1800);
        expect(point.NetSalary).toBe(6000);
    });

    it('diffNW = rawNetWorth − prevNW (variation nette mensuelle)', () => {
        const point = buildMonthlyDataPoint(makeCtx({ rawNetWorth: 251000, prevNW: 250000 }));
        expect(point.diffNW).toBe(1000);
    });

    it('plafonds *Max = espace restant + solde courant (CELI / REER / CELIAPP)', () => {
        const point = buildMonthlyDataPoint(makeCtx({
            celi: 40000, celiRoom: 7000, reer: 80000, rrspRoom: 12000, celiapp: 5000, fhsaRoom: 3000,
        }));
        expect(point.CELIMax).toBe(47000);
        expect(point.REERMax).toBe(92000);
        expect(point.CELIAPPMax).toBe(8000);
    });

    it('NetTransfer = contribution − retrait (CELI et REEE, les deux extrêmes de la liste)', () => {
        const point = buildMonthlyDataPoint(makeCtx({
            contribCELI: 500, withdrawalCELI: 200, contribREEE: 300, withdrawalREEE: 100,
        }));
        expect(point.NetTransferCELI).toBe(300);
        expect(point.NetTransferREEE).toBe(200);
    });

    it('CoastFIRE/FireTarget = futureFireTarget après la retraite (m ≥ retirementMonthIndex)', () => {
        const point = buildMonthlyDataPoint(makeCtx({
            m: 300, retirementMonthIndex: 240, futureFireTarget: 1500000, expenseMultiplier: 1,
        }));
        expect(point.FireTarget).toBe(1500000);
        expect(point.CoastFIRE).toBe(1500000);
    });

    it('AccruedTax* = bucket année courante + bucket année précédente (discrimine une confusion de poste)', () => {
        const point = buildMonthlyDataPoint(makeCtx({
            taxCurrentYear: { revenu: 100, gains: 10, reer: 5, divers: 1 },
            taxPreviousYear: { revenu: 50, gains: 4, reer: 2, divers: 3 },
        }));
        expect(point.AccruedTaxRevenu).toBe(150);
        expect(point.AccruedTaxGains).toBe(14);
        expect(point.AccruedTaxREER).toBe(7);
        expect(point.AccruedTaxDivers).toBe(4);
    });

    it('ExpenseInflationImpact = dépenses × inflation/100/12 (discrimine le facteur 100)', () => {
        const point = buildMonthlyDataPoint(makeCtx({ monthlyExpenses: 3000, simInflation: 2 }));
        expect(point.ExpenseInflationImpact).toBe(5); // 3000 × (2/100/12) = 5,00
        expect(point.ExpenseInflationPct).toBeCloseTo(2 / 12, 2);
    });

    it('realNetWorth = rawNetWorth / expenseMultiplier (déflaté)', () => {
        const point = buildMonthlyDataPoint(makeCtx({ rawNetWorth: 200000, expenseMultiplier: 2 }));
        expect(point.realNetWorth).toBe(100000);
    });

    it('mortgageRemainingMonths = ceil(solde / paiement) quand un paiement existe', () => {
        const point = buildMonthlyDataPoint(makeCtx({ mortgageBalance: 100000, immoHypo: 1500 }));
        expect(point.mortgageRemainingMonths).toBe(Math.ceil(100000 / 1500)); // 67
    });

    it('mortgageRemainingMonths = 0 sans paiement (pas de division par zéro)', () => {
        const point = buildMonthlyDataPoint(makeCtx({ mortgageBalance: 100000, immoHypo: 0 }));
        expect(point.mortgageRemainingMonths).toBe(0);
    });

    it('liquidityRunway = 0 quand les dépenses sont nulles (garde anti-Infinity)', () => {
        const point = buildMonthlyDataPoint(makeCtx({ liquid: 10000, monthlyExpenses: 0 }));
        expect(point.liquidityRunway).toBe(0);
    });

    it('passe-plat des soldes d’actifs (Crypto, Immobilier, LiquidDebt)', () => {
        const point = buildMonthlyDataPoint(makeCtx({ crypto: 8000, realEstateEquity: 150000, liquidDebt: 1234.5 }));
        expect(point.Crypto).toBe(8000);
        expect(point.Immobilier).toBe(150000);
        expect(point.LiquidDebt).toBe(1234.5);
    });

    it('labels passe-plat (age, isRetired) + dateLabel contient l’année', () => {
        const point = buildMonthlyDataPoint(makeCtx({ age: 67, isRetired: true, loopYear: 2053 }));
        expect(point.age).toBe(67);
        expect(point.isRetired).toBe(true);
        expect(point.dateLabel).toContain('2053');
    });
});
