// tests/hooks/useTimeChartZoom.wheelFixpoint.test.tsx
//
// [ZOOM-ROUND-FIXPOINT] Le bug que ces tests verrouillent : à PETIT span, l'arrondi entier ANNULAIT
// le cran de molette. À span 5, un cran (×0,85) retire 0,75 index réparti ~0,375 par borne —
// `Math.round` redonne les MÊMES entiers, et comme la base du cran suivant est la cible ARRONDIE,
// chaque cran repart du même point : zoom coincé sur un point fixe, EN SILENCE. Le dézoom
// souffrait du symétrique (×1,15 = +0,75). Conséquence utilisateur : `minPoints: 1` (demande Marc
// « je veux pouvoir zoomer un peu plus pour voir les jours individuels ») était INOPÉRANT, et une
// fois au plancher la molette ne savait plus REMONTER.
//
// Trouvé par SONDE (10 crans dispatchés, fenêtre inchangée), pas à la lecture — le code « avait
// l'air » correct, et l'e2e historique zoomait depuis 450 points, où 0,85 retire plusieurs unités
// entières par cran et où l'annulation n'apparaît jamais.

import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
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
    // jsdom rend une boîte 0×0 → `(clientX − left) / width` serait NaN et polluerait tout le
    // calcul en silence. On donne au conteneur une géométrie réelle.
    Object.defineProperty(host, 'getBoundingClientRect', {
        value: () => ({ left: 0, top: 0, right: 1000, bottom: 400, width: 1000, height: 400, x: 0, y: 0, toJSON: () => ({}) }),
    });
    return host;
}

/** File de frames à flusher MANUELLEMENT après chaque cran.
 *  ⚠️ Un stub rAF qui exécute le callback SYNCHRONEMENT est un piège : le callback tourne AVANT que
 *  l'id retourné soit affecté à `rafIdRef`, donc le hook croit un frame éternellement en attente et
 *  ne committe plus jamais — les tests mesuraient alors mon stub, pas le hook (vécu ici même). */
let rafQueue: FrameRequestCallback[] = [];
function flushRaf() {
    const q = rafQueue;
    rafQueue = [];
    for (const cb of q) cb(0);
}

/** Un cran de molette au MILIEU du graphe (cursorRel = 0,5 — le cas où l'annulation est maximale :
 *  la réduction se répartit également sur les deux bornes), suivi de son frame. */
function wheel(host: HTMLElement, deltaY: number) {
    act(() => {
        host.dispatchEvent(new WheelEvent('wheel', { deltaY, clientX: 500, bubbles: true, cancelable: true }));
        flushRaf();
    });
}

beforeEach(() => {
    rafQueue = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { rafQueue.push(cb); return rafQueue.length; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
});

describe('useTimeChartZoom — le cran de molette ne peut PAS être annulé par l’arrondi', () => {
    it('DISCRIMINANT zoom-in : à span 5 avec minPoints 1, UN cran réduit la fenêtre', () => {
        // Avant le fix : ×0,85 sur span 5 = bornes déplacées de ~0,375 → round inchangé → point
        // fixe. Le zoom « marchait » partout sauf exactement là où Marc voulait aller.
        const host = mount(1);
        act(() => zoomApi!.showRange(10, 15));
        expect(zoomApi!.range).toEqual([10, 15]);
        wheel(host, -400);
        const span = zoomApi!.range![1] - zoomApi!.range![0];
        expect(span).toBeLessThan(5);
    });

    it('des crans répétés descendent jusqu’au plancher minPoints (2 points visibles = 1 mois rendu)', () => {
        const host = mount(1);
        act(() => zoomApi!.showRange(10, 15));
        for (let i = 0; i < 20; i++) wheel(host, -400);
        expect(zoomApi!.range![1] - zoomApi!.range![0]).toBe(1);
    });

    it('DISCRIMINANT dézoom : à span 5, UN cran élargit la fenêtre (la molette savait descendre mais plus remonter)', () => {
        const host = mount(1);
        act(() => zoomApi!.showRange(10, 15));
        wheel(host, 400);
        expect(zoomApi!.range![1] - zoomApi!.range![0]).toBeGreaterThan(5);
    });

    it('le plancher minPoints reste RESPECTÉ : à span = minPoints, zoom-in est un no-op', () => {
        const host = mount(3);
        act(() => zoomApi!.showRange(10, 13));
        wheel(host, -400);
        expect(zoomApi!.range).toEqual([10, 13]);
    });

    it('à GRAND span le comportement est inchangé (le forçage ne s’active que si l’arrondi annule)', () => {
        const host = mount(1);
        act(() => zoomApi!.showRange(0, 100));
        wheel(host, -400);
        const span = zoomApi!.range![1] - zoomApi!.range![0];
        // ×0,85 sur 100 ≈ 85 — le pas forcé d'UNE unité ne doit jamais remplacer le facteur.
        expect(span).toBeGreaterThan(80);
        expect(span).toBeLessThan(90);
    });

    it('le dézoom répété remonte jusqu’à la vue complète (range null)', () => {
        const host = mount(1);
        act(() => zoomApi!.showRange(10, 12));
        for (let i = 0; i < 60; i++) wheel(host, 400);
        expect(zoomApi!.range).toBeNull();
    });
});
