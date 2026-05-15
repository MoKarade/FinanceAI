import React from 'react';

interface StatGridProps {
    /** Nombre de colonnes en desktop. Mobile s'adapte automatiquement (2 max). */
    cols?: 2 | 3 | 4 | 5;
    gap?: 'sm' | 'md';
    className?: string;
    children: React.ReactNode;
}

const COLS_CLASSES = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-2 md:grid-cols-3',
    4: 'grid-cols-2 md:grid-cols-4',
    5: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5',
} as const;

const GAP_CLASSES = {
    sm: 'gap-3',
    md: 'gap-4',
} as const;

export const StatGrid: React.FC<StatGridProps> = ({ cols = 4, gap = 'md', className = '', children }) => {
    return (
        <div className={`grid ${COLS_CLASSES[cols]} ${GAP_CLASSES[gap]} ${className}`}>
            {children}
        </div>
    );
};
