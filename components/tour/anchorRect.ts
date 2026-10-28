// components/tour/anchorRect.ts
//
// Sélection de l'ancre VISIBLE du tour guidé. Le même `data-tour-id="nav-<TAB>"` existe à la fois
// sur la sidebar desktop (cachée en `display:none` sur mobile → rect 0×0) ET sur la bottom-nav
// mobile (cachée sur desktop). `querySelector` renvoyait toujours la PREMIÈRE (desktop) → sur mobile
// le rect était 0 → pas de spotlight (le tour tombait en carte centrée). On prend ici la première
// ancre réellement VISIBLE (rect non nul) → le spotlight suit l'élément vraiment affiché.

export interface AnchorRect {
    top: number;
    left: number;
    width: number;
    height: number;
}

/**
 * [TOUR-ANCHOR-INVISIBLE] Un rect non nul ne veut PAS dire « visible ».
 *
 * `display:none` retire l'élément du flux (rect 0×0, attrapé par le test de taille) — mais
 * `visibility:hidden` CONSERVE le layout : l'élément garde ses dimensions tout en étant invisible.
 * Cas réel : un groupe de navigation replié à la main, puis la visite guidée relancée → le tour
 * projetait son spotlight sur un bouton que l'utilisateur ne voit pas.
 *
 * On pose donc la question au moteur de rendu plutôt que de la déduire d'une dimension.
 */
function estVisible(el: HTMLElement, doc: Document): boolean {
    // `checkVisibility` répond en UNE fois pour display / visibility / content-visibility / opacité.
    // Elle n'existe pas partout (jsdom notamment) : le repli est EXPLICITE, pas implicite — sans lui,
    // un environnement sans la méthode retomberait sur « tout est visible » et la garde serait morte.
    const avecCheck = el as HTMLElement & {
        checkVisibility?: (o?: { checkVisibilityCSS?: boolean; opacityProperty?: boolean; contentVisibilityAuto?: boolean }) => boolean;
    };
    if (typeof avecCheck.checkVisibility === 'function') {
        return avecCheck.checkVisibility({ checkVisibilityCSS: true, opacityProperty: true, contentVisibilityAuto: true });
    }
    const style = doc.defaultView?.getComputedStyle(el);
    if (!style) return true; // pas de moteur de style : on ne peut rien affirmer, on ne rejette pas
    return style.visibility !== 'hidden' && style.visibility !== 'collapse' && style.display !== 'none';
}

/** Retourne le rect de la 1ʳᵉ ancre `nav-<tabId>` réellement visible, ou null si aucune. */
export function findVisibleAnchorRect(tabId: string, doc: Document = document): AnchorRect | null {
    const els = doc.querySelectorAll<HTMLElement>(`[data-tour-id="nav-${tabId}"]`);
    for (const el of Array.from(els)) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && estVisible(el, doc)) {
            return { top: r.top, left: r.left, width: r.width, height: r.height };
        }
    }
    return null;
}
