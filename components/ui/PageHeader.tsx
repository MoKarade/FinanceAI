import React from 'react';

interface PageHeaderProps {
    title: string;
    /**
     * [A11Y-PRIVACY-CHAINES-RESTANTES] `React.ReactNode`, pas `string` : un sous-titre de page mêle
     * du contexte (« 2 biens détenus ») et parfois un MONTANT. Typé `string`, il forçait l'appelant
     * à composer la phrase entière — donc à noyer le montant dans une chaîne, où plus rien ne peut
     * le masquer. Même correctif que `DualKPIStat.sublabel` au lot 59.
     */
    subtitle?: React.ReactNode;
    icon?: React.ReactNode;
    badge?: React.ReactNode;
    actions?: React.ReactNode;
    className?: string;
}

/**
 * Header standard de page (top de chaque tab).
 * Pattern uniforme : titre display + subtitle + actions à droite.
 * Mobile-friendly : actions wrap sous le titre si manque de place.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
    title, subtitle, icon, badge, actions, className = '',
}) => {
    return (
        <header className={`flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-section ${className}`}>
            <div className="flex items-start gap-3 min-w-0">
                {icon && <span className="flex-shrink-0 text-primary mt-0.5" aria-hidden="true">{icon}</span>}
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                        <h1 className="text-display text-ink-50 tracking-tight">{title}</h1>
                        {badge && <div>{badge}</div>}
                    </div>
                    {subtitle && (
                        <p className="text-body text-ink-300 mt-1 max-w-2xl">{subtitle}</p>
                    )}
                </div>
            </div>
            {actions && (
                <div className="flex flex-wrap items-center gap-2 flex-shrink-0 w-full md:w-auto">
                    {actions}
                </div>
            )}
        </header>
    );
};
