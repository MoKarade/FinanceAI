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
 * En-tête standard de page (haut de chaque onglet).
 * [S5-REFONTE-R2] Maquettes : titre 26 px gras, sous-titre discret, actions à droite, filet sous
 * l'en-tête. Plus d'icône devant le titre (les maquettes n'en ont pas) : `icon` reste accepté pour
 * ne pas casser les appelants, et n'est plus rendu.
 * Mobile : les actions passent sous le titre si la place manque.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
    title, subtitle, badge, actions, className = '',
}) => {
    return (
        <header className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-5 border-b border-white/6 ${className}`}>
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                    <h1 className="text-[26px] leading-8 font-bold text-ink-50">{title}</h1>
                    {badge && <div>{badge}</div>}
                </div>
                {subtitle && (
                    <p className="text-[13px] leading-5 text-ink-400 mt-1 max-w-2xl">{subtitle}</p>
                )}
            </div>
            {actions && (
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {actions}
                </div>
            )}
        </header>
    );
};
