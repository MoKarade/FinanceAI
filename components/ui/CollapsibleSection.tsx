import React, { useState } from 'react';

interface CollapsibleSectionProps {
    title: string;
    icon?: React.ReactNode;
    subtitle?: string;
    badge?: React.ReactNode;
    defaultOpen?: boolean;
    /** Niveau de titre sémantique (`<h2>`/`<h3>`/`<h4>`) enveloppant le bouton, pour un vrai outline
     *  a11y (WCAG 1.3.1). Défaut `3` : nidifie sous une `Card` (h2) et supprime le saut h1→h4. */
    headingLevel?: 2 | 3 | 4;
    /** Mode contrôlé optionnel. Si fourni, override le state interne. */
    open?: boolean;
    onToggle?: (open: boolean) => void;
    /** Variante visuelle. `prominent` = bordure colorée (accent), `quiet` = sans bordure, `lien` = lien
     *  souligné « … → » (maquette E-immobilier : réglages fins sous la carte Financement). */
    variant?: 'default' | 'prominent' | 'quiet' | 'lien';
    className?: string;
    children: React.ReactNode;
}

const VARIANT_CLASSES = {
    default:   'bg-surface/60 border border-white/5',
    prominent: 'bg-surface/80 border border-primary/20',
    quiet:     'bg-transparent border border-transparent',
    lien:      'bg-transparent border border-transparent',
} as const;

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
    title, icon, subtitle, badge,
    defaultOpen = false, open, onToggle,
    headingLevel = 3,
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

    const lien = variant === 'lien';
    const discret = lien || variant === 'quiet';
    const headerId = `cs-${React.useId().replace(/:/g, '')}`;
    const panelId = `${headerId}-panel`;
    // Le bouton d'accordéon est enveloppé d'un vrai titre (pattern WAI-ARIA Accordion) pour l'outline SR.
    const HeadingTag = `h${headingLevel}` as 'h2' | 'h3' | 'h4';

    return (
        <div className={`rounded-card overflow-hidden ${VARIANT_CLASSES[variant]} ${className}`}>
            <HeadingTag className="m-0">
            <button
                type="button"
                onClick={toggle}
                aria-expanded={isOpen}
                aria-controls={panelId}
                id={headerId}
                className={`w-full flex items-center justify-between gap-3 text-left focus-ring transition-colors ${lien ? 'min-h-11 rounded-sm hover:text-ink-50' : discret ? 'px-0 py-2 min-h-11 rounded-lg hover:bg-white/3' : 'px-4 py-3 hover:bg-white/3'}`}
            >
                {lien ? (
                    <span className="text-[13px] text-ink-100">
                        <span className="underline underline-offset-2 decoration-white/40">{title}</span>{' '}
                        <span aria-hidden="true" className={`inline-block transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>→</span>
                    </span>
                ) : (<>
                <div className="flex items-center gap-3 min-w-0">
                    {icon && <span className="shrink-0 text-h2" aria-hidden="true">{icon}</span>}
                    <div className="min-w-0">
                        {/* [S5-REFONTE] Titre d'accordéon des maquettes : 15 px semi-gras (plus le gros h2). */}
                        <div className="text-[15px] font-semibold text-ink-50 truncate">{title}</div>
                        {subtitle && <div className="text-meta text-ink-400 mt-0.5 truncate">{subtitle}</div>}
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {badge}
                    <span
                        aria-hidden="true"
                        className={`text-ink-300 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                    >
                        ▾
                    </span>
                </div>
                </>)}
            </button>
            </HeadingTag>
            {isOpen && (
                <div
                    role="region"
                    id={panelId}
                    aria-labelledby={headerId}
                    className={discret ? 'pt-3' : 'px-4 pb-4 pt-1 border-t border-white/5'}
                >
                    {children}
                </div>
            )}
        </div>
    );
};
