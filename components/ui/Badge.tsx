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

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
    success: 'bg-success-bg text-success-400 border-success-border',
    warning: 'bg-warning-bg text-warning-400 border-warning-border',
    danger:  'bg-danger-bg  text-danger-400  border-danger-border',
    info:    'bg-info-bg    text-info-400    border-info-border',
    neutral: 'bg-white/5    text-ink-300     border-white/10',
    primary: 'bg-primary/10 text-primary     border-primary/30',
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
