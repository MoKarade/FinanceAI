// tests/services/dailyLedger.test.ts
//
// [FUTUR-DAILY-FULL] Ce que ces tests protègent, et pourquoi.
//
// La ventilation au jour touche à TOUS les montants affichés dans l'infobulle du graphe Futur.
// Deux fautes y sont invisibles à l'œil et chères au dollar :
//   1. classer un SOLDE comme un FLUX (un REER de 31 469 $ deviendrait « 1 049 $ » par jour —
//      crédible, faux d'un facteur 30) ;
//   2. laisser la somme des jours s'écarter du total du mois (l'app afficherait alors DEUX vérités
//      selon le niveau de zoom, exactement ce que la règle « source unique » interdit).
// Le test de classification est GARDÉ PAR LE MOTEUR RÉEL : il énumère les clés que
// `calculateFutureProjection` émet vraiment, donc un champ ajouté au moteur sans classification
// fait ÉCHOUER la suite au lieu de disparaître en silence de la vue au jour.

import { describe, it, expect } from 'vitest';
import { calculateFutureProjection, type SimulationParams } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal } from '../../types';
import type { ProjectionChartPoint } from '../../services/projection/types';
import {
    buildDailyLedger,
    cadenceWeights,
    stockSeries,
    datedContextFor,
    datedDeltasForField,
    dayLabel,
    FIELD_KIND,
    FLOW_CADENCE,
} from '../../services/projection/dailyLedger';

// ── Fixtures moteur (mêmes valeurs que les autres tests de projection) ───────────────────────

const makeProjection = (): ProjectionConfig => ({
    years: 3,
    returnRate: 6,
    inflationRate: 2,
    savingsMode: 'manual',
    manualContribution: 1500,
    usePortfolioRate: false,
    returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
    emergencyFundMonths: 6,
    salaryGrowth: 2,
    propertyGrowthRate: 3,
});

