// [FUTUR-DAILY-EVENTS] Le moteur émet le JOUR des événements qui en ont un (retour Marc
// 2026-08-12 : « j'ai mis un événement de vie et ça m'a mis au mois et pas au bon jour, tout doit
// être au bon jour les impôts aussi »). La date complète était SAISIE puis tronquée au mois.
import { describe, it, expect, vi } from 'vitest';
import { applyLifeEvents, applyTravelExpenses } from '../../services/projection/monthlyEvents';
import { buildDailyLedger } from '../../services/projection/dailyLedger';
import type { LifeEvent, TravelGoal } from '../../types';
import type { ProjectionChartPoint } from '../../services/projection/types';

const spyState = () => {
    const calls: Array<{ kind: 'life' | 'flow'; msg: string; day: number | undefined }> = [];
    return {
        calls,
        state: {
            addExpense: vi.fn(), addLiquid: vi.fn(), shockPortfolio: vi.fn(),
            logLife: (msg: string, day?: number) => calls.push({ kind: 'life', msg, day }),
            logFlow: (msg: string, day?: number) => calls.push({ kind: 'flow', msg, day }),
        },
    };
};

describe('applyLifeEvents — le jour SAISI est émis avec le message', () => {
    it('événement one-shot daté au 14 ⇒ logLife/logFlow reçoivent day=14', () => {
        const { calls, state } = spyState();
        const events = [{
            id: 'e1', type: 'HERITAGE', name: 'Héritage tante', date: '2030-05-14', impactAmount: 50_000,
        } as LifeEvent];
        applyLifeEvents(events, '2030-05', 1, [], state as never);
        const dated = calls.filter((c) => c.day !== undefined);
        expect(dated.length).toBeGreaterThan(0);
        for (const c of dated) expect(c.day).toBe(14);
    });

    it('date SANS jour (YYYY-MM, saisie ancienne) ⇒ day undefined — jamais un jour inventé', () => {
        const { calls, state } = spyState();
        const events = [{
            id: 'e2', type: 'HERITAGE', name: 'Vieux gain', date: '2030-05', impactAmount: 1_000,
        } as LifeEvent];
        applyLifeEvents(events, '2030-05', 1, [], state as never);
        expect(calls.length).toBeGreaterThan(0);
        for (const c of calls) expect(c.day).toBeUndefined();
    });
});

describe('applyTravelExpenses — le voyage part à sa date (applyTravelExpenses)', () => {
    it('voyage daté au 22 ⇒ logFlow reçoit day=22', () => {
        const { calls, state } = spyState();
        const trips = [{ id: 't1', destination: 'Rome', date: '2031-09-22', totalCost: 4_000 } as TravelGoal];
        applyTravelExpenses(trips, '2031-09', 1, state as never);
        expect(calls.length).toBe(1);
        expect(calls[0].day).toBe(22);
    });
});

