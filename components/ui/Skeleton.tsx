import React from 'react';

interface SkeletonProps {
    /** Variant adapté au content qu'on attend. */
    variant?: 'text' | 'rect' | 'circle' | 'chart' | 'kpi' | 'list-row';
    /** Largeur custom (string CSS, ex: "60%", "12rem"). Ignoré si variant fixe la largeur. */
    width?: string;
    /** Hauteur custom (string CSS). Ignoré si variant fixe la hauteur. */
    height?: string;
    className?: string;
}

/**
 * Placeholder shimmer pour les contenus en cours de chargement.
 * S'appuie sur la classe utilitaire `.skeleton-box` définie dans index.css
 * (animation shimmer existante depuis Phase D2). Wrapper React pour usage
 * uniforme.
 */
export const Skeleton: React.FC<SkeletonProps> = ({
    variant = 'rect',
    width,
    height,
    className = '',
}) => {
    const variantClasses: Record<string, string> = {
        text: 'h-4 w-full',
        rect: 'h-16 w-full',
        circle: 'h-10 w-10 rounded-full',
        chart: 'h-[380px] w-full',
        kpi: 'h-24 w-full rounded-card',
        'list-row': 'h-14 w-full rounded-lg',
    };
    return (
        <div
            role="status"
            aria-busy="true"
            aria-label="Chargement…"
            className={`skeleton-box ${variantClasses[variant]} ${className}`}
            style={{
                width: width || undefined,
                height: height || undefined,
            }}
        />
    );
};

/** Skeleton multi-lignes pour les listes. */
export const SkeletonList: React.FC<{ count?: number; className?: string }> = ({
    count = 3,
    className = '',
}) => (
    <div className={`space-y-3 ${className}`}>
        {Array.from({ length: count }).map((_, i) => (
            <Skeleton key={i} variant="list-row" />
        ))}
    </div>
);
