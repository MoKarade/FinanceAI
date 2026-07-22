// components/AiAssistant.tsx
//
// [AITOOLS-E] Onglet « Assistant IA » = la conversation partagée en PLEINE PAGE (variant tab). Le
// rendu et la logique sont mutualisés : `AiChatView` (rendu) + `useAiChatContext` (une seule instance
// useAiChat, montée au niveau App). L'onglet et le panneau latéral global montrent donc la MÊME
// conversation, le même `isLoading`, la même écriture en attente — aucune divergence.
//
// Avant (Lot C/D) : ce fichier portait le FAB + le drawer + toute la logique de rendu. Le FAB/drawer
// ont déménagé dans `aiChat/AiChatLauncher.tsx` (global), le rendu dans `aiChat/AiChatView.tsx`.

import React from 'react';
import { AiChatView } from './aiChat/AiChatView';

export const AiAssistant: React.FC = () => {
    return (
        // Pleine hauteur sous l'en-tête d'onglet ; le conteneur borne le scroll interne de la vue.
        <div className="h-[calc(100vh-12rem)] min-h-[480px] bg-[#141414]/60 border border-white/10 rounded-3xl overflow-hidden">
            <AiChatView variant="tab" />
        </div>
    );
};