describe('buildDailyLedger — chaque événement posé à SON jour', () => {
    const month = (monthIndex: number, over: Record<string, unknown> = {}): ProjectionChartPoint => ({
        monthIndex, dateLabel: `m${monthIndex}`, year: 2026, age: 35, NetWorth: 100_000,
        ...over,
    } as unknown as ProjectionChartPoint);
    const DATED = { recurring: [], monthlyNetSalary: 0, monthlyDebtPayment: 0 };

    it('label avec eventDays[label]=14 ⇒ posé au 14 ; label sans jour ⇒ au 1er (historique)', () => {
        const days = buildDailyLedger({
            months: [month(0), month(1, {
                lifeEvents: ['Voyage Rome ✈️', 'Jalon sans date'],
                eventDays: { 'Voyage Rome ✈️': 14 },
            })],
            startYear: 2026, startMonth: 0, dated: DATED,
        });
        const day14 = days.find((d) => d.dayOfMonth === 14);
        const day1 = days.find((d) => d.dayOfMonth === 1);
        expect(day14?.lifeEvents).toEqual(['Voyage Rome ✈️']);
        expect(day1?.lifeEvents).toEqual(['Jalon sans date']);
        // Aucun autre jour ne porte l'événement (pas répété 30 fois).
        expect(days.filter((d) => (d.lifeEvents ?? []).length > 0)).toHaveLength(2);
    });

    it('jour hors mois (31 en février) ⇒ clampé au dernier jour réel, jamais perdu', () => {
        const days = buildDailyLedger({
            months: [month(0), month(1, { flowEvents: ['Échéance'], eventDays: { 'Échéance': 31 } })],
            startYear: 2026, startMonth: 0, dated: DATED, // mois 1 = février 2026 (28 j)
        });
        const last = days[days.length - 1];
        expect(last.dayOfMonth).toBe(28);
        expect(last.flowEvents).toEqual(['Échéance']);
    });

    // [FAIBLE-1 validator #594] Un jour FRACTIONNAIRE (12.7 — impossible depuis le moteur qui
    // arrondit dans logEvent, mais possible via un point restauré d'un JSON ou produit par MCP)
    // ne matchait JAMAIS `dayOf(l) === day` → label silencieusement PERDU du ledger.
    it('jour fractionnaire (12.7, point restauré) ⇒ arrondi au 13, jamais perdu', () => {
        const days = buildDailyLedger({
            months: [month(0), month(1, { flowEvents: ['Frac'], eventDays: { Frac: 12.7 } })],
            startYear: 2026, startMonth: 0, dated: DATED,
        });
        const carriers = days.filter((d) => (d.flowEvents ?? []).length > 0);
        expect(carriers).toHaveLength(1);
        expect(carriers[0].dayOfMonth).toBe(13);
        expect(carriers[0].flowEvents).toEqual(['Frac']);
    });
});

// L'échéance de la régularisation annuelle : 30 avril (date limite de paiement ARC/RQ) — l'icône
// d'impôt se pose à l'échéance, plus au 1er du mois.
import { processAprilSettlement } from '../../services/projection/taxApril';

describe('processAprilSettlement — l’icône d’impôt à l’échéance du 30', () => {
    it('régularisation émise avec day=30 (mois d’avril, solde à payer)', () => {
        const calls: Array<{ msg: string; day: number | undefined }> = [];
        processAprilSettlement(
            3, // avril (0-based)
            15, // pas le tout premier mois de la simulation
            { revenu: 2_000, gains: 300, divers: 100, reer: 100, donCredit: 0 },
            {
                subtractLiquid: vi.fn(), addNonReg: vi.fn(), addNonRegACB: vi.fn(),
                logFlow: (msg: string, day?: number) => calls.push({ msg, day }),
            } as never,
        );
        expect(calls.length).toBeGreaterThan(0);
        expect(calls[0].day).toBe(30);
    });
});

