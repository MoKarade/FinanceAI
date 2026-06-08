// components/PwaInstallBanner.tsx
//
// Banner discret fixe en bas qui propose d'installer la PWA. S'affiche
// uniquement si :
//   - le navigateur a tiré `beforeinstallprompt`
//   - l'app n'est pas déjà installée
//   - l'utilisateur n'a pas dismissé dans les 30 derniers jours
//
// Style minimal pour ne pas distraire — bouton "Installer" + ✕ pour fermer.

import React from 'react';
import { Icon } from './ui/Icon';
import { usePwaInstallPrompt } from '../hooks/usePwaInstallPrompt';

export const PwaInstallBanner: React.FC = () => {
    const { canInstall, promptInstall, dismissForNow } = usePwaInstallPrompt();

    if (!canInstall) return null;

    const handleInstall = async () => {
        await promptInstall();
    };

    return (
        <div
            role="region"
            aria-label="Installer FinanceAI comme application"
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 max-w-md w-[calc(100%-2rem)] bg-surface/90 border border-white/10 backdrop-blur rounded-xl shadow-lg p-3 flex items-center gap-3 animate-fade-in"
        >
            <Icon name="smartphone" size={22} className="text-ink-300 shrink-0" />
            <div className="flex-1 min-w-0">
                <div className="text-meta font-bold text-ink-100">Installer FinanceAI</div>
                <div className="text-tiny text-ink-400">Accès rapide, hors-ligne.</div>
            </div>
            <button
                type="button"
                onClick={handleInstall}
                className="px-3 py-1.5 rounded-lg bg-primary hover:bg-white text-dark text-meta font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-white/40 shrink-0"
                aria-label="Installer maintenant"
            >
                Installer
            </button>
            <button
                type="button"
                onClick={dismissForNow}
                className="inline-flex p-1.5 rounded-lg hover:bg-white/10 text-ink-300 transition-colors focus:outline-none focus:ring-2 focus:ring-white/40 shrink-0"
                aria-label="Fermer le bandeau d'installation"
                title="Ne plus afficher pendant 30 jours"
            >
                <Icon name="close" size={16} />
            </button>
        </div>
    );
};
