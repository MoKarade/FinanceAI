// [FUTUR-DAILY-NATIVE] Helpers purs de la courbe au jour natif : tranche par abscisse, fusion
// passé réel, diffs post-fusion — et la PARITÉ courbe légère / infobulle complète (le même jour
// doit porter les MÊMES valeurs par les deux chemins, sinon l'écran affiche deux vérités).
import { describe, it, expect } from 'vitest';
import { mergeDailyRealPoint, recomputeDailyDiffs, sliceDailyByX, realOnlyMonthPoints, buildEnrichedMonth } from '../../services/projection/dailyCurve';
import { buildDailyLedger, type DailyLedgerPoint } from '../../services/projection/dailyLedger';
import type { ProjectionChartPoint } from '../../services/projection/types';
import type { DailyPastRow } from '../../services/history/dailyPastLedger';

const month = (monthIndex: number, over: Record<string, unknown> = {}): ProjectionChartPoint => ({
    monthIndex, dateLabel: `m${monthIndex}`, year: 2026, age: 35,
    NetWorth: 100_000 + monthIndex * 1_000,
    CELI: 40_000 + monthIndex * 200, REER: 50_000 + monthIndex * 300,
    Liquidites: 10_000 + monthIndex * 100,
    Income: 8_000, Expenses: 5_000, FluxImpots: 0,
    ...over,
} as unknown as ProjectionChartPoint);

const DATED = { recurring: [], monthlyNetSalary: 8_000, monthlyDebtPayment: 0 };
const START = { startYear: 2026, startMonth: 0 };

const build = (months: ProjectionChartPoint[], fields?: ReadonlySet<string>): DailyLedgerPoint[] =>
    buildDailyLedger({ months, ...START, dated: DATED, fields });

describe('sliceDailyByX — la fenêtre mensuelle découpe la série quotidienne par ABSCISSE', () => {
    const daily = build([month(0), month(1), month(2), month(3)])
        .map((d) => mergeDailyRealPoint(d, START.startYear, START.startMonth, null, null));

    it('couvre le mois de la borne HAUTE en entier (x < hi + 1), pas seulement son 1er jour', () => {
        const slice = sliceDailyByX(daily, 1, 2);
        expect(slice.length).toBe(daysCount(2026, 1) + daysCount(2026, 2)); // fév + mars
        expect(slice[0].monthIndex).toBe(1); // 1er février = entier exact
        expect(slice[slice.length - 1].monthIndex).toBeLessThan(3);
    });

    it('résultat identique à un filter linéaire (la recherche binaire ne saute rien)', () => {
        const slice = sliceDailyByX(daily, 1, 2);
        const linear = daily.filter((p) => p.monthIndex >= 1 && p.monthIndex < 3);
        expect(slice).toEqual(linear);
    });

    it('bornes hors série / entrées non finies ⇒ vide ou tranche clampée, jamais un throw', () => {
        expect(sliceDailyByX(daily, 99, 120)).toEqual([]);
        expect(sliceDailyByX(daily, Number.NaN, 2)).toEqual([]);
        expect(sliceDailyByX([], 0, 1)).toEqual([]);
    });
});

