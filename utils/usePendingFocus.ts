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
                // [REFONTE-NAV-L5, revue #606] Comparaison de VALEUR, pas de sélecteur littéral :
                // depuis ce lot, `section` porte du texte LIBRE de l'utilisateur (`poste:<nom>`,
                // `category:<nom>` — parfois collé d'un relevé bancaire). Un guillemet double dans
                // un nom rendait le sélecteur invalide → `SyntaxError` levée DANS le rAF, donc
                // avalée sans ErrorBoundary ni log : le deep-link échouait en silence.
                const el = Array.from(document.querySelectorAll<HTMLElement>('[data-focus-section]'))
                    .find((node) => node.dataset.focusSection === section);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    // [A11Y-ROUTE-FOCUS] Le défilement et le clignotement sont deux signaux VISUELS :
                    // ils ne disent rien à qui navigue au clavier ou au lecteur d'écran, alors que
                    // c'est justement un deep-link — l'utilisateur a demandé « emmène-moi là ». On
                    // déplace donc AUSSI le focus.
                    //
                    // ⚠️ La cible est un conteneur, pas un contrôle : elle n'est pas focalisable par
                    // défaut, et un `focus()` y serait un no-op silencieux. On la rend focalisable
                    // au clavier PROGRAMMATIQUEMENT (`tabIndex = -1` : atteignable par script, mais
                    // pas insérée dans l'ordre de tabulation, où elle n'a rien à faire).
                    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
                    // `preventScroll` : le `scrollIntoView` ci-dessus est fluide et vient d'être
                    // lancé — laisser le focus rejouer son propre défilement le couperait net.
                    el.focus({ preventScroll: true });
                    el.classList.add('animate-pulse-once');
                    setTimeout(() => el.classList.remove('animate-pulse-once'), 1500);
                }
            });
        }
    }, [pendingFocus, matchedTab, clearPendingFocus]);

    return consumedSection;
}
