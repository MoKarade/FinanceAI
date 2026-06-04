/**
 * @vitest-environment jsdom
 *
 * Le tour guidé était cassé sur mobile : le même data-tour-id existe sur la sidebar desktop
 * (display:none → rect 0) ET la bottom-nav mobile. querySelector prenait toujours la 1ʳᵉ (desktop)
 * → rect 0 → pas de spotlight. findVisibleAnchorRect prend la 1ʳᵉ ancre VISIBLE.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { findVisibleAnchorRect } from '../../../components/tour/anchorRect';

function addAnchor(tab: string, r: { width: number; height: number; top?: number; left?: number }) {
    const el = document.createElement('div');
    el.setAttribute('data-tour-id', `nav-${tab}`);
    el.getBoundingClientRect = () => ({
        width: r.width, height: r.height, top: r.top ?? 0, left: r.left ?? 0,
        right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}),
    }) as DOMRect;
    document.body.appendChild(el);
}

afterEach(() => { document.body.innerHTML = ''; });

describe('findVisibleAnchorRect', () => {
    it('ignore l\'ancre cachée (rect 0) et prend la 1ʳᵉ visible (cas mobile)', () => {
        addAnchor('FUTURE', { width: 0, height: 0 });                        // sidebar desktop cachée
        addAnchor('FUTURE', { width: 100, height: 40, top: 200, left: 10 }); // bottom-nav visible
        expect(findVisibleAnchorRect('FUTURE')).toEqual({ top: 200, left: 10, width: 100, height: 40 });
    });

    it('retourne null si aucune ancre', () => {
        expect(findVisibleAnchorRect('FUTURE')).toBeNull();
    });

    it('retourne null si seule l\'ancre cachée existe (rect 0)', () => {
        addAnchor('FUTURE', { width: 0, height: 0 });
        expect(findVisibleAnchorRect('FUTURE')).toBeNull();
    });

    it('retourne le rect d\'une unique ancre visible', () => {
        addAnchor('BUDGET', { width: 56, height: 72, top: 700, left: 5 });
        expect(findVisibleAnchorRect('BUDGET')).toEqual({ top: 700, left: 5, width: 56, height: 72 });
    });
});
