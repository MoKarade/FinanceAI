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

/** Retourne le rect de la 1ʳᵉ ancre `nav-<tabId>` visible (rect non nul), ou null si aucune. */
export function findVisibleAnchorRect(tabId: string, doc: Document = document): AnchorRect | null {
    const els = doc.querySelectorAll<HTMLElement>(`[data-tour-id="nav-${tabId}"]`);
    for (const el of Array.from(els)) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
            return { top: r.top, left: r.left, width: r.width, height: r.height };
        }
    }
    return null;
}