const makeConfig = (): BudgetConfig => ({
    users: [
        { name: 'Test1', grossSalary: 5000, netSalary: 3500, color: '#10b981', age: 35, birthYear: 1991, canadaArrivalYear: 1991, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
        { name: 'Test2', grossSalary: 4500, netSalary: 3200, color: '#3b82f6', age: 33, birthYear: 1993, canadaArrivalYear: 1993, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
    ],
    splitMode: '50/50',
});

const makeRetirementGoal = (): RetirementGoal => ({
    targetAge: 65,
    targetMonthlyIncome: 4500,
    governmentPension: 1500,
});

const makeParams = (): SimulationParams => ({
    projection: makeProjection(),
    calculatedStartingCash: 25000,
    liveCSVBalances: { CELI: 30000, CELIAPP: 0, REER: 50000, NON_ENREG: 10000, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [],
    debts: [],
    childGoals: [],
    travelGoals: [],
    lifeEvents: [],
    retirementGoal: makeRetirementGoal(),
    config: makeConfig(),
    baseGrossAnnual: 114000,
    baseNetAnnual: 80400,
    currentRentExpense: 1500,
    baseMonthlyExpenses: 5000,
    startYear: 2026,
    startMonth: 0,
});

const engineMonths = (): ProjectionChartPoint[] => {
    const res = calculateFutureProjection(makeParams(), false, 0);
    return res.chartData as ProjectionChartPoint[];
};

const DATED = { recurring: [], monthlyNetSalary: 6700, monthlyDebtPayment: 0 };

// ── 1. Classification exhaustive ─────────────────────────────────────────────────────────────

describe('dailyLedger — classification des champs du moteur', () => {
    it('CHAQUE champ émis par le moteur est classé (stock / flow / monthly / recomputed)', () => {
        const months = engineMonths();
        expect(months.length).toBeGreaterThan(12);
        // On balaie plusieurs mois : certains champs (FluxImpots en avril, événements) n'existent
        // pas tous les mois, et un balayage d'un seul point laisserait passer les champs saisonniers.
        const keys = new Set<string>();
        for (const p of months.slice(0, 30)) for (const k of Object.keys(p)) keys.add(k);
        const unclassified = [...keys].filter((k) => FIELD_KIND[k] === undefined);
        expect(unclassified, `Champs du moteur non classés dans FIELD_KIND : ${unclassified.join(', ')}`).toEqual([]);
    });

    it('toute cadence déclarée porte sur un champ de FLUX (un stock ne se répartit pas)', () => {
        const misfiled = Object.keys(FLOW_CADENCE).filter((k) => FIELD_KIND[k] !== 'flow');
        expect(misfiled, `Cadence déclarée sur un non-flux : ${misfiled.join(', ')}`).toEqual([]);
    });

    it('les soldes par compte sont bien des STOCKS et les rendements des FLUX', () => {
        for (const k of ['Liquidites', 'CELI', 'CELIAPP', 'REER', 'REEE', 'NonReg', 'Crypto', 'Immobilier', 'NetWorth', 'ImpotLatent']) {
            expect(FIELD_KIND[k], k).toBe('stock');
        }
        for (const k of ['MarketGrowthCELI', 'NetTransferREER', 'Expenses', 'IncomeMarc', 'FluxImpots']) {
            expect(FIELD_KIND[k], k).toBe('flow');
        }
        // Un TAUX n'est ni divisé ni interpolé : « 43,2 % / 30 » ne veut rien dire.
        for (const k of ['marginalTaxRate', 'effectiveTaxRate', 'MarketGrowthPctCELI', 'age']) {
            expect(FIELD_KIND[k], k).toBe('monthly');
        }
    });
});

// ── 2. Invariants de raccord sur le moteur RÉEL ──────────────────────────────────────────────

describe('dailyLedger — invariants de raccord (moteur réel)', () => {
    const months = engineMonths().slice(0, 6);
    const days = buildDailyLedger({ months, startYear: 2026, startMonth: 0, dated: DATED });

    it('produit un point par jour calendaire, du 2e mois de la fenêtre à la fin', () => {
        // Janv. sert de valeur d'entrée (non rendu) ; févr.→juin 2026 = 28+31+30+31+30 = 150 jours.
        expect(days.length).toBe(150);
        expect(days[0].dayOfMonth).toBe(1);
        expect(days[0].dayIso).toBe('2026-02-01');
        expect(days[days.length - 1].dayIso).toBe('2026-06-30');
    });

    it('STOCK : le dernier jour de chaque mois retombe EXACTEMENT sur la valeur du moteur', () => {
        const stockKeys = Object.keys(FIELD_KIND).filter((k) => FIELD_KIND[k] === 'stock');
        for (let mi = 1; mi < months.length; mi++) {
            const engine = months[mi];
            const lastOfMonth = days.filter((d) => d.hostMonthIndex === engine.monthIndex).at(-1);
            expect(lastOfMonth, `mois ${engine.monthIndex}`).toBeDefined();
            for (const key of stockKeys) {
                const expected = engine[key];
                if (typeof expected !== 'number' || !Number.isFinite(expected)) continue;
                expect(lastOfMonth![key], `${key} @ mois ${engine.monthIndex}`).toBeCloseTo(expected, 6);
            }
        }
    });

    it('FLUX : la somme des jours d’un mois vaut EXACTEMENT le total du moteur', () => {
        const flowKeys = Object.keys(FIELD_KIND).filter((k) => FIELD_KIND[k] === 'flow');
        for (let mi = 1; mi < months.length; mi++) {
            const engine = months[mi];
            const inMonth = days.filter((d) => d.hostMonthIndex === engine.monthIndex);
            for (const key of flowKeys) {
                const expected = engine[key];
                if (typeof expected !== 'number' || !Number.isFinite(expected)) continue;
                const sum = inMonth.reduce((s, d) => s + (Number(d[key]) || 0), 0);
                expect(sum, `Σ ${key} @ mois ${engine.monthIndex}`).toBeCloseTo(expected, 6);
            }
        }
    });

    it('ORDRE DE GRANDEUR : un solde reste un solde en milieu de mois (pas un 30e)', () => {
        // ⚠️ Garde INDÉPENDANTE de `FIELD_KIND` — les deux tests d'invariant ci-dessus lisent la
        // classification pour choisir quoi vérifier, donc un solde reclassé en flux leur échappe
        // (mesuré : seul le test de classification explicite l'attrapait). Ici on compare à la
        // valeur du moteur : un solde mal classé vaudrait ~1/28 de celle-ci, pas ~1.
        const engineFeb = months[1];
        const midFeb = days.find((d) => d.dayIso === '2026-02-14')!;
        for (const key of ['Liquidites', 'CELI', 'REER', 'NonReg', 'NetWorth']) {
            const engineValue = Number(engineFeb[key]);
            if (!Number.isFinite(engineValue) || Math.abs(engineValue) < 1) continue;
            const ratio = Number(midFeb[key]) / engineValue;
            expect(ratio, `${key} au 14 févr. vs fin févr.`).toBeGreaterThan(0.5);
            expect(ratio, `${key} au 14 févr. vs fin févr.`).toBeLessThan(1.5);
        }
    });

    it('MONTHLY : un taux est identique tous les jours du mois (jamais divisé)', () => {
        const feb = days.filter((d) => d.dayIso.startsWith('2026-02'));
        const rates = new Set(feb.map((d) => d.marginalTaxRate));
        expect(rates.size).toBe(1);
        expect([...rates][0]).toBe(months[1].marginalTaxRate);
    });

    it('le libellé de date porte le QUANTIÈME (c’est ce que Marc lisait comme « sept. 2026 »)', () => {
        // Un point mensuel affiche « févr. 2026 » ; un point quotidien DOIT porter le jour, sinon
        // rien à l'écran ne distingue les deux granularités.
        expect(days[0].dateLabel).toMatch(/\b1\b/);
        expect(days[0].dateLabel).not.toBe(months[1].dateLabel);
        expect(days[13].dateLabel).toMatch(/\b14\b/);
    });

    it('l’infobulle a de quoi remplir « par compte » : chaque jour porte des soldes non nuls', () => {
        // Le symptôme d'origine : en vue jour, l'infobulle n'avait AUCUN champ par compte, donc la
        // section entière disparaissait. On vérifie la présence, pas seulement la finitude.
        for (const key of ['Liquidites', 'CELI', 'REER', 'NonReg']) {
            expect(typeof days[10][key], key).toBe('number');
        }
        expect(Number(days[10].REER)).toBeGreaterThan(0);
    });
});

// ── 3. Datation : ce qui tombe à son vrai jour ───────────────────────────────────────────────

describe('dailyLedger — mouvements datés', () => {
    it('la paie hebdomadaire fait un jeudi plus riche qu’un mercredi', () => {
        const months = engineMonths().slice(0, 3);
        const days = buildDailyLedger({ months, startYear: 2026, startMonth: 0, dated: DATED });
        const feb = days.filter((d) => d.dayIso.startsWith('2026-02'));
        // 2026-02-05 est un jeudi ; 2026-02-04 un mercredi.
        const thu = feb.find((d) => d.dayIso === '2026-02-05')!;
        const wed = feb.find((d) => d.dayIso === '2026-02-04')!;
        expect(Number(thu.IncomeMarc)).toBeGreaterThan(Number(wed.IncomeMarc));
        expect(thu.dayIsDated).toBe(true);
        expect(thu.dayLabels).toContain('Paie');
        expect(wed.dayIsDated).toBe(false);
    });

    it('un paiement de dette ne creuse PAS le patrimoine net (il vide le compte ET la dette)', () => {
        // ⚠️ Test DISCRIMINANT du bug de la version précédente : elle appliquait la même liste de
        // mouvements datés à `Liquidites` ET à `NetWorth`, donc le jour de paie la valeur nette
        // plongeait du montant du paiement avant d'être rattrapée par l'étalement du résidu.
        const ctx = datedContextFor(2026, 1, { monthIndex: 1, NetWorth: 0 } as ProjectionChartPoint, {
            recurring: [], monthlyNetSalary: 0, monthlyDebtPayment: 1000,
        });
        expect(ctx.debt.length).toBeGreaterThan(0);
        expect(datedDeltasForField('Liquidites', ctx)).toEqual(expect.arrayContaining(ctx.debt));
        expect(datedDeltasForField('NetWorth', ctx)).not.toEqual(expect.arrayContaining(ctx.debt));
    });

    it('le solde d’impôt est posé à l’échéance (dernier jour du mois), pas étalé', () => {
        const ctx = datedContextFor(2026, 3, { monthIndex: 3, FluxImpots: 1200 } as ProjectionChartPoint, {
            recurring: [], monthlyNetSalary: 0, monthlyDebtPayment: 0,
        });
        expect(ctx.tax).toHaveLength(1);
        expect(ctx.tax[0].day).toBe(30);              // 30 avril = échéance réelle
        expect(ctx.tax[0].amount).toBe(-1200);        // à payer ⇒ le compte BAISSE
        expect(ctx.tax[0].label).toBe("Solde d'impôt");
    });

    it('un REMBOURSEMENT d’impôt fait monter le compte (signe inverse)', () => {
        const ctx = datedContextFor(2026, 3, { monthIndex: 3, FluxImpots: -800 } as ProjectionChartPoint, {
            recurring: [], monthlyNetSalary: 0, monthlyDebtPayment: 0,
        });
        expect(ctx.tax[0].amount).toBe(800);
        expect(ctx.tax[0].label).toBe("Remboursement d'impôt");
    });
});

// ── 4. Briques pures ─────────────────────────────────────────────────────────────────────────

describe('dailyLedger — poids et séries', () => {
    const ctx = { nDays: 30, payDays: [4, 11, 18, 25], recurring: [] as never[] };

    it('toute cadence rend un vecteur de somme 1 (garantie du raccord)', () => {
        for (const c of ['uniform', 'weekly', 'monthEnd', 'recurring', 'income'] as const) {
            const w = cadenceWeights(c, ctx, 0.5);
            expect(w).toHaveLength(30);
            expect(w.reduce((s, v) => s + v, 0), c).toBeCloseTo(1, 12);
        }
    });

    it('`monthEnd` met tout sur le dernier jour et rien avant', () => {
        const w = cadenceWeights('monthEnd', ctx);
        expect(w[29]).toBe(1);
        expect(w.slice(0, 29).every((v) => v === 0)).toBe(true);
    });

    it('`weekly` sans jour de paie retombe sur l’uniforme au lieu de produire des NaN', () => {
        const w = cadenceWeights('weekly', { nDays: 30, payDays: [], recurring: [] });
        expect(w.every((v) => v === 1 / 30)).toBe(true);
    });

    it('`recurring` laisse une dépense les jours SANS charge détectée', () => {
        // Un poids 100 % récurrent afficherait « 0 $ de dépense » les autres jours — faux : épicerie,
        // essence et imprévus existent tous les jours.
        const w = cadenceWeights('recurring', {
            nDays: 30, payDays: [],
            recurring: [{ day: 1, amount: -500 }, { day: 15, amount: -200 }],
        });
        expect(w.every((v) => v > 0)).toBe(true);
        expect(w[0]).toBeGreaterThan(w[5]);
        expect(w.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 12);
    });

    it('une borne non finie rend `null` — jamais une série de zéros crédibles', () => {
        expect(stockSeries(undefined, 1000, 30)).toBeNull();
        expect(stockSeries(1000, Number.NaN, 30)).toBeNull();
        expect(stockSeries(1000, 2000, 30)).not.toBeNull();
    });

    it('le dernier jour d’une série de stock POSE la valeur de fin (zéro dérive flottante)', () => {
        const s = stockSeries(1000, 1333.33, 31)!;
        expect(s[30]).toBe(1333.33);
        expect(s[0]).toBeGreaterThan(1000);
    });

    it('`dayLabel` rend une date française lisible avec le quantième', () => {
        expect(dayLabel(2026, 8, 14)).toMatch(/14/);
        expect(dayLabel(2026, 8, 14)).toMatch(/2026/);
    });
});

// ── 5. Honnêteté des valeurs absentes ────────────────────────────────────────────────────────

describe('dailyLedger — no-fake-data', () => {
    // `IncomeMarc` présent (donc datable au jeudi), `REER`/`MarketGrowthCELI` absents : le jeu
    // minimal qui exerce À LA FOIS la datation et l'honnêteté sur les champs manquants.
    const months = [
        { monthIndex: 0, NetWorth: 1000, CELI: 500, Income: 3000, IncomeMarc: 3000, Expenses: 2000 },
        { monthIndex: 1, NetWorth: 2000, CELI: 900, Income: 3000, IncomeMarc: 3000, Expenses: 2000 },
    ] as unknown as ProjectionChartPoint[];

    it('un champ que le mois n’émet pas reste ABSENT du jour (pas de 0 crédible)', () => {
        const days = buildDailyLedger({ months, startYear: 2026, startMonth: 0, dated: DATED });
        expect(days[0].REER).toBeUndefined();
        expect(days[0].MarketGrowthCELI).toBeUndefined();
    });

    it('le PREMIER jour n’a pas de veille : `diffNW` reste absent plutôt que « +0 $ »', () => {
        const days = buildDailyLedger({ months, startYear: 2026, startMonth: 0, dated: DATED });
        expect(days[0].diffNW).toBeUndefined();
        expect(typeof days[1].diffNW).toBe('number');
    });

    it('`Savings` du jour = revenu du jour − dépense du jour (recalculé, pas réparti)', () => {
        const days = buildDailyLedger({ months, startYear: 2026, startMonth: 0, dated: DATED });
        for (const d of days) {
            expect(Number(d.Savings)).toBeCloseTo(Number(d.Income) - Number(d.Expenses), 9);
        }
        // Et il change d'un jour à l'autre : la paie tombe le jeudi, pas les dépenses.
        const uniqueSavings = new Set(days.map((d) => Math.round(Number(d.Savings))));
        expect(uniqueSavings.size).toBeGreaterThan(1);
    });

    it('moins de deux mois ⇒ aucun jour (on n’invente pas la valeur d’entrée)', () => {
        expect(buildDailyLedger({ months: months.slice(0, 1), startYear: 2026, startMonth: 0, dated: DATED })).toEqual([]);
    });
});
