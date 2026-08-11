import { describe, it, expect } from 'vitest';
import {
    resolvePointFromClick,
    resolvePointByX,
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

// [FUTUR-DAILY lot B étape 2] Résolution par VALEUR D'ABSCISSE.
//
// Pourquoi cette fonction existe : la série QUOTIDIENNE n'est pas régulièrement espacée sur l'axe
// (un jour de février vaut 1/28 de mois, un jour de mars 1/31). `resolvePointFromClick`, qui mappe
// la position sur un INDICE, y renvoie donc le mauvais jour — sans que rien ne casse visiblement.
// Chaque test ci-dessous compare les DEUX fonctions sur la même entrée : c'est la preuve que la
// nouvelle discrimine, pas seulement qu'elle passe.
describe('resolvePointByX — le clic vise une abscisse, pas un rang', () => {
    const grid = { left: 100, width: 400 };
    const getX = <T extends { x: number }>(p: T) => p.x;

    // Deux mois collés : février (28 jours) puis mars (31). Abscisses = axisXAtDay.
    const feb = Array.from({ length: 28 }, (_, i) => ({ x: 0 + i / 28, tag: `fev-${i + 1}` }));
    const mar = Array.from({ length: 31 }, (_, i) => ({ x: 1 + i / 31, tag: `mar-${i + 1}` }));
    const days = [...feb, ...mar];

    it('retourne null sur une grille absente ou dégénérée, et sur des données vides', () => {
        expect(resolvePointByX(200, null, days, getX)).toBeNull();
        expect(resolvePointByX(200, { left: 100, width: 0 }, days, getX)).toBeNull();
        expect(resolvePointByX(200, grid, [], getX)).toBeNull();
    });

    it('vise le bon jour au MILIEU de la fenêtre, là où la résolution par rang dérive', () => {
        // Milieu géométrique de la fenêtre → abscisse (0 + 1 + 30/31) / 2 ≈ 0,9839. Le point le
        // plus proche est le 1er mars (x = 1,0000, écart 0,0161), devant le 28 février
        // (x = 0,9643, écart 0,0196).
        const byX = resolvePointByX(300, grid, days, getX);
        // Résolution par RANG : indice arrondi 29 sur 58 → 30e point = 2 mars.
        const byIndex = resolvePointFromClick(300, grid, days);
        expect(byX?.tag).toBe('mar-1');
        expect(byIndex?.tag).toBe('mar-2');
        // La preuve : les deux ne donnent PAS le même jour sur la même entrée.
        expect(byX?.tag).not.toBe(byIndex?.tag);
    });

    it('les bords restent exacts (et bornés hors de la grille)', () => {
        expect(resolvePointByX(100, grid, days, getX)?.tag).toBe('fev-1');
        expect(resolvePointByX(500, grid, days, getX)?.tag).toBe('mar-31');
        expect(resolvePointByX(-9999, grid, days, getX)?.tag).toBe('fev-1');
        expect(resolvePointByX(9999, grid, days, getX)?.tag).toBe('mar-31');
    });

    it('reste juste sur une série UNIFORME (le cas mensuel, inchangé)', () => {
        const months = [{ x: 0 }, { x: 1 }, { x: 2 }, { x: 3 }, { x: 4 }];
        expect(resolvePointByX(300, grid, months, getX)).toEqual({ x: 2 });
        expect(resolvePointByX(300, grid, months, getX)).toEqual(resolvePointFromClick(300, grid, months));
    });

    it('un domaine dégénéré ne divise pas par zéro', () => {
        const flat = [{ x: 5 }, { x: 5 }];
        expect(resolvePointByX(300, grid, flat, getX)).toEqual({ x: 5 });
    });

    it('ignore les abscisses non finies plutôt que de les choisir', () => {
        const withHole = [{ x: 0 }, { x: NaN }, { x: 1 }];
        expect(resolvePointByX(500, grid, withHole, getX)).toEqual({ x: 1 });
    });
});
