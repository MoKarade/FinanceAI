import React from 'react';
import { PrivateAmount } from './PrivateAmount';
import { emptyAware } from './emptyAware';
import { Tooltip } from './Tooltip';

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
    /** Infobulle d'aide affichée via une icône « i » focusable à côté du label (ex. ce que recouvre un montant). */
    tooltip?: React.ReactNode;
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
    tooltip, className = '', onClick,
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
                <span className="flex items-center gap-1.5 min-w-0">
                    <span className="kpi-label">{label}</span>
                    {tooltip && (
                        <Tooltip content={tooltip}>
                            {/* aria-label COURT (action) : le contenu est livré par l'aria-describedby du Tooltip,
                                pas par ce label (sinon double lecture SR). NE PAS combiner `tooltip` avec `onClick`
                                (le déclencheur serait un bouton imbriqué). */}
                            <button
                                type="button"
                                aria-label="Aide sur ce montant"
                                onKeyDown={(e) => { if (e.key === 'Escape') e.currentTarget.blur(); }}
                                className="inline-flex items-center justify-center w-4 h-4 shrink-0 rounded-full border border-white/20 text-ink-400 text-[10px] font-bold leading-none cursor-help focus-ring"
                            >i</button>
                        </Tooltip>
                    )}
                </span>
                {icon && <span className="text-ink-300 text-meta" aria-hidden="true">{icon}</span>}
            </div>
            {/* [D6-SR] — privacy passe par PrivateAmount : blur visuel (CSS inchangé) + masquage SR.
                [A11Y-DASH-SRONLY] hors privacy, un « — » (pas de donnée) devient aria-hidden + sr-only. */}
            {privacy
                ? <PrivateAmount as="div" className="text-kpi text-ink-50 tabular-nums">{value}</PrivateAmount>
                : <div className="text-kpi text-ink-50 tabular-nums">{emptyAware(value)}</div>}
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
