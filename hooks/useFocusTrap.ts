// hooks/useFocusTrap.ts
//
// [A11Y-FUTUR-DETAIL-FOCUS-TRAP] Source UNIQUE du piège à focus des dialogues.
//
// ⚠️ POURQUOI UN HOOK PLUTÔT QU'UNE TROISIÈME COPIE. Le patron existait déjà DEUX fois
// (`components/ui/Modal.tsx`, `components/sync/SyncConflictModal.tsx`) — et les deux copies avaient
// DÉJÀ DIVERGÉ : la liste des éléments focusables de `Modal` inclut `select` et `textarea`, celle du
// modal de conflit non. Un dialogue qui contient une liste déroulante y serait donc sorti du piège
// en silence. Ajouter une troisième copie dans `FutureDetailModal`, comme le ticket le suggérait,
// aurait reproduit exactement cette dérive (`UNE-FORMULE-RECOPIEE-DIVERGE`).
//
// Le hook ne fait QUE le piège Tab / Shift+Tab. Le focus initial, le verrou de scroll, la touche
// Échap et la restauration du focus restent chez l'appelant : ils diffèrent légitimement d'un
// dialogue à l'autre (le modal de conflit est BLOQUANT — pas d'Échap, c'est voulu).
import { useEffect, type RefObject } from 'react';

/** Sélecteur des éléments atteignables au clavier. Un seul endroit, donc une seule vérité. */
export const FOCUSABLE_SELECTOR =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), '
    + 'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Enferme la tabulation dans `containerRef` tant que `enabled` est vrai.
 *
 * ⚠️ Le conteneur lui-même compte s'il est focusable (`tabIndex={-1}` exclu par le sélecteur, mais
 * un `tabIndex={0}` sur le dialogue en fait un point d'entrée légitime) : on interroge donc le DOM
 * à CHAQUE frappe plutôt qu'une fois au montage — le contenu d'un dialogue change (onglets,
 * confirmations en deux temps), et une liste figée piègerait vers des éléments disparus.
 */
export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, enabled: boolean = true): void {
    useEffect(() => {
        if (!enabled) return;
        const onKey = (e: KeyboardEvent): void => {
            if (e.key !== 'Tab') return;
            const root = containerRef.current;
            if (!root) return;
            const focusable = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey) {
                if (document.activeElement === first) { last.focus(); e.preventDefault(); }
            } else {
                if (document.activeElement === last) { first.focus(); e.preventDefault(); }
            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [containerRef, enabled]);
}
