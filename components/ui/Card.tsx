
import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  action?: React.ReactNode;
  style?: React.CSSProperties;
  noPadding?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, className = "", title, action, style, noPadding = false }) => {
  return (
    <div
      className={`premium-card rounded-2xl transition-all duration-500 group animate-premium-in ${noPadding ? '' : 'p-6'} ${className}`}
      style={style}
    >
      {(title || action) && (
        <div className={`flex justify-between items-center mb-6 pb-3 border-b border-white/5 relative z-10 ${noPadding ? 'px-6 pt-6' : ''}`}>
          {title && <h3 className="text-lg font-bold text-white tracking-wide bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">{title}</h3>}
          {action && <div className="flex items-center">{action}</div>}
        </div>
      )}
      <div className={`relative z-10 ${noPadding && (title || action) ? 'px-6 pb-6' : ''}`}>
        {children}
      </div>
    </div>
  );
};
