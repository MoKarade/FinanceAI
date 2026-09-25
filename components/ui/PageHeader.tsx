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
    /** Sous-onglets de la page, À CÔTÉ du titre (bureau) ou dessous (mobile) — maquettes Profil, Immobilier… */
    nav?: React.ReactNode;
    className?: string;
}

/**
 * En-tête standard de page (haut de chaque onglet).
 * [S5-REFONTE-R2] Maquettes : titre 26 px gras, sous-titre discret, actions à droite, filet sous
 * l'en-tête. Plus d'icône devant le titre (les maquettes n'en ont pas) : `icon` reste accepté pour
 * ne pas casser les appelants, et n'est plus rendu.
 * Mobile (maquettes M-*) : actions à droite du titre tant que ça tient, pas de filet (il sépare
 * l'en-tête du contenu seulement sur bureau, où l'en-tête court sur toute la largeur).
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
    title, subtitle, badge, actions, nav, className = '',
}) => {
    return (
        <header className={`flex flex-wrap items-start lg:items-center justify-between gap-3 lg:pb-5 lg:border-b border-white/6 ${className}`}>
            <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                    <h1 className="text-[26px] leading-8 font-bold text-ink-50">{title}</h1>
                    {/* Mobile (maquettes M-*) : le chiffre clé passe SOUS le titre ; bureau : à côté. */}
                    {badge && <div className="max-lg:basis-full max-lg:-mt-2">{badge}</div>}
                    {nav && <div className="basis-full lg:basis-auto min-w-0">{nav}</div>}
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
