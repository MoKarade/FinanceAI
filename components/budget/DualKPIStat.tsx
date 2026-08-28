import React from 'react';
import { formatCAD } from '../../utils/format';
import { PrivateAmount } from '../ui/PrivateAmount';

/**
 * Phase D'.5 — tuile fusionnée "Prévu / Réel" pour le Budget.
 *
 * Affiche les deux valeurs côte-à-côte avec écart calculé automatiquement.
 * Indicateur visuel : vert si réel ≤ prévu pour revenus/restant, ou si
 * réel ≤ prévu pour dépenses (mode invertGoodBad).
 *
 * [BUDGET-REEL-PREVISIONNEL-OBJECTIF] `objectif` optionnel — une TROISIÈME valeur (cible saisie
 * par Marc : somme des cibles de dépense par catégorie pour les tuiles de dépenses, salaire
 * déclaré au profil pour Revenus), affichée à côté de Prévu/Réel sans changer le calcul d'écart
 * existant (toujours Réel vs Prévu). Absent → comportement IDENTIQUE à avant (rétrocompat).
 */

type Variant = 'primary' | 'success' | 'info' | 'warning' | 'danger';

interface DualKPIStatProps {
    label: string;
    icon?: React.ReactNode;
    prevu: number;
    reel: number;
    /** [BUDGET-REEL-PREVISIONNEL-OBJECTIF] Cible saisie (Objectif) — 3e valeur, optionnelle. */
    objectif?: number;
    sublabel?: string;
    variant?: Variant;
    /** Inverse la logique vert/rouge : true pour Dépenses (moins = mieux). */
    invertGoodBad?: boolean;
}

// Refonte sobre (choix Marc) : variantes neutralisées (plus de liseré coloré).
const NEUTRAL = { border: 'border-l-white/10', bg: 'bg-white/[0.02]', label: 'text-ink-300' };
const VARIANT_STYLES: Record<Variant, { border: string; bg: string; label: string }> = {
    primary: NEUTRAL, success: NEUTRAL, info: NEUTRAL, warning: NEUTRAL, danger: NEUTRAL,
};

export const DualKPIStat: React.FC<DualKPIStatProps> = ({
    label,
    icon,
    prevu,
    reel,
    objectif,
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
            {/* [D6-SR] — montants via PrivateAmount (blur visuel + masquage lecteur d'écran). */}
            <div className="flex items-baseline gap-2 flex-wrap">
                <PrivateAmount className="text-kpi text-ink-50 tabular-nums">
                    {formatCAD(reel)}
                </PrivateAmount>
                <span className="text-meta text-ink-500" aria-hidden="true">/</span>
                <PrivateAmount className="text-meta text-ink-400 tabular-nums">
                    {formatCAD(prevu)}
                </PrivateAmount>
                {objectif !== undefined && (
                    <>
                        <span className="text-meta text-ink-500" aria-hidden="true">/</span>
                        {/* [a11y panel] Libellé `sr-only` INLINE plutôt qu'un `title` HTML : sur un
                            `<span>` générique, `title` n'est ni annoncé de façon fiable ni atteignable
                            au clavier — le 3e chiffre n'aurait aucun lien programmatique avec le mot
                            « Objectif » de la légende, d'autant que `flex-wrap` peut casser la
                            correspondance positionnelle en petite largeur. */}
                        <PrivateAmount className="text-meta text-info-400 tabular-nums">
                            <span className="sr-only">Objectif : </span>{formatCAD(objectif)}
                        </PrivateAmount>
                    </>
                )}
            </div>
            <div className="flex items-center justify-between text-tiny">
                <span className="text-ink-400">{objectif !== undefined ? 'Réel / Prévu / Objectif' : 'Réel / Prévu'}</span>
                {sublabel && <span className="text-ink-400 italic text-right truncate ml-2">{sublabel}</span>}
            </div>
        </div>
    );
};
