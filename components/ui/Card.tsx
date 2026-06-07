
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
      className={`premium-card rounded-2xl transition-all duration-500 group animate-premium-in ${noPadding ? '' : 'p-6'} ${className}`}
      style={style}
    >
      {(title || action) && (
        <div className={`flex justify-between items-center mb-6 pb-3 border-b border-white/5 relative z-10 ${noPadding ? 'px-6 pt-6' : ''}`}>
          {title && (
            <h2 className="text-lg font-bold tracking-wide flex items-center gap-2 min-w-0">
              {icon && <span className="text-primary shrink-0" aria-hidden="true">{icon}</span>}
              <span className="truncate bg-clip-text text-transparent bg-gradient-to-r from-white to-ink-300">{title}</span>
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
