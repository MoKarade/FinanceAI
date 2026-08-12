// services/projection/dailyCurve.ts
//
// [FUTUR-DAILY-NATIVE] Helpers PURS de la courbe Futur au jour natif (demande Marc 2026-08-12 :
// « je veux pas un bouton je veux pouvoir selectionner sur la courbe direct » — cadrage : clic =
// jour partout, survol = jour, courbe tracée au jour).
//
// Trois responsabilités, toutes partagées entre la COURBE (série globale légère) et l'INFOBULLE
// (point complet ventilé à la demande) — c'est ce partage qui interdit toute divergence entre ce
// que la courbe trace et ce que l'infobulle détaille pour le même jour :
//   • `mergeDailyRealPoint`  — pose l'abscisse fractionnaire et substitue le PASSÉ RÉEL au projeté ;
//   • `recomputeDailyDiffs`  — écarts jour-à-jour APRÈS fusion (les diffs du ledger portaient sur
//                              des valeurs projetées que le réel vient de remplacer) ;
//   • `sliceDailyByX`        — la fenêtre de zoom (bornes mensuelles) découpe la série quotidienne
//                              par VALEUR d'abscisse, jamais par indice (un jour de février vaut
//                              1/28 de mois, un jour de mars 1/31 — l'indice ment).

import type { ProjectionChartPoint } from './types';
import type { DailyLedgerPoint } from './dailyLedger';
import { dayLabel } from './dailyLedger';
import { axisXAtDay, calendarFromMonthIndex, daysInMonth, isoDate } from './dailyRefine';
import type { DailyPastRow, PastAccountKey } from '../history/dailyPastLedger';
import { PAST_ACCOUNT_KEYS } from '../history/dailyPastLedger';

/**
 * Pose l'abscisse FRACTIONNAIRE d'un jour ventilé et, si ce jour appartient au passé RECONSTRUIT,
 * remplace le point projeté par le point RÉEL.
 *
 * ⚠️ Le point réel est RECONSTRUIT À PARTIR DE RIEN, jamais par `{...projeté, ...réel}` : l'étalage
 * laisserait filtrer des dizaines de valeurs PROJETÉES (impôt dormant, rentes, solde d'impôt,
 * cotisations…) dans une journée présentée comme RÉELLE — des chiffres crédibles, invérifiables,
 * et faux par nature. Ce qui n'est pas mesuré doit être ABSENT, donc affiché « — ».
 *
 * `fields` : restriction optionnelle aux champs de la COURBE (mêmes clés que la ventilation légère).
 * `null` = tout ce que le réel fournit (chemin infobulle). La restriction ne s'applique qu'aux
 * MONTANTS — l'identité du jour (dayIso, dateLabel…) est toujours posée.
 */
export function mergeDailyRealPoint(
    d: DailyLedgerPoint,
    startYear: number,
    startMonth: number,
    realByDate: ReadonlyMap<string, DailyPastRow> | null,
    fields: ReadonlySet<string> | null,
): ProjectionChartPoint {
    const { year, month } = calendarFromMonthIndex(startYear, startMonth, d.hostMonthIndex);
    // ⚠️ Abscisse FRACTIONNAIRE : `axisXAtDay` garantit que le jour 1 vaut EXACTEMENT l'entier du
    // mois — les ancrages entiers (« Aujourd'hui », frontière passé/futur, jalons) restent alignés.
    const x = axisXAtDay(d.hostMonthIndex, d.dayOfMonth, year, month);
    const real = realByDate?.get(d.dayIso);
    if (!real) return { ...d, monthIndex: x } as unknown as ProjectionChartPoint;

    const wants = (key: string): boolean => !fields || fields.has(key);
    const put = (target: Record<string, unknown>, key: string, value: unknown): void => {
        if (wants(key)) target[key] = value;
    };
    const point: Record<string, unknown> = {
        monthIndex: x,
        hostMonthIndex: d.hostMonthIndex,
        dayIso: d.dayIso,
        dayOfMonth: d.dayOfMonth,
        dateLabel: d.dateLabel,
        age: d.age,
        year: d.year,
        isDailyPoint: true,
        dayIsReal: true,
        dayIsDated: real.isDated,
        dayLabels: real.labels,
        priceAgeMaxDays: real.priceAgeMaxDays,
        hasEstimatedPrice: real.hasEstimatedPrice,
    };
    put(point, 'Liquidites', real.Liquidites);
    put(point, 'Immobilier', real.Immobilier);
    put(point, 'DettesNonImmo', real.DettesNonImmo);
    put(point, 'NetWorth', real.NetWorth);
    put(point, 'Income', real.Income);
    put(point, 'Expenses', real.Expenses);
    put(point, 'Savings', real.Savings);
    put(point, 'NetTransferLiquid', real.NetTransferLiquid);
    for (const k of PAST_ACCOUNT_KEYS) {
        put(point, k, real[k as PastAccountKey]);
        put(point, `NetTransfer${k}`, real.deposits[k as PastAccountKey]);
        put(point, `MarketGrowth${k}`, real.growth[k as PastAccountKey]);
    }
    return point as unknown as ProjectionChartPoint;
}

