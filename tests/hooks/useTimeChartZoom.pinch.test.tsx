// tests/hooks/useTimeChartZoom.pinch.test.tsx
//
// [FUTUR-DAILY-TOUCH] Pincement 2 doigts = zoom + pan combinés (retour Marc 2026-08-12 :
// « je veux pouvoir zoomer parce que pour l'instant sur le tel c'est inutilisable »).
// Cadrage : 2 doigts = geste du graphe, 1 doigt = la page scrolle (touch-action: pan-y).
//
// La base du geste est FIGÉE au touchstart (span0/dist0/idx0) et chaque touchmove dérive la
// fenêtre par RATIO depuis cette base — pas d'incrément sur la cible arrondie précédente, donc
// pas de point-fixe d'arrondi possible (le piège [ZOOM-ROUND-FIXPOINT] de la molette).

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { useTimeChartZoom, type TimeChartZoom } from '../../hooks/useTimeChartZoom';

const DATA = Array.from({ length: 200 }, (_, i) => ({ monthIndex: i }));

let zoomApi: TimeChartZoom<{ monthIndex: number }> | null = null;

function Probe({ minPoints }: { minPoints?: number }) {
    const zoom = useTimeChartZoom(DATA, minPoints === undefined ? undefined : { minPoints });
    zoomApi = zoom;
    return <div data-testid="host" ref={zoom.containerRef} />;
}

function mount(minPoints?: number): HTMLElement {
    zoomApi = null;
    const { getByTestId } = render(<Probe minPoints={minPoints} />);
    const host = getByTestId('host');
    // jsdom rend une boîte 0×0 → (clientX − left) / width = NaN silencieux. Géométrie réelle.
    Object.defineProperty(host, 'getBoundingClientRect', {
        value: () => ({ left: 0, top: 0, right: 1000, bottom: 400, width: 1000, height: 400, x: 0, y: 0, toJSON: () => ({}) }),
    });
    return host;
}

/** File rAF flushée manuellement (un stub SYNCHRONE fausserait rafIdRef — vécu, cf. wheelFixpoint). */
let rafQueue: FrameRequestCallback[] = [];
function flushRaf() {
    const q = rafQueue;
    rafQueue = [];
    for (const cb of q) cb(0);
}

beforeEach(() => {
    rafQueue = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { rafQueue.push(cb); return rafQueue.length; });
    vi.stubGlobal('cancelAnimationFrame', () => { /* la file est reconstruite par test */ });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

/** Événement touch jsdom : `TouchEvent` n'est pas constructible avec `touches` en jsdom →
 *  Event nu + propriété `touches` définie à la main (le hook ne lit que clientX/clientY). */
function touch(host: HTMLElement, type: string, points: Array<[number, number]>) {
    const e = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'touches', {
        value: points.map(([x, y]) => ({ clientX: x, clientY: y })),
    });
    act(() => {
        host.dispatchEvent(e);
        flushRaf();
    });
    return e;
}

