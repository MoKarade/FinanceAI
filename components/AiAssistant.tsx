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
import { PageHeader } from './ui/PageHeader';
import { AiChatView } from './aiChat/AiChatView';
import { AiChatSignalCards } from './aiChat/AiChatSignalCards';

export const AiAssistant: React.FC = () => {
    return (
        <div>
            {/* [Finding panel a11y #4] En vraie page pleine écran, l'onglet doit porter le <h1> de
                page (comme Budget/Dashboard) — sinon le 1er titre saute au <h3> du header interne. */}
            <PageHeader
                title="Assistant IA"
                subtitle="Tes prochaines actions + ton conseiller — il consulte tes vraies données à la demande."
            />
            {/* [ASSISTANT-HUB] Cartes de signaux (fusion « Prochaine action ») AU-DESSUS du chat :
                même moteur que le tool get_next_best_actions — clic = discussion contextualisée. */}
            <AiChatSignalCards />
            {/* Pleine hauteur sous l'en-tête ; le conteneur borne le scroll interne de la vue. */}
            <div className="h-[calc(100vh-16rem)] min-h-[440px] bg-[#141414]/60 border border-white/10 rounded-3xl overflow-hidden">
                <AiChatView variant="tab" />
            </div>
        </div>
    );
};
