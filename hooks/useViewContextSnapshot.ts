// hooks/useViewContextSnapshot.ts
//
// [CHAT-PAGE-CONTEXT] Lecture RÉACTIVE du contexte d'écran — UNIQUEMENT pour l'affichage (badge
// « Contexte : Budget — juillet 2026 » du chat). L'envoi d'un message ne passe JAMAIS par ce hook :
// il lit getViewContext() en impératif au moment de l'envoi (snapshot figé, cf useAiChat).

import { useSyncExternalStore } from 'react';
import { subscribeViewContext, getViewContext, type ViewContextEntry } from '../services/aiChat/viewContext';

export function useViewContextSnapshot(): ViewContextEntry | null {
    return useSyncExternalStore(subscribeViewContext, getViewContext, getViewContext);
}