/**
 * [FUTUR-DAILY-NATIVE] Jours du mois ANCRE, construits à partir du PASSÉ RÉEL SEUL.
 *
 * Le 1er mois de la série mensuelle sert d'ancre d'ENTRÉE à la ventilation et n'est pas rendu —
 * la courbe quotidienne perdait donc son premier mois, et la bande « Passé réel » avec lui
 * (attrapé par l'e2e d'axe : bande de 4 px au lieu du passé complet). Or ce mois est du PASSÉ :
 * ses jours n'ont pas besoin du moteur — le réel se construit à partir de RIEN (règle no-fake).
 * On n'émet QUE les jours où une ligne réelle existe ; aucun jour interpolé n'est inventé pour
 * un mois sans ancre.
 */
export function realOnlyMonthPoints(
    hostMonthIndex: number,
    startYear: number,
    startMonth: number,
    realByDate: ReadonlyMap<string, DailyPastRow> | null,
    fields: ReadonlySet<string> | null,
): ProjectionChartPoint[] {
    if (!realByDate || !Number.isFinite(hostMonthIndex)) return [];
    const { year, month } = calendarFromMonthIndex(startYear, startMonth, hostMonthIndex);
    const n = daysInMonth(year, month);
    const out: ProjectionChartPoint[] = [];
    for (let day = 1; day <= n; day++) {
        const iso = isoDate(year, month, day);
        const real = realByDate.get(iso);
        if (!real) continue;
        const d = {
            monthIndex: hostMonthIndex, hostMonthIndex, dayIso: iso, dayOfMonth: day,
            dateLabel: dayLabel(year, month, day), isDailyPoint: true,
            dayIsDated: real.isDated, dayLabels: real.labels,
        } as unknown as DailyLedgerPoint;
        out.push(mergeDailyRealPoint(d, startYear, startMonth, realByDate, fields));
    }
    return out;
}

/**
 * Recalcule les écarts jour-à-jour SUR LA SÉRIE FUSIONNÉE, en place. À appeler après le merge
 * réel : les `diff*` posés par `buildDailyLedger` comparaient des valeurs projetées.
 * Le 1er point n'a pas de veille connue : ses `diff*` sont RETIRÉS (jamais « +0 $ » en vert —
 * un faux zéro crédible sur la donnée la plus regardée de l'infobulle).
 */
export function recomputeDailyDiffs(merged: ProjectionChartPoint[]): void {
    const DIFFS = [['diffNW', 'NetWorth'], ['diffCELI', 'CELI'], ['diffREER', 'REER'], ['diffLiquid', 'Liquidites']] as const;
    for (let i = 1; i < merged.length; i++) {
        const prevP = merged[i - 1] as unknown as Record<string, unknown>;
        const curP = merged[i] as unknown as Record<string, unknown>;
        for (const [diffKey, srcKey] of DIFFS) {
            const now = curP[srcKey];
            const before = prevP[srcKey];
            if (typeof now === 'number' && typeof before === 'number' && Number.isFinite(now) && Number.isFinite(before)) {
                curP[diffKey] = now - before;
            } else {
                delete curP[diffKey];
            }
        }
    }
    if (merged.length > 0) {
        for (const k of ['diffNW', 'diffCELI', 'diffREER', 'diffLiquid']) {
            delete (merged[0] as unknown as Record<string, unknown>)[k];
        }
    }
}