describe('mergeDailyRealPoint — fusion passé réel, no-fake par construction', () => {
    const days = build([month(0), month(1)]);
    const firstDay = days[0];
    const realRow = {
        date: firstDay.dayIso, isDated: true, labels: ['Paie'],
        priceAgeMaxDays: 2, hasEstimatedPrice: false,
        Liquidites: 12_345, Immobilier: 150_000, DettesNonImmo: 5_000, NetWorth: 222_222,
        Income: 2_000, Expenses: 100, Savings: 1_900, NetTransferLiquid: 1_900,
        CELI: 41_000, CELIAPP: 0, REER: 51_000, REEE: 0, NonReg: 0, Crypto: 0,
        deposits: { CELI: 10, CELIAPP: 0, REER: 20, REEE: 0, NonReg: 0, Crypto: 0 },
        growth: { CELI: 1, CELIAPP: 0, REER: 2, REEE: 0, NonReg: 0, Crypto: 0 },
    } as unknown as DailyPastRow;
    const byDate = new Map([[firstDay.dayIso, realRow]]);

    it('jour RÉEL : reconstruit à partir de rien — un champ projeté non mesuré est ABSENT', () => {
        const p = mergeDailyRealPoint(firstDay, START.startYear, START.startMonth, byDate, null) as unknown as Record<string, unknown>;
        expect(p.dayIsReal).toBe(true);
        expect(p.NetWorth).toBe(222_222);
        // Le mois projeté portait Income/Expenses ventilés — le point réel ne garde QUE le mesuré :
        expect(p.ImpotLatent).toBeUndefined();
        expect(p.RetraitREER).toBeUndefined();
    });

    it('restriction `fields` : les MONTANTS hors liste sont absents, l’identité du jour reste', () => {
        const only = new Set(['NetWorth']);
        const p = mergeDailyRealPoint(firstDay, START.startYear, START.startMonth, byDate, only) as unknown as Record<string, unknown>;
        expect(p.NetWorth).toBe(222_222);
        expect(p.Liquidites).toBeUndefined();
        expect(p.dayIso).toBe(firstDay.dayIso);
        expect(p.dayIsReal).toBe(true);
    });

    it('jour PROJETÉ (pas de réel) : abscisse fractionnaire posée, valeurs ventilées conservées', () => {
        // ⚠️ Le 1er mois passé à buildDailyLedger est l'ANCRE (non rendue) : days couvre le mois 1.
        // days[0] = 1er du mois → abscisse ENTIÈRE exacte (invariant d'alignement des ancrages) ;
        // days[1] = 2 du mois → strictement entre 1 et 2.
        expect(mergeDailyRealPoint(days[0], START.startYear, START.startMonth, null, null).monthIndex).toBe(1);
        const p = mergeDailyRealPoint(days[1], START.startYear, START.startMonth, null, null);
        expect(p.monthIndex).toBeGreaterThan(1);
        expect(p.monthIndex).toBeLessThan(2);
        expect((p as unknown as Record<string, unknown>).dayIsReal).toBeUndefined();
    });
});

describe('PARITÉ courbe légère ↔ infobulle complète — même moteur, mêmes valeurs', () => {
    it('chaque champ de la courbe porte la MÊME valeur par les deux chemins', () => {
        const months = [month(0), month(1), month(2)];
        const CURVE = new Set(['NetWorth', 'CELI', 'REER', 'Liquidites', 'FluxImpots', 'year', 'age']);
        const light = build(months, CURVE);
        const full = build(months);
        expect(light.length).toBe(full.length);
        for (let i = 0; i < light.length; i++) {
            for (const k of CURVE) {
                expect((light[i] as Record<string, unknown>)[k]).toBe((full[i] as Record<string, unknown>)[k]);
            }
            expect(light[i].dayIso).toBe(full[i].dayIso);
        }
    });
});

describe('recomputeDailyDiffs — après fusion, à travers la frontière des mois', () => {
    it('recalcule diffNW sur la série fusionnée et RETIRE ceux du 1er point', () => {
        const days = build([month(0), month(1), month(2)])
            .map((d) => mergeDailyRealPoint(d, START.startYear, START.startMonth, null, null));
        recomputeDailyDiffs(days);
        expect((days[0] as unknown as Record<string, unknown>).diffNW).toBeUndefined();
        const i = daysCount(2026, 1); // 1er jour du 2e mois rendu — veille = dernier jour du mois précédent
        const d = days[i] as unknown as Record<string, number>;
        const prev = days[i - 1] as unknown as Record<string, number>;
        expect(d.diffNW).toBeCloseTo(d.NetWorth - prev.NetWorth, 6);
    });
});

