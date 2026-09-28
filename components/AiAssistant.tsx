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
    // [S5-REFONTE-ASSISTANT] Même gabarit que l'écran « à activer » des maquettes : la conversation à
    // gauche, les prochaines actions à droite (bureau large) ; au téléphone, les actions d'abord.
    return (
        <div className="space-y-6 stagger-in">
            {/* [Finding panel a11y #4] En vraie page pleine écran, l'onglet doit porter le <h1> de
                page (comme Budget/Dashboard) — sinon le 1er titre saute au <h3> du header interne. */}
            <PageHeader title="Assistant" />
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-5 items-start">
                {/* [ASSISTANT-HUB] Cartes de signaux (fusion « Prochaine action ») : même moteur que le
                    tool get_next_best_actions — clic = discussion contextualisée. */}
                <div className="xl:order-last min-w-0">
                    <AiChatSignalCards />
                </div>
                {/* Hauteur bornée : le fil défile À L'INTÉRIEUR de la carte, le champ reste visible. */}
                <div className="h-[calc(100dvh-14rem)] min-h-[480px] rounded-2xl bg-surface border border-white/6 overflow-hidden">
                    <AiChatView variant="tab" />
                </div>
            </div>
        </div>
    );
};
