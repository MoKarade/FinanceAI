import { useEffect, useRef, useState } from 'react';
import { useFinanceStore } from '../store/useFinanceStore';
import type { Tab } from '../types';

/**
 * Phase B2 — Hook destinataire pour le deep-link cross-tab.
 *
 * Au mount, si `pendingFocus` cible cet onglet (matchedTab) et la section
 * demandée (matchedSection), il :
 *   1. Retourne le section id consommé (utile pour highlight conditionnel)
 *   2. Scroll vers l'élément `data-focus-section="<section>"` dans le DOM
 *   3. Nettoie `pendingFocus` du store (one-shot)
 *
 * Les pages consumers doivent placer un `data-focus-section="<id>"` sur le
 * conteneur à highlighter/scroller. L'attribut est zéro-coût UI si non utilisé.
 *
 * Garde-fou: si pendingFocus.expiresAt est passé, on ne consomme pas. Cela
 * évite qu'un focus oublié ne déclenche un scroll inattendu plus tard.
 */
export function usePendingFocus(matchedTab: Tab): string | null {
    const pendingFocus = useFinanceStore(s => s.pendingFocus);
    const clearPendingFocus = useFinanceStore(s => s.clearPendingFocus);
    const [consumedSection, setConsumedSection] = useState<string | null>(null);
    const hasConsumed = useRef(false);

    useEffect(() => {
        if (hasConsumed.current) return;
        if (!pendingFocus || pendingFocus.tab !== matchedTab) return;
        if (Date.now() > pendingFocus.expiresAt) {
            clearPendingFocus();
            return;
        }
        hasConsumed.current = true;
        const section = pendingFocus.section;
        setConsumedSection(section);
        clearPendingFocus();

        if (section && typeof document !== 'undefined') {
            // Laisser le temps au DOM de monter avant de scroller.
            requestAnimationFrame(() => {
                const el = document.querySelector<HTMLElement>(`[data-focus-section="${section}"]`);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    el.classList.add('animate-pulse-once');
                    setTimeout(() => el.classList.remove('animate-pulse-once'), 1500);
                }
            });
        }
    }, [pendingFocus, matchedTab, clearPendingFocus]);

    return consumedSection;
}
