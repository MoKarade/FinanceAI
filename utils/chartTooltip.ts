// Utilitaires PURS des graphes (testables sans React ni Recharts) : le style partagé des
// infobulles Recharts, et la résolution du point de données sous un clic ou une abscisse.
//
// ⚠️ [FUTUR-PANNEAU-FIXE 2026-09-18] TOUT LE POSITIONNEMENT A ÉTÉ RETIRÉ D'ICI — `TOOLTIP_WIDTH`,
// les deux décalages, la marge et `clampTooltipPosition`. Ils servaient à placer l'infobulle
// FLOTTANTE du graphe Futur près du curseur sans qu'elle soit coupée par un bord d'écran. Cette
// infobulle n'existe plus : son contenu est rendu par le PANNEAU FIXE sous le graphe, qui vit dans
// le flux du document et n'a donc ni largeur de chrome, ni position à calculer. Les garder aurait
// laissé un système complet sans consommateur, et surtout une DESCRIPTION d'un comportement que
// l'app n'a plus — ce qu'un prochain lot aurait lu comme un fait
// (`DOC-STALE-IMPOSSIBILITY`). La RÈGLE qu'ils portaient (ne pas reposer une largeur de chrome en
// dur) est reprise, inversée, par `tests/components/tooltipLargeur.test.ts`.

/**
 * [DETTE-CHART-THEME-DUP] Style unique des infobulles Recharts (`contentStyle`).
 *
 * ⚠️ MESURÉ avant d'écrire cette constante : 14 infobulles dans l'app, **9 styles distincts**, et
 * **six fonds différents** pour la même surface — `#1e1e1e` (×4), `#151922` (×2), `#1a1a1a` (×2),
 * `#1a1e29`, `#111`, `#0B0E14` (×2)… et **deux infobulles BLANCHES** (`#fff` sur texte noir) au
 * milieu d'une app sombre. AUCUN de ces fonds n'existe dans la palette : les 14 étaient peintes à
 * la main, hors du système de design. Le ticket disait « dédupliquer » ; ce qui se mesure, c'est
 * qu'aucune n'utilisait les tokens.
 *
 * Le fond est `surfaceHighlight` — l'infobulle est une surface ÉLEVÉE au-dessus de `surface`/`dark`,
 * c'est exactement ce que ce token nomme. Le texte est `ink-100` : **ratio 14,42** sur ce fond
 * (mesuré, WCAG AA exige 4,5). Choisi par mesure, jamais au jugé.
 *
 * ⚠️ Ces valeurs DUPLIQUENT les tokens de `tailwind.config.js` — un `contentStyle` part dans une
 * prop de composant TIERS, il ne peut pas être une classe Tailwind. Rien au runtime ne les
 * confronte, donc la garde le fait : `tests/components/chartTooltipTheme.test.ts` lit la config et
 * exige l'égalité (même patron que `TOOLTIP_WIDTH` ci-dessus).
 */
export const CHART_TOOLTIP_STYLE = {
    backgroundColor: '#15181E',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: 8,
    color: '#e2e8f0',
} as const;

/** Style des LIGNES de l'infobulle — Recharts ne fait pas hériter la couleur du conteneur. */
export const CHART_TOOLTIP_ITEM_STYLE = { color: '#e2e8f0' } as const;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const clamp01 = (v: number): number => clamp(v, 0, 1);

/**
 * Résout le point de données correspondant à un clic, par GÉOMÉTRIE : position X
 * du clic relative à la grille cartésienne → indice dans la tranche visible.
 * Robuste (marche au tactile, sans survol préalable, là où Recharts ne déclenche
 * pas toujours son `onClick` interne). Retourne `null` si la grille est absente,
 * dégénérée (largeur ≤ 0) ou si les données sont vides.
 */
export function resolvePointFromClick<T>(
    clientX: number,
    gridRect: { left: number; width: number } | null | undefined,
    data: readonly T[],
): T | null {
    if (!gridRect || gridRect.width <= 0 || data.length === 0) return null;
    const frac = clamp01((clientX - gridRect.left) / gridRect.width);
    const idx = Math.round(frac * (data.length - 1));
    return data[idx] ?? null;
}

/**
 * Résout le point correspondant à un clic **par VALEUR D'ABSCISSE**, et non par indice.
 *
 * ⚠️ POURQUOI CETTE VARIANTE EXISTE. `resolvePointFromClick` mappe la position sur un INDICE de
 * tableau — correct tant que les points sont régulièrement espacés (un par mois). Une série
 * QUOTIDIENNE ne l'est pas : un jour de février vaut 1/28 de mois, un jour de mars 1/31. Résoudre
 * par indice y renverrait le mauvais jour, d'autant plus loin que la fenêtre mélange des mois de
 * longueurs différentes — et sans rien casser visiblement (le clic « marche », il sélectionne juste
 * un autre jour). C'est exactement le type de faute silencieuse que cet écran ne peut pas se
 * permettre.
 *
 * L'axe étant numérique à domaine `[dataMin, dataMax]`, la position se convertit linéairement en
 * abscisse, puis on prend le point le PLUS PROCHE. Fonctionne aussi pour une série uniforme.
 */
export function resolvePointByX<T>(
    clientX: number,
    gridRect: { left: number; width: number } | null | undefined,
    data: readonly T[],
    getX: (item: T) => number,
): T | null {
    if (!gridRect || gridRect.width <= 0 || data.length === 0) return null;
    let minX = Infinity;
    let maxX = -Infinity;
    for (const d of data) {
        const x = getX(d);
        if (!Number.isFinite(x)) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
    }
    if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return null;
    // Domaine dégénéré (un seul point, ou tous à la même abscisse) : pas d'échelle à inverser.
    if (maxX === minX) return data[0] ?? null;

    const target = minX + clamp01((clientX - gridRect.left) / gridRect.width) * (maxX - minX);
    let best: T | null = null;
    let bestDist = Infinity;
    for (const d of data) {
        const x = getX(d);
        if (!Number.isFinite(x)) continue;
        const dist = Math.abs(x - target);
        if (dist < bestDist) { bestDist = dist; best = d; }
    }
    return best;
}