// [Finding ÉLEVÉ revue #594] Collision de MESSAGES identiques le même mois : deux événements
// homonymes à des jours DIFFÉRENTS ne partagent pas une entrée — écraser aurait posé les deux au
// jour du dernier (un jour FAUX pour l'autre). No-fake : l'ambiguïté RETIRE l'entrée (tous au mois).
describe('applyLifeEvents — collision de messages identiques', () => {
    it('deux événements homonymes à des jours différents ⇒ AUCUN jour émis pour ce message', () => {
        const { calls, state } = spyState();
        const events = [
            { id: 'a', type: 'HERITAGE', name: 'Gain', date: '2030-05-05', impactAmount: 100 },
            { id: 'b', type: 'HERITAGE', name: 'Gain', date: '2030-05-20', impactAmount: 200 },
        ] as LifeEvent[];
        applyLifeEvents(events, '2030-05', 1, [], state as never);
        // Les DEUX logs sont émis (jours 5 et 20) — c'est le REGISTRE eventDays du moteur qui
        // résout l'ambiguïté (testé de bout en bout via le registre, pas ici : le spy voit les
        // jours bruts). On vérifie ici que les deux occurrences existent bien.
        const lifeCalls = calls.filter((c) => c.kind === 'life');
        expect(lifeCalls).toHaveLength(2);
        expect(lifeCalls.map((c) => c.day).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([5, 20]);
    });
});

// [FAIBLE-3 validator #594] Le registre `eventDays` du MOTEUR, de bout en bout : l'ambiguïté
// « daté + non-daté » doit AUSSI retirer l'entrée. Avant : « Mix » saisi une fois en 2028-05
// (sans jour) et une fois le 2028-05-20 → eventDays={Mix:20} → le ledger posait LES DEUX
// occurrences au 20 (fausse précision pour celle qui n'a pas de jour).
import { calculateFutureProjection } from '../../services/projection';
import type { BudgetConfig, ProjectionConfig, RetirementGoal } from '../../types';

const engineBase = () => ({
    projection: {
        years: 4, returnRate: 6, inflationRate: 2, savingsMode: 'manual', manualContribution: 0,
        usePortfolioRate: false, returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
        emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3,
    } as ProjectionConfig,
    calculatedStartingCash: 100_000,
    liveCSVBalances: { CELI: 50_000, CELIAPP: 0, REER: 50_000, NON_ENREG: 20_000, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: [], childGoals: [], travelGoals: [],
    retirementGoal: { targetAge: 62, targetMonthlyIncome: 5000, governmentPension: 1500, lifeExpectancy: 90 } as RetirementGoal,
    config: {
        users: [
            { name: 'Marc', grossSalary: 8200, netSalary: 5620, color: '#10b981', age: 40, birthYear: 1986, canadaArrivalYear: 1986, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
            { name: 'Anna', grossSalary: 7100, netSalary: 4995, color: '#3b82f6', age: 40, birthYear: 1986, canadaArrivalYear: 1986, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
        ],
        splitMode: '50/50',
    } as BudgetConfig,
    baseGrossAnnual: 183_600, baseNetAnnual: 127_380, currentRentExpense: 1_500, baseMonthlyExpenses: 6_000,
    startYear: 2026, startMonth: 0,
});

const eventDaysOf = (name: string, events: Array<{ date: string }>) => {
    const res = calculateFutureProjection({
        ...engineBase(),
        lifeEvents: events.map((e, i) => ({ id: `e${i}`, type: 'HERITAGE', name, date: e.date, impactAmount: 100 })),
    } as never);
    const p = res.chartData.find((q) => (q.lifeEvents ?? []).some((s) => s.includes(name)));
    expect(p, `aucun point ne porte « ${name} »`).toBeTruthy();
    const entries = Object.keys(p?.eventDays ?? {}).filter((k) => k.includes(name));
    return { entries, eventDays: p?.eventDays };
};

describe('registre eventDays du moteur — ambiguïté daté/non-daté (bout en bout)', () => {
    it('« Mix » sans jour PUIS daté au 20 ⇒ AUCUNE entrée (les deux au mois)', () => {
        const { entries } = eventDaysOf('Mix', [{ date: '2028-05' }, { date: '2028-05-20' }]);
        expect(entries).toEqual([]);
    });

    it('« Rev » daté au 20 PUIS sans jour ⇒ AUCUNE entrée (ordre indifférent)', () => {
        const { entries } = eventDaysOf('Rev', [{ date: '2028-08-20' }, { date: '2028-08' }]);
        expect(entries).toEqual([]);
    });

    it('non-régression : jour unique conservé, et deux homonymes au MÊME jour conservés', () => {
        const solo = eventDaysOf('Solo', [{ date: '2028-05-14' }]);
        expect(solo.eventDays?.['Solo 💰']).toBe(14);
        const twin = eventDaysOf('Twin', [{ date: '2028-06-05' }, { date: '2028-06-05' }]);
        expect(twin.eventDays?.['Twin 💰']).toBe(5);
    });
});