describe('useTimeChartZoom — pincement 2 doigts', () => {
    it('écarter les doigts = zoom in, le point saisi reste sous le point médian des doigts', () => {
        const host = mount();
        // Doigts à 400/600 px → médian 500 px (milieu, midRel 0,5), écart 200 px.
        touch(host, 'touchstart', [[400, 200], [600, 200]]);
        // Écart ×2 (200 → 400 px), même médian → span ÷2, toujours centré sur l'index 99,5.
        touch(host, 'touchmove', [[300, 200], [700, 200]]);
        const r = zoomApi!.range;
        expect(r).not.toBeNull();
        const [start, end] = r!;
        const span = end - start;
        expect(span).toBeGreaterThan(90);   // 199 / 2 ≈ 99,5 → arrondi
        expect(span).toBeLessThan(110);
        // Invariant du geste : l'index saisi (99,5) reste sous le médian (midRel 0,5).
        expect(start + 0.5 * span).toBeGreaterThan(94);
        expect(start + 0.5 * span).toBeLessThan(105);
        expect(zoomApi!.isZoomed).toBe(true);
    });

    it('doigts partis COLLÉS puis écartés = zoom quand même (armement au touchmove)', () => {
        // Le cas RÉEL d'un pincement d'écartement (mesuré par sonde CDP synthesizePinchGesture) :
        // touchstart à écart quasi nul, l'écart ne devient mesurable qu'en cours de geste.
        // N'armer qu'au touchstart laissait le graphe INERTE au doigt.
        const host = mount();
        touch(host, 'touchstart', [[498, 200], [502, 200]]); // écart 4 px < 12 : pas de base
        expect(zoomApi!.range).toBeNull();
        touch(host, 'touchmove', [[450, 200], [550, 200]]);  // écart 100 px : la base se pose ICI
        touch(host, 'touchmove', [[300, 200], [700, 200]]);  // écart ×4 → span ÷4
        const [start, end] = zoomApi!.range!;
        expect(end - start).toBeLessThan(70); // 199/4 ≈ 50, marge d'arrondi
        expect(zoomApi!.isZoomed).toBe(true);
    });

    it('translater les deux doigts sans changer l’écart = pan pur (même taille de fenêtre)', () => {
        const host = mount();
        touch(host, 'touchstart', [[400, 200], [600, 200]]);
        touch(host, 'touchmove', [[300, 200], [700, 200]]); // zoom ÷2 d'abord
        const [s1, e1] = zoomApi!.range!;
        touch(host, 'touchend', [[300, 200]]);
        // Nouveau geste : même écart (400 px), médian déplacé de 500 → 700 px (vers la droite).
        touch(host, 'touchstart', [[500, 200], [900, 200]]);
        touch(host, 'touchmove', [[300, 200], [700, 200]]); // médian 700 → 500 : les DONNÉES suivent les doigts
        const [s2, e2] = zoomApi!.range!;
        expect(e2 - s2).toBe(e1 - s1);      // l'écart des doigts n'a pas changé → même span
        expect(s2).toBeGreaterThan(s1);     // médian parti vers la gauche = fenêtre vers la droite
    });

    it('resserrer les doigts depuis une vue zoomée = dézoom, jusqu’au retour vue complète (range null)', () => {
        const host = mount();
        touch(host, 'touchstart', [[400, 200], [600, 200]]);
        touch(host, 'touchmove', [[300, 200], [700, 200]]);
        expect(zoomApi!.isZoomed).toBe(true);
        touch(host, 'touchend', []);
        // Geste inverse : partir écartés, resserrer FORT → span × 4 ≥ vue complète → null.
        touch(host, 'touchstart', [[100, 200], [900, 200]]);
        touch(host, 'touchmove', [[450, 200], [550, 200]]);
        expect(zoomApi!.range).toBeNull();
        expect(zoomApi!.isZoomed).toBe(false);
    });

    it('le zoom est borné par minPoints même si les doigts s’écartent à l’extrême', () => {
        const host = mount(5);
        touch(host, 'touchstart', [[490, 200], [510, 200]]); // écart 20 px
        touch(host, 'touchmove', [[10, 200], [990, 200]]);   // écart 980 px → span ÷49 → plancher
        const [start, end] = zoomApi!.range!;
        expect(end - start).toBe(5);
    });

    it('1 doigt = AUCUN effet (la page garde son scroll), et touch-action pan-y est posé', () => {
        const host = mount();
        expect(host.style.touchAction).toBe('pan-y');
        touch(host, 'touchstart', [[500, 200]]);
        touch(host, 'touchmove', [[300, 200]]);
        expect(zoomApi!.range).toBeNull();
    });

    it('2 doigts sur le graphe : touchstart et touchmove sont ANNULÉS (pas de zoom de page)', () => {
        const host = mount();
        const start = touch(host, 'touchstart', [[400, 200], [600, 200]]);
        const move = touch(host, 'touchmove', [[300, 200], [700, 200]]);
        expect(start.defaultPrevented).toBe(true);
        expect(move.defaultPrevented).toBe(true);
        // 1 doigt, lui, n'est jamais annulé.
        touch(host, 'touchend', [[300, 200]]);
        const solo = touch(host, 'touchmove', [[310, 200]]);
        expect(solo.defaultPrevented).toBe(false);
    });

    it('isPinchActive : vrai pendant le geste et < 500 ms après, faux ensuite (garde du tap)', () => {
        vi.useFakeTimers();
        const host = mount();
        expect(zoomApi!.isPinchActive()).toBe(false);
        touch(host, 'touchstart', [[400, 200], [600, 200]]);
        expect(zoomApi!.isPinchActive()).toBe(true);
        touch(host, 'touchend', [[400, 200]]); // il reste 1 doigt → pincement terminé
        expect(zoomApi!.isPinchActive()).toBe(true);   // fenêtre de grâce
        vi.advanceTimersByTime(600);
        expect(zoomApi!.isPinchActive()).toBe(false);
    });
});
