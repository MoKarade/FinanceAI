import React from 'react';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary';
type BadgeSize = 'sm' | 'md';

interface BadgeProps {
    variant?: BadgeVariant;
    size?: BadgeSize;
    icon?: React.ReactNode;
    onClick?: () => void;
    title?: string;
    className?: string;
    children: React.ReactNode;
}

// [A11Y-BADGE-PROMINENCE] Option B (décision Marc 2026-06-19) : bordure RENFORCÉE (fond inchangé) pour
// remonter le contraste badge↔page (WCAG 1.4.11 non-text). Le fond `*-bg` reste à 0,10 ; la bordure passe
// de l'accent à 0,30 (`*-border`) → 0,55 de l'accent saturé `*-400` (badge-only : on ne touche PAS le token
// partagé `*-border`, utilisé aussi par ProjectionControls/IntegrationsSection). Le texte (`*-400`) passe déjà AA.
const VARIANT_CLASSES: Record<BadgeVariant, string> = {
    success: 'bg-success-bg text-success-400 border-success-400/55',
    warning: 'bg-warning-bg text-warning-400 border-warning-400/55',
    danger:  'bg-danger-bg  text-danger-400  border-danger-400/55',
    info:    'bg-info-bg    text-info-400    border-info-400/55',
    neutral: 'bg-white/5    text-ink-300     border-white/25',
    primary: 'bg-primary/10 text-primary     border-primary/55',
};

const SIZE_CLASSES: Record<BadgeSize, string> = {
    sm: 'text-tiny px-2 py-0.5',
    md: 'text-meta px-2.5 py-1',
};

export const Badge: React.FC<BadgeProps> = ({
    variant = 'neutral',
    size = 'sm',
    icon,
    onClick,
    title,
    className = '',
    children,
}) => {
    const isClickable = !!onClick;
    const baseClasses = [
        'inline-flex items-center gap-1.5 font-bold border rounded-pill whitespace-nowrap',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        isClickable ? 'cursor-pointer hover:brightness-125 focus-ring active:scale-95 transition-all' : '',
        className,
    ].filter(Boolean).join(' ');

    if (isClickable) {
        return (
            <button type="button" onClick={onClick} title={title} className={baseClasses}>
                {icon && <span aria-hidden="true">{icon}</span>}
                {children}
            </button>
        );
    }
    return (
        <span title={title} className={baseClasses}>
            {icon && <span aria-hidden="true">{icon}</span>}
            {children}
        </span>
    );
};