/**
 * Tranche de la série quotidienne couverte par la fenêtre de zoom MENSUELLE [loMonth, hiMonth]
 * (bornes = `monthIndex` des points mensuels visibles) : tous les jours d'abscisse
 * `x ∈ [loMonth, hiMonth + 1)` — le mois de la borne haute est rendu EN ENTIER (la vue mensuelle
 * s'arrêtait à son point de fin de mois ; au jour, s'arrêter au 1er du mois tronquerait la fenêtre
 * d'un mois entier à l'œil).
 *
 * Recherche BINAIRE aux deux bornes (la série est triée par abscisse) : le zoom/pan re-tranche à
 * chaque frame, un `filter` linéaire sur ~11 000 points × 60 fps se sentirait.
 */
export function sliceDailyByX(
    daily: ReadonlyArray<ProjectionChartPoint>,
    loMonth: number,
    hiMonth: number,
): ProjectionChartPoint[] {
    const [from, to] = sliceDailyRangeByX(daily, loMonth, hiMonth);
    return daily.slice(from, to);
}

/** Bornes d'INDICES `[from, to)` de la tranche — même contrat que `sliceDailyByX`, exposé pour la
 *  décimation à phase GLOBALE (décimer sur l'index de la TRANCHE ferait scintiller le tracé à
 *  chaque cran de zoom, les points retenus changeant de phase). */
export function sliceDailyRangeByX(
    daily: ReadonlyArray<ProjectionChartPoint>,
    loMonth: number,
    hiMonth: number,
): [number, number] {
    if (daily.length === 0 || !Number.isFinite(loMonth) || !Number.isFinite(hiMonth)) return [0, 0];
    const xOf = (p: ProjectionChartPoint): number => p.monthIndex;
    const lowerBound = (x: number): number => {
        let lo = 0, hi = daily.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (xOf(daily[mid]) < x) lo = mid + 1; else hi = mid;
        }
        return lo;
    };
    return [lowerBound(loMonth), lowerBound(hiMonth + 1)];
}

/**
 * [FUTUR-DAILY-NATIVE] Décimation du TRACÉ en vue large — contrainte MESURÉE, pas une préférence :
 * rendre ~11 000 points × 8 aires empilées gèle le main thread au point que `mouse.wheel` de
 * Playwright EXPIRE (120 s) pendant le zoom. La clause a été annoncée à Marc au cadrage : « si ça
 * rame, j'échantillonne le TRACÉ en vue très large — la forme reste fidèle, la sélection reste au
 * jour exact ». La SÉLECTION (clic, survol résolu par géométrie, Veille/Lendemain) travaille sur
 * la tranche COMPLÈTE, jamais sur la série décimée.
 *
 * Garanties :
 *  • ≤ `maxPoints` + les jours PORTEURS (échéance d'impôt `FluxImpots` — la Bar lit `data`, un
 *    point décimé serait une barre DISPARUE) + le dernier point (le bord droit ne recule pas) ;
 *  • phase GLOBALE (`globalFrom + i`) : au pan, les points retenus ne changent pas tant que le
 *    pas `k` est constant — pas de scintillement ;
 *  • sous `maxPoints`, la tranche est rendue TELLE QUELLE (fenêtres serrées = tous les jours).
 */
export function decimateForRender(
    slice: ReadonlyArray<ProjectionChartPoint>,
    globalFrom: number,
    maxPoints: number,
): ProjectionChartPoint[] {
    if (slice.length <= maxPoints || maxPoints < 2) return [...slice];
    const k = Math.ceil(slice.length / maxPoints);
    const out: ProjectionChartPoint[] = [];
    for (let i = 0; i < slice.length; i++) {
        const p = slice[i];
        const keep = (globalFrom + i) % k === 0
            || i === 0 // les BORDS de la fenêtre ne reculent jamais (dataMin/dataMax stables)
            || i === slice.length - 1
            || (p as unknown as Record<string, unknown>).FluxImpots !== undefined;
        if (keep) out.push(p);
    }
    return out;
}
