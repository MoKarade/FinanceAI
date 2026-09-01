// [A11Y-ROUTE-FOCUS] Un deep-link doit emmener le FOCUS, pas seulement la vue.
//
// ⚠️ `usePendingFocus` faisait défiler jusqu'à la section ciblée et la faisait clignoter. Les deux
// sont des signaux VISUELS : ils ne disent rien à qui navigue au clavier ou au lecteur d'écran —
// alors que c'est précisément un deep-link, c'est-à-dire un « emmène-moi là » explicite. Le focus
// restait donc où il était, et atteindre la section demandée exigeait de tabuler jusqu'à elle.
//
// ⚠️ La cible est un CONTENEUR (`data-focus-section`), pas un contrôle : sans `tabIndex`, `focus()`
// y est un no-op SILENCIEUX. C'est le genre de correctif qui a l'air posé et ne fait rien — d'où un
// test qui interroge `document.activeElement`, jamais la présence de l'appel.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, act } from '@testing-library/react';
import { usePendingFocus } from '../../utils/usePendingFocus';
import { useFinanceStore } from '../../store/useFinanceStore';
import { Tab } from '../../types';

const Harnais: React.FC<{ section: string }> = ({ section }) => {
    usePendingFocus(Tab.BUDGET);
    return (
        <div>
            <button type="button">ailleurs</button>
            <div data-focus-section={section}>contenu ciblé</div>
        </div>
    );
};

/** `requestAnimationFrame` synchrone : le hook diffère son travail d'une frame. */
function avecRafSynchrone(fn: () => void) {
    const vrai = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => { cb(0); return 0; }) as typeof vrai;
    try { fn(); } finally { globalThis.requestAnimationFrame = vrai; }
}

beforeEach(() => {
    // `scrollIntoView` n'existe pas en jsdom — sans ce stub, le hook lève AVANT le focus, et le test
    // mesurerait l'absence de l'API plutôt que le comportement.
    Element.prototype.scrollIntoView = vi.fn();
    useFinanceStore.setState({ pendingFocus: null });
});

describe('[A11Y-ROUTE-FOCUS] usePendingFocus emmène le focus', () => {
    it('la section ciblée reçoit le focus, et devient focalisable pour ça', () => {
        useFinanceStore.setState({
            pendingFocus: { tab: Tab.BUDGET, section: 'poste:Épicerie', expiresAt: Date.now() + 60_000 },
        });
        let cible: HTMLElement | null = null;
        avecRafSynchrone(() => {
            const { container } = render(<Harnais section="poste:Épicerie" />);
            cible = container.querySelector('[data-focus-section]');
        });
        expect(cible, 'la section ciblée n\'est pas rendue — la mesure serait vacueuse').toBeTruthy();
        // ⚠️ Le `tabIndex` est la MOITIÉ qui manque : sans lui, `focus()` ne fait rien et l'assertion
        // ci-dessous échouerait sans que rien n'ait l'air cassé.
        expect((cible as unknown as HTMLElement).getAttribute('tabindex')).toBe('-1');
        expect(document.activeElement).toBe(cible);
    });

    it('sans deep-link EN COURS, le focus n\'est pas déplacé — contrôle d\'anti-vacuité', () => {
        // Sans ce cas, « le focus est sur la cible » serait aussi vrai d'un hook qui focalise
        // toujours cette section, deep-link ou pas.
        let cible: HTMLElement | null = null;
        avecRafSynchrone(() => {
            const { container } = render(<Harnais section="poste:Épicerie" />);
            cible = container.querySelector('[data-focus-section]');
        });
        expect(document.activeElement).not.toBe(cible);
    });

    it('un deep-link EXPIRÉ ne déplace rien non plus', () => {
        useFinanceStore.setState({
            pendingFocus: { tab: Tab.BUDGET, section: 'poste:Épicerie', expiresAt: Date.now() - 1 },
        });
        let cible: HTMLElement | null = null;
        avecRafSynchrone(() => {
            const { container } = render(<Harnais section="poste:Épicerie" />);
            cible = container.querySelector('[data-focus-section]');
        });
        expect(document.activeElement).not.toBe(cible);
    });

    it('un `tabIndex` DÉJÀ posé par la page n\'est pas écrasé', () => {
        // La cible peut légitimement être dans l'ordre de tabulation ; le hook ne doit pas l'en
        // sortir au passage. Il n'ajoute l'attribut que s'il est absent.
        useFinanceStore.setState({
            pendingFocus: { tab: Tab.BUDGET, section: 'sec', expiresAt: Date.now() + 60_000 },
        });
        const Page: React.FC = () => {
            usePendingFocus(Tab.BUDGET);
            return <div data-focus-section="sec" tabIndex={0}>ciblé</div>;
        };
        let cible: HTMLElement | null = null;
        avecRafSynchrone(() => {
            const { container } = render(<Page />);
            cible = container.querySelector('[data-focus-section]');
        });
        expect((cible as unknown as HTMLElement).getAttribute('tabindex')).toBe('0');
        expect(document.activeElement).toBe(cible);
    });
});
