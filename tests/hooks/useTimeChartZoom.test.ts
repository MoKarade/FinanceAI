import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTimeChartZoom } from '../../hooks/useTimeChartZoom';

// Le hook coalesce molette/pan en requestAnimationFrame : le setRange n'est PAS synchrone, il est
// appliqué au frame suivant. Ces tests vérifient que le comportement (zoom/reset) marche toujours
// APRÈS le flush du frame, et qu'un burst de plusieurs crans aboutit à un état cohérent (un commit).

const flushFrame = (): Promise<void> =>
    act(async () => { await new Promise<void>((r) => requestAnimationFrame(() => r())); });

function makeNode(width = 600): HTMLDivElement {
    const node = document.createElement('div');
    // jsdom renvoie des zéros pour getBoundingClientRect → on mocke une largeur réelle (sinon NaN).
    node.getBoundingClientRect = () =>
        ({ left: 0, top: 0, right: width, bottom: 300, width, height: 300, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    document.body.appendChild(node);
    return node;
}

const wheel = (node: HTMLDivElement, deltaY: number, clientX = 300): void => {
    node.dispatchEvent(new WheelEvent('wheel', { deltaY, clientX, cancelable: true, bubbles: true }));
};

describe('useTimeChartZoom — coalescence rAF', () => {
    const data = Array.from({ length: 30 }, (_, i) => ({ i }));

    it('un burst de molette (zoom in) → zoomé après UN frame, fenêtre rétrécie (≥ minPoints)', async () => {
        const { result } = renderHook(() => useTimeChartZoom(data));
        const node = makeNode(600);
        act(() => { result.current.containerRef(node); });
        expect(result.current.isZoomed).toBe(false);

        act(() => { for (let k = 0; k < 3; k++) wheel(node, -100); });
        await flushFrame();

        expect(result.current.isZoomed).toBe(true);
        expect(result.current.visibleData.length).toBeLessThan(30);
        expect(result.current.visibleData.length).toBeGreaterThanOrEqual(5);
    });

    it('reset() revient à la vue complète', async () => {
        const { result } = renderHook(() => useTimeChartZoom(data));
        const node = makeNode(600);
        act(() => { result.current.containerRef(node); });
        act(() => { wheel(node, -100); });
        await flushFrame();
        expect(result.current.isZoomed).toBe(true);

        act(() => { result.current.reset(); });
        expect(result.current.isZoomed).toBe(false);
        expect(result.current.visibleData.length).toBe(30);
    });
});
