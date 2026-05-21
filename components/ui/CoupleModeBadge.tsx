import React from 'react';
import { useFinanceStore } from '../../store/useFinanceStore';

/**
 * Phase A.5 — indicateur visuel read-only du mode Couple/Individuel.
 *
 * La source de vérité est `state.config.users[1].name`. Si le second user a un
 * nom non vide, on est en mode Couple ; sinon Individuel.
 *
 * Le toggle réel se trouve uniquement dans le Hub Configuration (Phase C).
 * Partout ailleurs (sidebar, modals, autres onglets) ce badge sert d'affichage
 * non interactif.
 */
export const CoupleModeBadge: React.FC<{ className?: string; compact?: boolean }> = ({
    className = '',
    compact = false,
}) => {
    const isCouple = useFinanceStore(s => {
        const u2 = s.config?.users?.[1];
        return Boolean(u2?.name && u2.name.trim() !== '');
    });

    return (
        <div
            role="img"
            className={`inline-flex items-center gap-1.5 ${compact ? 'px-1.5 py-1' : 'px-2 py-1'} rounded-full text-tiny font-medium select-none ${
                isCouple
                    ? 'bg-pink-500/10 text-pink-300 border border-pink-500/20'
                    : 'bg-white/5 text-ink-300 border border-white/10'
            } ${className}`}
            title={isCouple ? 'Mode Couple actif (modifiable dans Configuration)' : 'Mode Individuel (modifiable dans Configuration)'}
            aria-label={isCouple ? 'Mode Couple actif' : 'Mode Individuel actif'}
        >
            <span aria-hidden="true">{isCouple ? '👥' : '👤'}</span>
            {!compact && <span>{isCouple ? 'Couple' : 'Individuel'}</span>}
        </div>
    );
};
