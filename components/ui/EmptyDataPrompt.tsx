import React from 'react';
import { useFinanceStore } from '../../store/useFinanceStore';
import { Tab } from '../../types';

/**
 * P1 — Composant générique affiché à la place des widgets d'action (IA,
 * scores, projections) tant que l'utilisateur n'a pas saisi ses données.
 *
 * Bouton CTA "→ Configuration" qui navigue vers le Hub Config et focus
 * la section profil.
 */

interface EmptyDataPromptProps {
    /** Titre principal — décrit ce qui est masqué et pourquoi */
    title?: string;
    /** Sous-titre explicatif */
    description?: string;
    /** Icône émoji optionnel */
    icon?: string;
    /** Compact = inline tile vs block = card pleine */
    layout?: 'inline' | 'block';
    className?: string;
}

export const EmptyDataPrompt: React.FC<EmptyDataPromptProps> = ({
    title = 'Données manquantes',
    description = 'Renseigne ton profil dans Configuration pour activer cette section.',
    icon = '🔒',
    layout = 'block',
    className = '',
}) => {
    const navigateWithFocus = useFinanceStore(s => s.navigateWithFocus);

    if (layout === 'inline') {
        return (
            <button
                type="button"
                onClick={() => navigateWithFocus(Tab.SETTINGS, 'profile-user1-card')}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-card border border-amber-500/30 bg-amber-500/10 text-amber-300 text-meta hover:bg-amber-500/20 focus-ring transition-colors ${className}`}
            >
                <span aria-hidden="true">{icon}</span>
                <span className="font-medium">{title}</span>
                <span className="text-tiny opacity-70" aria-hidden="true">→</span>
            </button>
        );
    }

    return (
        <div className={`rounded-card border border-amber-500/20 bg-amber-500/5 p-5 ${className}`}>
            <div className="flex items-start gap-3">
                <span className="text-2xl shrink-0" aria-hidden="true">{icon}</span>
                <div className="flex-1 min-w-0">
                    <div className="font-bold text-amber-200 mb-1">{title}</div>
                    <div className="text-meta text-ink-300 mb-3 leading-snug">{description}</div>
                    <button
                        type="button"
                        onClick={() => navigateWithFocus(Tab.SETTINGS, 'profile-user1-card')}
                        className="px-3 py-1.5 rounded-card bg-primary text-white text-meta font-bold hover:bg-primary/80 focus-ring transition-colors"
                    >
                        → Configurer mon profil
                    </button>
                </div>
            </div>
        </div>
    );
};
