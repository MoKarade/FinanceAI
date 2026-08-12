import { useSyncExternalStore } from 'react';

// [FUTUR-MOBILE-LAYOUT] Breakpoint « téléphone » = en dessous de `sm` de Tailwind (640px),
// via matchMedia RÉACTIF (rotation d'écran, redimensionnement) — pas un window.innerWidth
// lu une fois au montage qui mentirait après rotation.
const QUERY = '(max-width: 639px)';

// Singleton module-scope : getSnapshot est appelé à CHAQUE render de chaque consommateur —
// re-instancier un MediaQueryList à chaque lecture est du travail répété évitable (finding
// revue #597). Paresseux : jsdom (tests composant) n'a PAS matchMedia et le setup ne le
// polyfille pas — sans repli, tout render de FutureProjection en test crasherait.
let mql: MediaQueryList | null | undefined; // undefined = pas encore sondé, null = non supporté

function getMql(): MediaQueryList | null {
    if (mql !== undefined) return mql;
    mql = (typeof window !== 'undefined' && typeof window.matchMedia === 'function')
        ? window.matchMedia(QUERY)
        : null;
    // Vieux WebKit (pré-Safari 14) : MediaQueryList sans addEventListener (addListener seul,
    // déprécié) — on le traite comme non supporté (repli desktop) plutôt que de crasher au
    // montage ; un navigateur de cet âge ne comprend de toute façon pas dvh.
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

/** Vrai sous le breakpoint `sm` (< 640px). Repli honnête `false` (desktop) sans matchMedia. */
export function useViewportBelowSm(): boolean {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Tests UNIQUEMENT : vide le singleton (chaque test stube son propre matchMedia). */
export function _resetViewportMqlForTests(): void {
    mql = undefined;
}
