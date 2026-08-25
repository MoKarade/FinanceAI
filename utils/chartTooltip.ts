// [R3] Tooltip figeable du graphe Futur — utilitaires PURS (testables sans React
// ni Recharts). La logique de positionnement et de résolution du point cliqué est
// isolée ici pour deux raisons : (1) la tester en isolation, (2) éviter de la
// dupliquer entre le clic conteneur (géométrie) et le hook de positionnement.

/**
 * Largeur connue du tooltip (`w-80` = 320px dans ExpertTooltip).
 *
 * ⚠️ [FUTUR-INFOBULLE-EPUREE] Cette constante DUPLIQUE une classe Tailwind : elle sert à borner la
 * position au viewport, et rien au runtime ne les confronte. Élargir la classe sans elle donne une
 * infobulle qui déborde du bord droit — silencieusement, sur le seul écran où ça se voit (petit
 * portable). Garde qui les confronte : `tests/components/tooltipLargeur.test.ts`.
 */
export const TOOLTIP_WIDTH = 320;

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

/** Décalage horizontal du tooltip vs le curseur (à droite). */
export const TOOLTIP_OFFSET_X = 16;
/** Décalage vertical du tooltip vs le curseur (légèrement au-dessus). */
export const TOOLTIP_OFFSET_Y = -24;
/** Marge minimale entre le tooltip et le bord du viewport. */
export const TOOLTIP_MARGIN = 8;

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

export interface ClampTooltipArgs {
    cursorX: number;
    cursorY: number;
    tooltipWidth: number;
    tooltipHeight: number;
    viewportWidth: number;
    viewportHeight: number;
    offsetX: number;
    offsetY: number;
    margin: number;
}

/**
 * Positionne le tooltip `position:fixed` près du curseur, borné au viewport
 * (jamais coupé par un bord). Si le viewport est plus petit que le tooltip, on
 * colle à la marge (le `max(margin, …)` empêche une borne haute < borne basse).
 */
export function clampTooltipPosition(args: ClampTooltipArgs): { left: number; top: number } {
    const { cursorX, cursorY, tooltipWidth, tooltipHeight, viewportWidth, viewportHeight, offsetX, offsetY, margin } = args;
    const left = clamp(cursorX + offsetX, margin, Math.max(margin, viewportWidth - tooltipWidth - margin));
    const top = clamp(cursorY + offsetY, margin, Math.max(margin, viewportHeight - tooltipHeight - margin));
    return { left, top };
}
