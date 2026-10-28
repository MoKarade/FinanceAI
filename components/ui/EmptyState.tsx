import React from 'react';

interface EmptyStateProps {
    icon?: React.ReactNode;
    title: string;
    description?: string;
    cta?: React.ReactNode;
    /** Variante visuelle. `subtle` pour les empty states discrets (intra-Card). */
    variant?: 'default' | 'subtle';
    className?: string;
}

/**
 * État vide standard. Affiché quand une liste/grille n'a aucune donnée
 * ou quand un calcul n'a pas encore tourné.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
    icon, title, description, cta, variant = 'default', className = '',
}) => {
    const isSubtle = variant === 'subtle';
    return (
        <div
            className={[
                'flex flex-col items-center justify-center text-center gap-3',
                isSubtle ? 'py-8 px-4' : 'py-16 px-6 bg-surface/40 rounded-card border border-white/5',
                className,
            ].filter(Boolean).join(' ')}
        >
            {icon && <div className="text-display opacity-70" aria-hidden="true">{icon}</div>}
            <h3 className="text-h2 text-ink-100">{title}</h3>
            {description && (
                <p className="text-body text-ink-400 max-w-md">{description}</p>
            )}
            {cta && <div className="mt-2">{cta}</div>}
        </div>
    );
};
