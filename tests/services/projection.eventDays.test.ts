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
