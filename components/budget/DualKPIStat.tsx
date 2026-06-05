import React from 'react';
import { formatCAD } from '../../utils/format';

/**
 * Phase D'.5 — tuile fusionnée "Prévu / Réel" pour le Budget.
 *
 * Affiche les deux valeurs côte-à-côte avec écart calculé automatiquement.
 * Indicateur visuel : vert si réel ≤ prévu pour revenus/restant, ou si
 * réel ≤ prévu pour dépenses (mode invertGoodBad).
 */

type Variant = 'primary' | 'success' | 'info' | 'warning' | 'danger';

interface DualKPIStatProps {
    label: string;
    icon?: string;
    prevu: number;
    reel: number;
    sublabel?: string;
    variant?: Variant;
    /** Inverse la logique vert/rouge : true pour Dépenses (moins = mieux). */
    invertGoodBad?: boolean;
}

const VARIANT_STYLES: Record<Variant, { border: string; bg: string; label: string }> = {
    primary: { border: 'border-l-primary', bg: 'bg-primary/5', label: 'text-primary' },
    success: { border: 'border-l-emerald-500', bg: 'bg-success-500/5', label: 'text-success-400' },
    info: { border: 'border-l-info-500', bg: 'bg-info-500/5', label: 'text-info-400' },
    warning: { border: 'border-l-amber-500', bg: 'bg-warning-500/5', label: 'text-warning-400' },
    danger: { border: 'border-l-red-500', bg: 'bg-danger-500/5', label: 'text-danger-400' },
};

export const DualKPIStat: React.FC<DualKPIStatProps> = ({
    label,
    icon,
    prevu,
    reel,
    sublabel,
    variant = 'info',
    invertGoodBad = false,
}) => {
    const styles = VARIANT_STYLES[variant];
    const ecart = reel - prevu;
    const ecartPct = prevu !== 0 ? (ecart / Math.abs(prevu)) * 100 : 0;

    // Logique vert/rouge :
    //   - Dépenses (invertGoodBad=true) : réel > prévu = rouge (dépassement)
    //   - Reste (default) : réel > prévu = vert (mieux que prévu)
    const isGood = invertGoodBad ? ecart <= 0 : ecart >= 0;
    const ecartColor = ecart === 0 ? 'text-ink-400' : isGood ? 'text-success-400' : 'text-danger-400';

    return (
        <div className={`rounded-card border border-white/5 border-l-4 ${styles.border} ${styles.bg} backdrop-blur-sm p-4 flex flex-col gap-2 hover:bg-white/[0.04] transition-colors`}>
            <div className="flex items-center justify-between">
                <span className={`kpi-label ${styles.label}`}>
                    {icon && <span aria-hidden="true" className="mr-1">{icon}</span>}
                    {label}
                </span>
                <span className={`text-tiny font-mono font-bold ${ecartColor} tabular-nums`}>
                    {ecart >= 0 ? '+' : ''}{ecartPct.toFixed(1)}%
                </span>
            </div>
            <div className="flex items-baseline gap-2">
                <span className="text-kpi text-ink-50 privacy-blur tabular-nums">
                    {formatCAD(reel)}
                </span>
                <span className="text-meta text-ink-500">/</span>
                <span className="text-meta text-ink-400 privacy-blur tabular-nums">
                    {formatCAD(prevu)}
                </span>
            </div>
            <div className="flex items-center justify-between text-tiny">
                <span className="text-ink-500">Réel / Prévu</span>
                {sublabel && <span className="text-ink-400 italic text-right truncate ml-2">{sublabel}</span>}
            </div>
        </div>
    );
};
