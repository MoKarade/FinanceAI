/**
 * @vitest-environment jsdom
 *
 * Le tour guidé était cassé sur mobile : le même data-tour-id existe sur la sidebar desktop
 * (display:none → rect 0) ET la bottom-nav mobile. querySelector prenait toujours la 1ʳᵉ (desktop)
 * → rect 0 → pas de spotlight. findVisibleAnchorRect prend la 1ʳᵉ ancre VISIBLE.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { findVisibleAnchorRect } from '../../../components/tour/anchorRect';

function addAnchor(
    tab: string,
    r: { width: number; height: number; top?: number; left?: number },
    style?: Partial<CSSStyleDeclaration>,
) {
    const el = document.createElement('div');
    el.setAttribute('data-tour-id', `nav-${tab}`);
    if (style) Object.assign(el.style, style);
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

/**
 * [TOUR-ANCHOR-INVISIBLE] `visibility:hidden` CONSERVE le layout — le rect reste non nul.
 *
 * Le test de taille seul ne pouvait donc pas voir un groupe de navigation replié à la main : le tour
 * projetait son spotlight sur un bouton invisible. Cas signalé par l'audit #600, préexistant, et
 * élargi par la nav à 6 destinations (Configurations = 5 onglets).
 */
describe('[TOUR-ANCHOR-INVISIBLE] un rect non nul ne suffit pas', () => {
    it('ignore une ancre de taille NON NULLE mais `visibility:hidden`', () => {
        addAnchor('SETTINGS', { width: 120, height: 40, top: 50, left: 8 }, { visibility: 'hidden' });
        addAnchor('SETTINGS', { width: 90, height: 36, top: 300, left: 12 });
        expect(findVisibleAnchorRect('SETTINGS')).toEqual({ top: 300, left: 12, width: 90, height: 36 });
    });

    it('retourne null si la SEULE ancre est masquée par `visibility`', () => {
        addAnchor('SETTINGS', { width: 120, height: 40 }, { visibility: 'hidden' });
        expect(findVisibleAnchorRect('SETTINGS'), 'le tour doit retomber sur sa carte centrée').toBeNull();
    });

    it('`display:none` reste attrapé, même si un rect non nul est simulé', () => {
        // Ceinture et bretelles : en vrai navigateur `display:none` donne un rect 0, mais rien ne
        // l'impose au stub — et c'est justement le genre d'écart qui rend une garde vacueuse.
        addAnchor('SETTINGS', { width: 120, height: 40 }, { display: 'none' });
        expect(findVisibleAnchorRect('SETTINGS')).toBeNull();
    });

    it('une ancre SANS style particulier reste visible (sens inverse)', () => {
        // Sans ce test, un `estVisible` qui renverrait toujours `false` passerait les trois
        // assertions ci-dessus — et casserait le tour partout.
        addAnchor('SETTINGS', { width: 120, height: 40, top: 10, left: 4 });
        expect(findVisibleAnchorRect('SETTINGS')).toEqual({ top: 10, left: 4, width: 120, height: 40 });
    });
});
