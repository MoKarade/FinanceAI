// [R3] Tooltip figeable du graphe Futur — utilitaires PURS (testables sans React
// ni Recharts). La logique de positionnement et de résolution du point cliqué est
// isolée ici pour deux raisons : (1) la tester en isolation, (2) éviter de la
// dupliquer entre le clic conteneur (géométrie) et le hook de positionnement.

/** Largeur connue du tooltip (`w-72` = 288px dans ExpertTooltip). */
export const TOOLTIP_WIDTH = 288;
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
