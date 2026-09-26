
import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  /** Icône optionnelle (composant <Icon>) affichée avant le titre, à la marque. */
  icon?: React.ReactNode;
  action?: React.ReactNode;
  style?: React.CSSProperties;
  noPadding?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, className = "", title, icon, action, style, noPadding = false }) => {
  return (
    <div
      className={`premium-card rounded-2xl group animate-premium-in ${noPadding ? '' : 'p-5 sm:p-6'} ${className}`}
      style={style}
    >
      {(title || action) && (
        <div className={`flex justify-between items-center gap-3 mb-4 relative z-10 ${noPadding ? 'px-6 pt-6' : ''}`}>
          {/* [S5-REFONTE-R2] Titre de carte des maquettes : 17 px, semi-gras, blanc franc (plus de dégradé
              ni de filet ; l'icône reste, discrète, pour les cartes qui en portent une). */}
          {title && (
            <h2 className="text-[17px] leading-6 font-semibold text-ink-50 flex items-center gap-2 min-w-0">
              {icon && <span className="text-ink-300 shrink-0" aria-hidden="true">{icon}</span>}
              <span className="truncate">{title}</span>
            </h2>
          )}
          {action && <div className="flex items-center">{action}</div>}
        </div>
      )}
      <div className={`relative z-10 ${noPadding && (title || action) ? 'px-6 pb-6' : ''}`}>
        {children}
      </div>
    </div>
  );
};
