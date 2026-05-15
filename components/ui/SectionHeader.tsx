import React from 'react';

interface SectionHeaderProps {
    title: string;
    subtitle?: string;
    icon?: React.ReactNode;
    action?: React.ReactNode;
    /** Variante du titre. `display` pour les titres de page, `h1` pour les sections. */
    level?: 'display' | 'h1' | 'h2';
    className?: string;
}

const LEVEL_CLASSES = {
    display: 'text-display text-ink-50',
    h1:      'text-h1 text-ink-50',
    h2:      'text-h2 text-ink-100',
} as const;

export const SectionHeader: React.FC<SectionHeaderProps> = ({
    title, subtitle, icon, action, level = 'h1', className = '',
}) => {
    return (
        <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${className}`}>
            <div className="flex items-start sm:items-center gap-3 min-w-0">
                {icon && <span className="flex-shrink-0 text-h1" aria-hidden="true">{icon}</span>}
                <div className="min-w-0">
                    <h2 className={`${LEVEL_CLASSES[level]} tracking-tight truncate`}>{title}</h2>
                    {subtitle && (
                        <p className="text-meta text-ink-400 mt-0.5">{subtitle}</p>
                    )}
                </div>
            </div>
            {action && <div className="flex-shrink-0 flex items-center gap-2">{action}</div>}
        </div>
    );
};
