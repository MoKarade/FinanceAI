import { useSyncExternalStore } from 'react';

// [FUTUR-SIDEBAR-BREAKPOINT] Seuil « tablette et en dessous » = en dessous de `lg` de Tailwind
// (1024px), via matchMedia RÉACTIF — même patron que `useViewportBelowSm`, dupliqué plutôt que
// paramétré : deux seuils fixes ne justifient pas une carte de singletons par seuil, et cette
// duplication est le format déjà choisi par le dépôt pour ce genre de hook (voir son jumeau).
//
// ⚠️ Ce seuil ne remplace PAS `useViewportBelowSm` (< 640px) : il gouverne UNE seule décision — la
// barre latérale de l'écran Futur tient-elle à côté d'un graphe lisible ? En dessous de 1024px
// (tablette portrait incluse), non : la mise en page repasse en colonne empilée, comme sur
// téléphone. Les réglages plus fins déjà pilotés par `useViewportBelowSm` (sélecteur compact,
// cible tactile, etc.) restent inchangés et s'appliquent PAR-DESSUS cette décision.
const QUERY = '(max-width: 1023px)';

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

/** Vrai sous le breakpoint `lg` (< 1024px). Repli honnête `false` (desktop large) sans matchMedia. */
export function useViewportBelowLg(): boolean {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Tests UNIQUEMENT : vide le singleton (chaque test stube son propre matchMedia). */
export function _resetViewportBelowLgMqlForTests(): void {
    mql = undefined;
}
