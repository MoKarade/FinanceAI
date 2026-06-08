import React from 'react';

type KPIVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'primary';

interface KPIStatProps {
    label: string;
    value: React.ReactNode;
    sublabel?: React.ReactNode;
    icon?: React.ReactNode;
    /** Variation (ex: +3.2%, -120$). Le signe détermine la couleur si trendColor n'est pas fourni. */
    trend?: number | string;
    trendLabel?: string;
    /** Force la couleur de la trend (auto = positif=success, négatif=danger). */
    trendColor?: 'success' | 'danger' | 'neutral' | 'auto';
    variant?: KPIVariant;
    /** Active la classe privacy-blur sur la valeur. */
    privacy?: boolean;
    className?: string;
    onClick?: () => void;
}

// Refonte sobre (choix Marc) : plus de bordure gauche colorée par variante —
// bordure neutre uniforme. La sémantique (positif/négatif) reste portée par la
// couleur des VALEURS, pas par un liseré « rainbow ».
const NEUTRAL_BORDER = 'border-l-2 border-l-white/10 border-r border-t border-b border-white/5';
const VARIANT_BORDER: Record<KPIVariant, string> = {
    default: 'border-white/5',
    success: NEUTRAL_BORDER,
    warning: NEUTRAL_BORDER,
    danger:  NEUTRAL_BORDER,
    info:    NEUTRAL_BORDER,
    primary: NEUTRAL_BORDER,
};

const detectTrendColor = (trend: number | string | undefined): 'success' | 'danger' | 'neutral' => {
    if (typeof trend === 'number') return trend > 0 ? 'success' : trend < 0 ? 'danger' : 'neutral';
    if (typeof trend === 'string') {
        if (trend.startsWith('+')) return 'success';
        if (trend.startsWith('-')) return 'danger';
    }
    return 'neutral';
};

const TREND_CLASSES = {
    success: 'text-success-400',
    danger:  'text-danger-400',
    neutral: 'text-ink-400',
};

export const KPIStat: React.FC<KPIStatProps> = ({
    label, value, sublabel, icon, trend, trendLabel,
    trendColor = 'auto', variant = 'default', privacy = false,
    className = '', onClick,
}) => {
    const tColor = trendColor === 'auto' ? detectTrendColor(trend) : trendColor;
    const isClickable = !!onClick;

    const containerClass = [
        'bg-surface/60 backdrop-blur-sm rounded-card p-4 flex flex-col gap-1 transition-all',
        VARIANT_BORDER[variant],
        isClickable ? 'cursor-pointer hover:bg-surface focus-ring active:scale-[0.98]' : '',
        className,
    ].filter(Boolean).join(' ');

    const inner = (
        <>
            <div className="flex items-center justify-between">
                <span className="kpi-label">{label}</span>
                {icon && <span className="text-ink-300 text-meta" aria-hidden="true">{icon}</span>}
            </div>
            <div className={`text-kpi text-ink-50 ${privacy ? 'privacy-blur' : ''} tabular-nums`}>{value}</div>
            {(sublabel || trend !== undefined) && (
                <div className="flex items-center justify-between gap-2 text-meta">
                    {sublabel && <span className="text-ink-400">{sublabel}</span>}
                    {trend !== undefined && (
                        <span className={`font-bold tabular-nums ${TREND_CLASSES[tColor]}`}>
                            {trend}
                            {trendLabel && <span className="ml-1 text-ink-400 font-normal">{trendLabel}</span>}
                        </span>
                    )}
                </div>
            )}
        </>
    );

    if (isClickable) {
        return (
            <button type="button" onClick={onClick} className={containerClass}>
                {inner}
            </button>
        );
    }
    return <div className={containerClass}>{inner}</div>;
};
