import { describe, it, expect } from 'vitest';
import {
    resolvePointFromClick,
    clampTooltipPosition,
    TOOLTIP_WIDTH,
    TOOLTIP_OFFSET_X,
    TOOLTIP_OFFSET_Y,
    TOOLTIP_MARGIN,
} from '../../utils/chartTooltip';

describe('resolvePointFromClick — résolution géométrique du point cliqué', () => {
    const data = [{ m: 0 }, { m: 1 }, { m: 2 }, { m: 3 }, { m: 4 }]; // 5 points
    const grid = { left: 100, width: 400 }; // 1 point tous les 100px à partir de x=100

    it('retourne null si données vides', () => {
        expect(resolvePointFromClick(200, grid, [])).toBeNull();
    });

    it('retourne null si la grille est absente ou dégénérée (width ≤ 0)', () => {
        expect(resolvePointFromClick(200, null, data)).toBeNull();
        expect(resolvePointFromClick(200, { left: 0, width: 0 }, data)).toBeNull();
    });

    it('clic au bord gauche → premier point', () => {
        expect(resolvePointFromClick(100, grid, data)).toBe(data[0]);
    });

    it('clic au bord droit → dernier point', () => {
        expect(resolvePointFromClick(500, grid, data)).toBe(data[4]);
    });

    it('clic au milieu → point médian (frac 0,5 × 4 = 2)', () => {
        expect(resolvePointFromClick(300, grid, data)).toBe(data[2]);
    });

    it('clic hors grille (avant/après) est clampé aux extrémités', () => {
        expect(resolvePointFromClick(-50, grid, data)).toBe(data[0]);
        expect(resolvePointFromClick(9999, grid, data)).toBe(data[4]);
    });
});

describe('clampTooltipPosition — positionnement borné au viewport', () => {
    const base = {
        tooltipWidth: TOOLTIP_WIDTH,
        tooltipHeight: 200,
        viewportWidth: 1200,
        viewportHeight: 800,
        offsetX: TOOLTIP_OFFSET_X,
        offsetY: TOOLTIP_OFFSET_Y,
        margin: TOOLTIP_MARGIN,
    };

    it('cas nominal : décalage appliqué (droite + légèrement au-dessus)', () => {
        const { left, top } = clampTooltipPosition({ ...base, cursorX: 400, cursorY: 300 });
        expect(left).toBe(400 + TOOLTIP_OFFSET_X);
        expect(top).toBe(300 + TOOLTIP_OFFSET_Y);
    });

    it('curseur près du bord DROIT : le tooltip ne déborde pas', () => {
        const { left } = clampTooltipPosition({ ...base, cursorX: 1190, cursorY: 300 });
        expect(left).toBe(base.viewportWidth - TOOLTIP_WIDTH - TOOLTIP_MARGIN);
        expect(left + TOOLTIP_WIDTH).toBeLessThanOrEqual(base.viewportWidth - TOOLTIP_MARGIN);
    });

    it('curseur près du bord BAS : le tooltip ne déborde pas', () => {
        const { top } = clampTooltipPosition({ ...base, cursorX: 400, cursorY: 795 });
        expect(top).toBe(base.viewportHeight - base.tooltipHeight - TOOLTIP_MARGIN);
    });

    it('curseur en haut à gauche : borné à la marge minimale', () => {
        const { left, top } = clampTooltipPosition({ ...base, cursorX: 0, cursorY: 0 });
        expect(left).toBe(TOOLTIP_OFFSET_X); // 0 + 16 = 16 (> marge → conservé)
        expect(top).toBe(TOOLTIP_MARGIN);    // 0 − 24 = −24 → clampé à la marge (8)
    });

    it('viewport plus petit que le tooltip : on colle à la marge (pas de borne incohérente)', () => {
        const { left, top } = clampTooltipPosition({
            ...base, cursorX: 50, cursorY: 50, viewportWidth: 100, viewportHeight: 100,
        });
        expect(left).toBe(TOOLTIP_MARGIN);
        expect(top).toBe(TOOLTIP_MARGIN);
    });
});
