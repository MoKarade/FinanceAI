import React, { useState } from 'react';

interface CollapsibleSectionProps {
    title: string;
    icon?: React.ReactNode;
    subtitle?: string;
    badge?: React.ReactNode;
    defaultOpen?: boolean;
    /** Mode contrôlé optionnel. Si fourni, override le state interne. */
    open?: boolean;
    onToggle?: (open: boolean) => void;
    /** Variante visuelle. `prominent` = bordure colorée (accent), `quiet` = sans bordure. */
    variant?: 'default' | 'prominent' | 'quiet';
    className?: string;
    children: React.ReactNode;
}

const VARIANT_CLASSES = {
    default:   'bg-surface/60 border border-white/5',
    prominent: 'bg-surface/80 border border-primary/20',
    quiet:     'bg-transparent border border-transparent',
} as const;

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
    title, icon, subtitle, badge,
    defaultOpen = false, open, onToggle,
    variant = 'default', className = '',
    children,
}) => {
    const [internalOpen, setInternalOpen] = useState(defaultOpen);
    const isControlled = open !== undefined;
    const isOpen = isControlled ? open : internalOpen;

    const toggle = () => {
        const next = !isOpen;
        if (!isControlled) setInternalOpen(next);
        onToggle?.(next);
    };

    const headerId = `cs-${React.useId().replace(/:/g, '')}`;
    const panelId = `${headerId}-panel`;

    return (
        <div className={`rounded-card overflow-hidden ${VARIANT_CLASSES[variant]} ${className}`}>
            <button
                type="button"
                onClick={toggle}
                aria-expanded={isOpen}
                aria-controls={panelId}
                id={headerId}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left focus-ring hover:bg-white/[0.03] transition-colors"
            >
                <div className="flex items-center gap-3 min-w-0">
                    {icon && <span className="flex-shrink-0 text-h2" aria-hidden="true">{icon}</span>}
                    <div className="min-w-0">
                        <div className="text-h2 text-ink-50 truncate">{title}</div>
                        {subtitle && <div className="text-meta text-ink-400 mt-0.5 truncate">{subtitle}</div>}
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    {badge}
                    <span
                        aria-hidden="true"
                        className={`text-ink-300 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                    >
                        ▾
                    </span>
                </div>
            </button>
            {isOpen && (
                <div
                    role="region"
                    id={panelId}
                    aria-labelledby={headerId}
                    className="px-4 pb-4 pt-1 border-t border-white/5"
                >
                    {children}
                </div>
            )}
        </div>
    );
};
