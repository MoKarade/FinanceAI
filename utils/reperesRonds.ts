// utils/reperesRonds.ts
//
// [S5-REFONTE] Repères « ronds » d'un axe de montants (maquettes : −5, 0, 5, 10, 15, 20 k$) : pas de
// 1 / 2 / 2,5 / 5 × 10ⁿ le plus proche du quart de l'étendue, repères compris DANS [min, max] (la
// courbe peut dépasser le dernier). recharts, laissé seul, découpe l'étendue brute (22, 17, 11, 6 k$).

/** Repères entre `min` (≤ 0) et `max` ; `undefined` si l'étendue est nulle (recharts décide alors). */
export function reperesRonds(valeurs: readonly number[]): number[] | undefined {
    const finies = valeurs.filter(Number.isFinite);
    const max = Math.max(0, ...finies);
    const min = Math.min(0, ...finies);
    const etendue = max - min;
    if (!(etendue > 0)) return undefined;
    const brut = etendue / 4;
    const puissance = 10 ** Math.floor(Math.log10(brut));
    const pas = [1, 2, 2.5, 5, 10].map((f) => f * puissance)
        .reduce((a, b) => (Math.abs(b - brut) < Math.abs(a - brut) ? b : a));
    const r: number[] = [];
    for (let v = Math.ceil(min / pas) * pas; v <= max + 1e-9; v += pas) r.push(Math.round(v * 1e6) / 1e6 || 0);
    return r;
}
