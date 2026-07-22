// components/aiChat/AiChatLauncher.tsx
//
// [AITOOLS-E] Panneau latéral GLOBAL du chat : un bouton flottant (FAB) présent sur TOUS les onglets +
// un drawer qui rend la conversation partagée (AiChatView, variant panel). Monté au niveau App (à côté
// des overlays globaux), il consomme le context → même conversation que l'onglet Assistant.
//
// Un pastille « • » sur le FAB signale une activité en cours (réflexion/consultation) même quand le
// panneau est fermé, pour que l'utilisateur sache qu'une réponse arrive pendant qu'il navigue ailleurs.

import React, { useState, useEffect, useRef } from 'react';
import { Icon } from '../ui/Icon';
import { useAiChatContext } from './AiChatContext';
import { AiChatView } from './AiChatView';

export const AiChatLauncher: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const { isLoading } = useAiChatContext();
    const panelRef = useRef<HTMLDivElement>(null);

    // Échap ferme le panneau (a11y clavier) — sans intercepter quand il est fermé.
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [isOpen]);

    return (
        <>
            <button
                onClick={() => setIsOpen((v) => !v)}
                aria-label={isOpen ? 'Fermer le conseiller IA' : 'Ouvrir le conseiller IA'}
                aria-expanded={isOpen}
                className={`fixed bottom-24 right-4 md:bottom-8 md:right-8 z-50 w-14 h-14 rounded-full transition-all duration-300 active:scale-95 flex items-center justify-center focus-ring ${isOpen ? 'bg-danger-500 rotate-90 shadow-lg shadow-black/40' : 'bg-primary text-dark shadow-[0_0_24px_rgba(230,234,242,0.22)] hover:bg-white hover:-translate-y-1'}`}
            >
                <Icon name={isOpen ? 'close' : 'sparkles'} size={24} className={isOpen ? 'text-white' : 'text-dark'} />
                {/* Activité en cours pendant que le panneau est fermé : la réponse arrive « en fond ». */}
                {isLoading && !isOpen && (
                    <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-green-400 border-2 border-black animate-pulse" aria-hidden="true" />
                )}
            </button>

            {isOpen && (
                <div
                    ref={panelRef}
                    role="dialog"
                    aria-modal="false"
                    aria-label="Conseiller IA"
                    className="fixed bottom-40 right-2 left-2 md:left-auto md:bottom-24 md:right-8 z-50 w-auto md:w-[420px] h-[550px] max-h-[60vh] md:max-h-[550px] bg-[#1a1a1a]/95 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-slide-up origin-bottom-right"
                >
                    <AiChatView variant="panel" onClose={() => setIsOpen(false)} />
                </div>
            )}
        </>
    );
};
