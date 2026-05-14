// utils/useDebouncedMemo.ts
// Mémoïse comme React.useMemo mais retarde le recalcul de `delay` ms
// après le dernier changement des deps. Évite les recalculs en cascade
// pendant la saisie utilisateur (sliders, inputs).

import { useEffect, useRef, useState } from 'react';

export function useDebouncedMemo<T>(
    factory: () => T,
    deps: React.DependencyList,
    delay: number = 300,
): T {
    // Premier rendu: calcul immédiat pour ne pas afficher un état vide.
    const [value, setValue] = useState<T>(() => factory());
    const isFirstRender = useRef(true);

    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        const timer = setTimeout(() => {
            setValue(factory());
        }, delay);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [...deps, delay]);

    return value;
}
