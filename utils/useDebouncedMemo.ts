// utils/useDebouncedMemo.ts
// Mémoïse comme React.useMemo mais retarde le recalcul de `delay` ms
// après le dernier changement des deps. Évite les recalculs en cascade
// pendant la saisie utilisateur (sliders, inputs).
//
// FIX silent-failure cycle 2 (HIGH): protection contre factory crash au mount
// et update via factory ref (closure périmée).

import { useEffect, useRef, useState } from 'react';

export function useDebouncedMemo<T>(
    factory: () => T,
    deps: React.DependencyList,
    delay: number = 300,
): T {
    // Référence stable vers la factory courante pour éviter la closure périmée
    // si la factory change d'identité sans que deps change (cas inline arrow).
    const factoryRef = useRef(factory);
    factoryRef.current = factory;

    // Premier rendu: calcul immédiat avec fallback si factory crash.
    const [value, setValue] = useState<T>(() => {
        try {
            return factory();
        } catch (e) {
            console.error('[useDebouncedMemo] factory crash at mount:', e);
            // Retourne undefined casté — le caller doit gérer.
            return undefined as unknown as T;
        }
    });

    const isFirstRender = useRef(true);

    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        const timer = setTimeout(() => {
            try {
                setValue(factoryRef.current());
            } catch (e) {
                console.error('[useDebouncedMemo] factory crash on update:', e);
            }
        }, delay);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [...deps, delay]);

    return value;
}
