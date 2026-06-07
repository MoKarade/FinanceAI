import React from 'react';

export interface PillOption<T extends string> {
    value: T;
    label: React.ReactNode;
    icon?: React.ReactNode;
    title?: string;
}

interface PillProps<T extends string> {
    options: PillOption<T>[];
    value: T;
    onChange: (value: T) => void;
    size?: 'sm' | 'md';
    fullWidth?: boolean;
    'aria-label'?: string;
    className?: string;
}

const SIZE_CLASSES = {
    sm: 'px-3 py-1 text-tiny',
    md: 'px-4 py-1.5 text-meta',
} as const;

export function Pill<T extends string>({
    options, value, onChange, size = 'md', fullWidth = false,
    className = '', ...rest
}: PillProps<T>) {
    return (
        <div
            role="radiogroup"
            aria-label={rest['aria-label']}
            className={[
                'inline-flex bg-black/40 p-1 rounded-pill border border-white/10',
                fullWidth ? 'w-full' : '',
                className,
            ].filter(Boolean).join(' ')}
        >
            {options.map(opt => {
                const isSelected = opt.value === value;
                return (
                    <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => onChange(opt.value)}
                        title={opt.title}
                        className={[
                            'inline-flex items-center justify-center gap-1.5 rounded-pill font-bold transition-all focus-ring',
                            SIZE_CLASSES[size],
                            fullWidth ? 'flex-1' : '',
                            isSelected
                                ? 'bg-primary text-dark shadow'
                                : 'text-ink-300 hover:text-ink-50 hover:bg-white/5',
                        ].filter(Boolean).join(' ')}
                    >
                        {opt.icon && <span aria-hidden="true">{opt.icon}</span>}
                        <span>{opt.label}</span>
                    </button>
                );
            })}
        </div>
    );
}
