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
    ghost: 'bg-white/5 text-ink-100 hover:bg-white/10 border border-white/10',
    danger: 'bg-danger-500 text-white hover:bg-danger-600 border border-transparent shadow-lg',
    outline: 'bg-transparent text-ink-100 hover:bg-white/5 border border-white/15',
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
