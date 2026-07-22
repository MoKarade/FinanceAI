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

import { useEffect, useRef } from 'react';
import { useFinanceStore } from '../store/useFinanceStore';
import {
    publishViewContext, clearViewContext, type ViewContextDetail,
} from '../services/aiChat/viewContext';

export function useViewContextPublisher(scope: string, detail: ViewContextDetail | null): void {
    const isPrivacyMode = useFinanceStore((s) => s.isPrivacyMode);
    // [Finding code-reviewer #490 — ÉLEVÉ préventif, prouvé par sonde] Dédup PAR VALEUR : la clé
    // SÉRIALISÉE est la dépendance de l'effet, pas la référence de l'objet. Un consommateur futur
    // qui construirait `detail` inline (sans useMemo) déclenchait sinon une boucle infinie
    // publish → notify → re-render → nouvel objet → effet re-déclenché → … (gel à 100 % CPU puis
    // OOM). Avec la clé par valeur, un objet reconstruit au contenu IDENTIQUE ne re-déclenche
    // rien — le contrat « mémoïse ! » n'est plus qu'une optimisation, pas une condition de survie.
    const detailJson = detail === null ? null : JSON.stringify(detail);
    const detailRef = useRef(detail);
    detailRef.current = detail;
    useEffect(() => {
        if (isPrivacyMode || detailJson === null) {
            clearViewContext(scope);
            return;
        }
        publishViewContext(scope, detailRef.current!);
        return () => clearViewContext(scope);
    }, [scope, detailJson, isPrivacyMode]);
}
