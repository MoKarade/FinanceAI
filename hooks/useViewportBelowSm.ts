import { useSyncExternalStore } from 'react';

// [FUTUR-MOBILE-LAYOUT] Breakpoint « téléphone » = en dessous de `sm` de Tailwind (640px),
// via matchMedia RÉACTIF (rotation d'écran, redimensionnement) — pas un window.innerWidth
// lu une fois au montage qui mentirait après rotation.
const QUERY = '(max-width: 639px)';

// jsdom (tests composant) n'implémente PAS matchMedia et le setup ne le polyfille pas :
// sans ce garde, tout render de FutureProjection en test crasherait. Repli honnête = false
// (comportement desktop, celui que les tests existants exercent déjà).
const supported = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function';

function subscribe(onChange: () => void): () => void {
    if (!supported()) return () => {};
    const mql = window.matchMedia(QUERY);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
}

const getSnapshot = () => (supported() ? window.matchMedia(QUERY).matches : false);
const getServerSnapshot = () => false;

/** Vrai sous le breakpoint `sm` (< 640px). */
export function useViewportBelowSm(): boolean {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
