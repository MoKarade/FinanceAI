// components/aiChat/AiChatContext.tsx
//
// [AITOOLS-E] UNE seule instance de la logique de chat (useAiChat) pour toute l'app, exposée via
// context. Le panneau latéral GLOBAL (AiChatLauncher, accessible partout) et l'onglet Assistant
// (vue pleine page) consomment le MÊME état → même conversation, un seul `isLoading`/`pendingWrite`,
// une seule boucle agentique en vol. Monté au niveau App (jamais démonté par un changement d'onglet)
// → résout à la RACINE le finding Lot D « promesse de confirmation orpheline au démontage d'onglet »
// (le hook ne disparaît plus quand on quitte l'onglet Assistant).
//
// ⚠️ Boot-safe : useAiChat charge le SDK Anthropic en import DYNAMIQUE (au 1er message) → monter ce
// provider au niveau App ne tire RIEN de lourd dans le bundle de boot.

import React, { createContext, useContext } from 'react';
import { useFinanceStore } from '../../store/useFinanceStore';
import { useAiChat, type UseAiChat } from '../../hooks/useAiChat';
import { AiChatConfirmModal } from './AiChatConfirmModal';

const AiChatContext = createContext<UseAiChat | null>(null);

export const AiChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // La clé Anthropic vient du store (posée par l'hydratation du coffre chiffré au boot). Le hook
    // gère lui-même l'absence de clé (message honnête au 1er envoi) — pas de garde ici.
    const apiKey = useFinanceStore((s) => s.apiKeys.anthropic);
    const isPrivacyMode = useFinanceStore((s) => s.isPrivacyMode);
    const chat = useAiChat(apiKey);
    return (
        <AiChatContext.Provider value={chat}>
            {children}
            {/* [AITOOLS-D+E] Confirmation d'écriture rendue UNE SEULE FOIS, au niveau du provider :
                le panneau global et l'onglet partagent la même instance → un seul modal, quel que
                soit le nombre de surfaces montées. Gaté !isPrivacyMode (Loi 25) ; le hook auto-refuse
                déjà la confirmation en attente quand le mode discret s'active. */}
            {chat.pendingWrite && !isPrivacyMode && (
                <AiChatConfirmModal preview={chat.pendingWrite} onDecision={chat.resolvePendingWrite} />
            )}
        </AiChatContext.Provider>
    );
};

/** Accès à l'instance unique du chat. Lève hors provider (erreur de câblage, pas un cas runtime). */
export function useAiChatContext(): UseAiChat {
    const ctx = useContext(AiChatContext);
    if (!ctx) throw new Error('useAiChatContext doit être utilisé dans <AiChatProvider>.');
    return ctx;
}
