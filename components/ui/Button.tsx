import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    icon?: React.ReactNode;
    iconPosition?: 'left' | 'right';
    loading?: boolean;
    fullWidth?: boolean;
    children?: React.ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
    primary: 'bg-primary text-dark hover:brightness-110 border border-transparent shadow-lg',
    secondary: 'bg-secondary text-white hover:brightness-110 border border-transparent shadow-lg',
    // [A11Y-GHOST-BUTTON-PROMINENCE 2026-07-16] bordures à white/40 (≈3.8:1 sur les 3 surfaces dark/
    // surface/highlight) — WCAG 1.4.11 (contraste non-texte ≥3:1) : à white/10-15 la limite du bouton
    // était ~1.2-1.6:1 (quasi invisible). white/40 = minimum qui passe partout avec marge (mesuré,
    // node calc contraste), sans casser l'esthétique sobre. La bordure EST l'affordance de ces variants.
    ghost: 'bg-white/5 text-ink-100 hover:bg-white/10 border border-white/40',
    danger: 'bg-danger-600 text-white hover:bg-danger-700 border border-transparent shadow-lg',
    outline: 'bg-transparent text-ink-100 hover:bg-white/5 border border-white/40',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
    sm: 'px-3 py-1.5 text-meta',
    md: 'px-4 py-2 text-body',
    lg: 'px-6 py-3 text-body font-bold',
};

export const Button: React.FC<ButtonProps> = ({
    variant = 'primary',
    size = 'md',
    icon,
    iconPosition = 'left',
    loading = false,
    fullWidth = false,
    disabled,
    className = '',
    children,
    ...rest
}) => {
    const isDisabled = disabled || loading;
    return (
        <button
            {...rest}
            disabled={isDisabled}
            className={[
                'inline-flex items-center justify-center gap-2 rounded-lg font-bold transition-all',
                'focus-ring active:scale-95',
                'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
                VARIANT_CLASSES[variant],
                SIZE_CLASSES[size],
                fullWidth ? 'w-full' : '',
                className,
            ].filter(Boolean).join(' ')}
        >
            {loading && (
                <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden="true" />
            )}
            {!loading && icon && iconPosition === 'left' && <span aria-hidden="true">{icon}</span>}
            {children}
            {!loading && icon && iconPosition === 'right' && <span aria-hidden="true">{icon}</span>}
        </button>
    );
};
