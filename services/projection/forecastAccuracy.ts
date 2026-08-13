// services/projection/forecastAccuracy.ts
//
// [PASSE-REEL-2] « À quel point mon passé correspond au futur qui était estimé ? » — demande Marc
// du 2026-08-13, dans la même passe que `[PASSE-REEL-1]` (son passé affichait la PRÉVISION).
//
// ⚠️ LA RÉFÉRENCE EST FIGÉE, ET C'EST TOUT L'INTÉRÊT. **DÉCISION MARC** : on compare le réel à la
// courbe VERROUILLÉE (`lockedProjection`, figée au moment où Marc a cliqué « verrouiller »), jamais
// à une projection recalculée aujourd'hui. Une projection recalculée PART des soldes réels du jour :
// elle colle au passé par construction, l'écart serait nul, et l'indicateur dirait éternellement
// « tout va bien ». Un indicateur qui ne peut pas être mauvais ne vaut rien.
//
// No-fake-data, appliqué au pied de la lettre : cette fonction ne rend un écart QUE pour les mois où
// les DEUX valeurs existent réellement (un point de passé MESURÉ et une valeur verrouillée pour ce
// même mois). Pas de verrou, pas de passé mesuré, ou aucun recouvrement entre les deux ⇒ `null`.
// `null` doit se traduire à l'écran par une ABSENCE, jamais par « 0 % d'écart » — qui se lirait
// « ta prévision était parfaite ».

import type { ProjectionChartPoint } from './types';

/** Un mois du passé où réel ET prévision verrouillée existent tous les deux. */
export interface ForecastAccuracyMonth {
    /** Indice de mois (entier) du moteur. */
    monthIndex: number;
    /** Patrimoine net RÉELLEMENT mesuré (dernier jour mesuré du mois). */
    real: number;
    /** Patrimoine net que la courbe verrouillée PRÉVOYAIT pour ce mois. */
    forecast: number;
    /** `real − forecast`. Positif = Marc a fait MIEUX que prévu. */
    gap: number;
    /** `gap / |forecast|`, ou `null` si la prévision est nulle (division impossible, pas 0 %). */
    gapPct: number | null;
}

export interface ForecastAccuracy {
    /** Les mois comparables, du plus ancien au plus récent. Jamais vide (sinon on rend `null`). */
    months: ForecastAccuracyMonth[];
    /** Le mois comparable le plus RÉCENT — c'est le chiffre à mettre en avant. */
    latest: ForecastAccuracyMonth;
    /**
     * Écart ABSOLU moyen en $ sur tous les mois comparables. Mesure la FIDÉLITÉ de la prévision
     * (un plan qui se trompe de +50 k$ puis −50 k$ n'est pas « juste en moyenne »), là où `latest`
     * mesure la POSITION actuelle. Les deux répondent à des questions différentes.
     */
    meanAbsGap: number;
    /** Nombre de mois où Marc a fait mieux que prévu. */
    monthsAhead: number;
}

/** Lecture défensive d'un nombre : tout ce qui n'est pas fini est traité comme ABSENT. */
const finite = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;

/**
 * Compare le passé MESURÉ à la prévision VERROUILLÉE.
 *
 * @param pastPoints  Série quotidienne COMPLÈTE (passé mesuré ET futur projeté) : le tri se fait
 *                    ici, sur le seul marqueur de mesure `dayIsReal === true`. Passer la série
 *                    entière est donc sûr — c'est même le cas d'appel réel (`dailyAll`).
 * @param lockedByMonth  Map `monthIndex → patrimoine net prévu`, telle que produite par
 *                    `utils/lockedCurveOverlay.buildLockedByMonth`. `null` = pas de verrou.
 * @returns `null` si la comparaison n'a AUCUN sens (voir en-tête) — jamais un objet à zéros.
 */
export function computeForecastAccuracy(
    pastPoints: ReadonlyArray<ProjectionChartPoint>,
    lockedByMonth: ReadonlyMap<number, number> | null,
): ForecastAccuracy | null {
    if (!lockedByMonth || lockedByMonth.size === 0) return null;

    // Dernière valeur RÉELLE de chaque mois hôte. On prend la DERNIÈRE parce que la prévision
    // verrouillée est un point de FIN de mois : comparer un solde du 3 à une prévision du 31
    // fabriquerait un écart qui n'est que du décalage de calendrier.
    const lastRealByMonth = new Map<number, number>();
    for (const p of pastPoints) {
        const rec = p as unknown as Record<string, unknown>;
        // ⚠️ Le marqueur de MESURE est `dayIsReal`, PAS `dayIso`. Garder sur `dayIso` était faux et
        // silencieux : `dailyCurve.ts` construit le point d'une journée FUTURE par `{ ...d }`, qui
        // charrie `dayIso` — seul un point adossé à une mesure reçoit `dayIsReal: true`. La garde
        // laissait donc entrer les 30 ans de projection, et l'indicateur comparait la prévision
        // COURANTE à la prévision VERROUILLÉE au lieu du réel (revue Vercel #617).
        // Le marqueur structurel existait déjà — il fallait le lire, pas déduire d'un champ voisin.
        if (rec.dayIsReal !== true) continue;
        const nw = finite(rec.NetWorth);
        if (nw === null) continue;
        const host = finite(rec.hostMonthIndex);
        if (host === null) continue;
        lastRealByMonth.set(host, nw);
    }
    if (lastRealByMonth.size === 0) return null;

    const months: ForecastAccuracyMonth[] = [];
    for (const [monthIndex, real] of [...lastRealByMonth.entries()].sort((a, b) => a[0] - b[0])) {
        const forecast = lockedByMonth.get(monthIndex);
        if (forecast === undefined || !Number.isFinite(forecast)) continue;
        const gap = real - forecast;
        months.push({
            monthIndex,
            real,
            forecast,
            gap,
            // Une prévision à 0 $ rend le pourcentage indéfini — `null`, jamais `Infinity` ni 0.
            gapPct: forecast !== 0 ? gap / Math.abs(forecast) : null,
        });
    }
    if (months.length === 0) return null;

    const meanAbsGap = months.reduce((s, m) => s + Math.abs(m.gap), 0) / months.length;
    return {
        months,
        latest: months[months.length - 1],
        meanAbsGap,
        monthsAhead: months.filter((m) => m.gap > 0).length,
    };
}
