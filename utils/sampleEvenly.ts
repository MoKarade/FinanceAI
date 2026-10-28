// utils/sampleEvenly.ts
// [FUTUR-ICON-DENSITY] Échantillonnage à densité PLAFONNÉE d'un tableau ordonné, pour l'affichage des
// pastilles d'événements du graphe Futur (lisibilité en vue dézoomée). Bug Marc « pas assez d'icônes » :
// l'ancien échantillonnage par PAS ENTIER (`step = ceil(len/cap)`, garder `i % step === 0`) sous-remplit
// gravement le plafond dès que `len` dépasse un peu `cap` — 25 événements pour un cap de 24 → 13 montrés
// (step=2), 17 pour 16 → 9. On voyait donc souvent ~la MOITIÉ du plafond.
//
// Correctif : répartir EXACTEMENT `cap` indices uniformément sur `[0, len-1]` (extrémités incluses).
// Comme `len > cap` ⇒ le pas réel `(len-1)/(cap-1) > 1` ⇒ les indices arrondis sont strictement
// croissants ⇒ exactement `cap` éléments DISTINCTS, bien étalés (le plafond est enfin atteint).

/**
 * Rend au plus `cap` éléments de `arr`, uniformément répartis (1er et dernier toujours inclus quand
 * `arr.length > cap`). Si `arr.length <= cap`, rend une COPIE de `arr` (tous les éléments tiennent).
 * Préserve l'ordre. Ne duplique jamais un élément.
 */
export function sampleEvenly<T>(arr: readonly T[], cap: number): T[] {
    if (cap <= 0) return [];
    if (arr.length <= cap) return arr.slice();
    if (cap === 1) return [arr[0]];
    const out: T[] = [];
    for (let k = 0; k < cap; k++) {
        out.push(arr[Math.round((k * (arr.length - 1)) / (cap - 1))]);
    }
    return out;
}
