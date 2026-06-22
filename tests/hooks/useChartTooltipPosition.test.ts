import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChartTooltipPosition } from '../../hooks/useChartTooltipPosition';

// Points de test minimaux : la clé d'identité = `m`.
interface P { m: number }
const getKey = (p: P) => p.m;

let containerEl: HTMLDivElement;
let containerRef: { current: HTMLElement | null };

beforeEach(() => {
    containerEl = document.createElement('div');
    document.body.appendChild(containerEl);
    containerRef = { current: containerEl };
});
afterEach(() => {
    containerEl.remove();
});

const setup = () => renderHook(() => useChartTooltipPosition<P>({ getKey, containerRef }));

describe('useChartTooltipPosition — machine d\'état', () => {
    it('état initial : idle, aucun point', () => {
        const { result } = setup();
        expect(result.current.mode).toBe('idle');
        expect(result.current.point).toBeNull();
    });

    it('onHoverPoint → hovering + point', () => {
        const { result } = setup();
        act(() => result.current.onHoverPoint({ m: 3 }));
        expect(result.current.mode).toBe('hovering');
        expect(result.current.point).toEqual({ m: 3 });
    });

    it('onHoverPoint avec la MÊME clé garde la même référence (dédup re-render)', () => {
        const { result } = setup();
        act(() => result.current.onHoverPoint({ m: 3 }));
        const first = result.current.point;
        act(() => result.current.onHoverPoint({ m: 3 })); // même clé, nouvel objet
        expect(result.current.point).toBe(first); // référence inchangée
        act(() => result.current.onHoverPoint({ m: 4 })); // clé différente
        expect(result.current.point).toEqual({ m: 4 });
    });

    it('onChartLeave en survol → idle + null', () => {
        const { result } = setup();
        act(() => result.current.onHoverPoint({ m: 1 }));
        act(() => result.current.onChartLeave());
        expect(result.current.mode).toBe('idle');
        expect(result.current.point).toBeNull();
    });

    it('freezeOn(null) sans point courant = no-op (reste idle)', () => {
        const { result } = setup();
        act(() => result.current.freezeOn(null));
        expect(result.current.mode).toBe('idle');
        expect(result.current.point).toBeNull();
    });

    it('survol puis freezeOn(null) → fige sur le point courant', () => {
        const { result } = setup();
        act(() => result.current.onHoverPoint({ m: 2 }));
        act(() => result.current.freezeOn(null));
        expect(result.current.mode).toBe('frozen');
        expect(result.current.point).toEqual({ m: 2 });
    });

    it('freezeOn(point) → frozen + ce point', () => {
        const { result } = setup();
        act(() => result.current.freezeOn({ m: 7 }));
        expect(result.current.mode).toBe('frozen');
        expect(result.current.point).toEqual({ m: 7 });
    });

    it('gelé : onHoverPoint(autre) est IGNORÉ (reste ancré sur le point figé)', () => {
        const { result } = setup();
        act(() => result.current.freezeOn({ m: 7 }));
        act(() => result.current.onHoverPoint({ m: 99 }));
        expect(result.current.mode).toBe('frozen');
        expect(result.current.point).toEqual({ m: 7 });
    });

    it('release() → idle + null', () => {
        const { result } = setup();
        act(() => result.current.freezeOn({ m: 7 }));
        act(() => result.current.release());
        expect(result.current.mode).toBe('idle');
        expect(result.current.point).toBeNull();
    });
});

describe('useChartTooltipPosition — listeners document (gelé seulement)', () => {
    it('Échap en gelé → libère', () => {
        const { result } = setup();
        act(() => result.current.freezeOn({ m: 1 }));
        act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
        expect(result.current.mode).toBe('idle');
    });

    it('Échap N\'A AUCUN effet hors gelé (listener non monté)', () => {
        const { result } = setup();
        act(() => result.current.onHoverPoint({ m: 1 }));
        act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
        expect(result.current.mode).toBe('hovering'); // toujours en survol
    });

    it('clic-dehors (hors graphe et hors tooltip) en gelé → libère', () => {
        const { result } = setup();
        const outside = document.createElement('div');
        document.body.appendChild(outside);
        act(() => result.current.freezeOn({ m: 1 }));
        act(() => { outside.dispatchEvent(new Event('pointerdown', { bubbles: true })); });
        expect(result.current.mode).toBe('idle');
        outside.remove();
    });

    it('clic DANS le graphe en gelé NE libère PAS (re-fige géré par onClick)', () => {
        const { result } = setup();
        act(() => result.current.freezeOn({ m: 1 }));
        act(() => { containerEl.dispatchEvent(new Event('pointerdown', { bubbles: true })); });
        expect(result.current.mode).toBe('frozen');
    });

    it('clic DANS le tooltip en gelé NE libère PAS (scroll, bouton)', () => {
        const { result } = setup();
        const tipEl = document.createElement('div');
        document.body.appendChild(tipEl);
        result.current.tooltipRef.current = tipEl;
        act(() => result.current.freezeOn({ m: 1 }));
        act(() => { tipEl.dispatchEvent(new Event('pointerdown', { bubbles: true })); });
        expect(result.current.mode).toBe('frozen');
        tipEl.remove();
    });
});

describe('useChartTooltipPosition — positionnement', () => {
    const attachTip = (result: { current: { tooltipRef: React.RefObject<HTMLDivElement | null> } }) => {
        const tip = document.createElement('div');
        Object.defineProperty(tip, 'offsetHeight', { value: 200, configurable: true });
        document.body.appendChild(tip);
        result.current.tooltipRef.current = tip;
        return tip;
    };

    it('en survol, onPointerMove positionne le tooltip (left/top mutés)', () => {
        const { result } = setup();
        const tip = attachTip(result);
        act(() => result.current.onHoverPoint({ m: 1 }));
        act(() => result.current.onPointerMove(400, 300));
        // viewport jsdom 1024×768 : 400+16=416, 300−24=276 (dans les bornes).
        expect(tip.style.left).toBe('416px');
        expect(tip.style.top).toBe('276px');
        tip.remove();
    });

    it('GELÉ : onPointerMove NE déplace PLUS le tooltip (ancré au point de figeage)', () => {
        const { result } = setup();
        const tip = attachTip(result);
        act(() => result.current.onHoverPoint({ m: 1 }));
        act(() => result.current.onPointerMove(400, 300));
        act(() => result.current.freezeOn(null)); // fige à 416/276
        act(() => result.current.onPointerMove(700, 700)); // ignoré en gelé
        expect(tip.style.left).toBe('416px');
        expect(tip.style.top).toBe('276px');
        tip.remove();
    });
});
