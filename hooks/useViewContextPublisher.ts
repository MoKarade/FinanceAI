// hooks/useViewContextPublisher.ts
//
// [CHAT-PAGE-CONTEXT] Hook de PUBLICATION du contexte d'écran, monté par les pages instrumentées
// (vague 1 : Budget). ⚠️ Le gate MODE DISCRET vit ICI, à la SOURCE (pas à l'affichage) : quand le
// mode discret s'active PENDANT que la page est montée, le détail publié (qui porte des montants)
// est effacé IMMÉDIATEMENT du registre — sinon la ligne de contexte du prochain envoi ferait
// sortir vers l'API des montants que l'écran masque (Loi 25, même classe que le modal d'écriture
// AITOOLS-D « un rendu à côté du gate est un angle mort »). Les pages appelantes n'ont RIEN à
// gérer : elles fournissent leur détail (mémoïsé !) et le hook s'occupe du reste.
//
// Cleanup au démontage GUARDÉ par scope (clearViewContext no-op si une autre page a publié
// entre-temps) — StrictMode-safe.

import { useEffect } from 'react';
import { useFinanceStore } from '../store/useFinanceStore';
import {
    publishViewContext, clearViewContext, type ViewContextDetail,
} from '../services/aiChat/viewContext';

export function useViewContextPublisher(scope: string, detail: ViewContextDetail | null): void {
    const isPrivacyMode = useFinanceStore((s) => s.isPrivacyMode);
    useEffect(() => {
        if (isPrivacyMode || detail === null) {
            clearViewContext(scope);
            return;
        }
        publishViewContext(scope, detail);
        return () => clearViewContext(scope);
    }, [scope, detail, isPrivacyMode]);
}