function daysCount(year: number, month0: number): number {
    return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

describe('realOnlyMonthPoints — le mois ANCRE reconstruit depuis le réel seul', () => {
    it('émet UNIQUEMENT les jours où une ligne réelle existe (aucune interpolation inventée)', () => {
        const realByDate = new Map<string, DailyPastRow>();
        for (const day of [3, 4, 5]) {
            const iso = `2026-01-${String(day).padStart(2, '0')}`;
            realByDate.set(iso, {
                date: iso, isDated: day === 4, labels: day === 4 ? ['Paie'] : [],
                Liquidites: 1_000 + day, NetWorth: 50_000 + day,
                deposits: {}, growth: {},
            } as unknown as DailyPastRow);
        }
        const pts = realOnlyMonthPoints(0, 2026, 0, realByDate, null);
        expect(pts.length).toBe(3);
        const p = pts[1] as unknown as Record<string, unknown>;
        expect(p.dayIsReal).toBe(true);
        expect(p.NetWorth).toBe(50_004);
        expect(p.dayIso).toBe('2026-01-04');
        // Abscisse fractionnaire dans le mois 0 : jour 4 → 3/31 de mois.
        expect(pts[1].monthIndex).toBeCloseTo(3 / 31, 6);
        // Un champ jamais mesuré par le réel reste ABSENT (no-fake).
        expect(p.ImpotLatent).toBeUndefined();
    });

    it('sans carte réelle ⇒ [] (le mois ancre retombe sur son point mensuel, à l’appelant)', () => {
        expect(realOnlyMonthPoints(0, 2026, 0, null, null)).toEqual([]);
    });
});

// [Finding CRITIQUE silent-failure #592] buildEnrichedMonth : le mois ANCRE ne produit JAMAIS une
// Map vide « accidentelle » mise en cache — c'est ce chemin qui rendait l'infobulle du mois le plus
// consulté définitivement LÉGÈRE (paie réelle invisible comme si elle était nulle).
describe('buildEnrichedMonth — enrichissement complet, y compris le mois ANCRE', () => {
    const data = [month(0), month(1), month(2)];
    const buildFn = (input: { months: readonly ProjectionChartPoint[]; startYear: number; startMonth: number; dated: unknown }) =>
        buildDailyLedger({ months: input.months as ProjectionChartPoint[], startYear: input.startYear, startMonth: input.startMonth, dated: DATED });

    it('mois ordinaire : Map complète par dayIso, diffs posés (sauf 1er jour rendu)', () => {
        const byIso = buildEnrichedMonth(data, 2, 2026, 0, null, DATED, buildFn);
        expect(byIso).not.toBeNull();
        expect(byIso!.size).toBe(daysCount(2026, 2));
        const d2 = byIso!.get('2026-03-02') as unknown as Record<string, unknown>;
        expect(d2.Income).toBeDefined(); // champs COMPLETS, pas la restriction courbe
        expect(d2.diffNW).toBeDefined();
    });

    it('mois ANCRE (hostIdx=0) AVEC réel : jours réels complets — jamais une Map vide', () => {
        const realByDate = new Map<string, DailyPastRow>();
        for (const day of [1, 2, 3]) {
            const iso = `2026-01-${String(day).padStart(2, '0')}`;
            realByDate.set(iso, {
                date: iso, isDated: day === 2, labels: day === 2 ? ['Paie'] : [],
                Liquidites: 100 + day, NetWorth: 9_000 + day, Income: day === 2 ? 2_000 : 0,
                deposits: {}, growth: {},
            } as unknown as DailyPastRow);
        }
        const byIso = buildEnrichedMonth(data, 0, 2026, 0, realByDate, DATED, buildFn);
        expect(byIso).not.toBeNull();
        expect(byIso!.size).toBe(3);
        const p = byIso!.get('2026-01-02') as unknown as Record<string, unknown>;
        expect(p.dayIsReal).toBe(true);
        expect(p.Income).toBe(2_000); // la paie réelle N'EST PAS avalée
        expect(p.diffNW).toBeDefined(); // veille = 2026-01-01, présente
    });

    it('mois ANCRE SANS réel ⇒ null (l’appelant journalise et NE CACHE PAS — pas de Map vide)', () => {
        expect(buildEnrichedMonth(data, 0, 2026, 0, null, DATED, buildFn)).toBeNull();
    });

    it('mois introuvable ⇒ null', () => {
        expect(buildEnrichedMonth(data, 99, 2026, 0, null, DATED, buildFn)).toBeNull();
    });
});
