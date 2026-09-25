import { useSyncExternalStore } from 'react';

// [S5-REFONTE-REGLAGES] Seuil « bureau large » = `xl` de Tailwind (1280px), via matchMedia RÉACTIF —
// même patron que `useViewportBelowLg` (dupliqué, format déjà choisi par le dépôt pour ces hooks).
// Il gouverne UNE décision : le menu des Réglages est-il une colonne verticale (≥ xl, trois colonnes)
// ou une rangée d'onglets (en dessous) — l'orientation annoncée (`aria-orientation`) et les flèches
// du clavier doivent suivre ce que l'œil voit.
const QUERY = '(min-width: 1280px)';

let mql: MediaQueryList | null | undefined; // undefined = pas encore sondé, null = non supporté

function getMql(): MediaQueryList | null {
    if (mql !== undefined) return mql;
    mql = (typeof window !== 'undefined' && typeof window.matchMedia === 'function')
        ? window.matchMedia(QUERY)
        : null;
    if (mql && typeof mql.addEventListener !== 'function') mql = null;
    return mql;
}

function subscribe(onChange: () => void): () => void {
    const m = getMql();
    if (!m) return () => {};
    m.addEventListener('change', onChange);
    return () => m.removeEventListener('change', onChange);
}

const getSnapshot = () => getMql()?.matches ?? false;
const getServerSnapshot = () => false;

/** Vrai à partir du breakpoint `xl` (≥ 1280px). Repli `false` (colonne unique) sans matchMedia. */
export function useViewportXl(): boolean {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Tests UNIQUEMENT : vide le singleton (chaque test stube son propre matchMedia). */
export function _resetViewportXlMqlForTests(): void {
    mql = undefined;
}
