import React from 'react';
import { FUTURE_LEGEND_ITEMS, LegendSwatch } from './seriesConfig';

/**
 * [FUTUR-MOBILE-PR3] Légende de la courbe Futur, en deux habillages du MÊME état (`hiddenSeries`
 * de `hooks/useHiddenSeries.ts`, possédé par `FutureProjection` — ce composant ne détient QUE
 * l'état d'OUVERTURE du tiroir, jamais les séries masquées) :
 *
 * - `variant="inline"` (desktop, INCHANGÉ) : mêmes classes, même contenu, même ordre visuel que
 *   l'ancien code de `FutureProjection.tsx` — extrait presque tel quel (les classes de taille de
 *   chip changent de POSITION dans la chaîne `className` du fait de la factorisation en
 *   constantes, sans effet : l'ordre des classes n'affecte jamais le rendu). Rendu VISUEL
 *   identique, revue code-reviewer, pas de « byte-identique » au sens strict de la chaîne.
 * - `variant="drawer"` (mobile, décision Marc 2026-09-10) : tiroir FERMÉ par défaut sous la
 *   courbe, avec le COMPTE des séries visibles et le badge « Tout réafficher » TOUJOURS visibles
 *   (risque MOYEN #7 de l'architecte : une série masquée lors d'une session passée doit rester
 *   découvrable SANS ouvrir le tiroir) ; chips ≥ 44 px par axe une fois ouvert.
 *
 * ⚠️ Les deux tailles de chip sont des classes Tailwind COMPLÈTES et LITTÉRALES choisies par un
 * ternaire, jamais construites par interpolation (`min-h-[${n}px]` n'est pas vu par le scanner
 * JIT de Tailwind — la classe ne serait alors JAMAIS générée dans le CSS de build).
 */

interface FutureLegendDrawerProps {
    runMC: boolean;
    hiddenSeries: Set<string>;
    isVisible: (key: string) => boolean;
    toggleSeries: (key: string) => void;
    showAllSeries: () => void;
    /** Contenu ajouté en fin de rangée (notes « Méthode », « Impôt latent »…). */
    children?: React.ReactNode;
}

// [S5-REFONTE-FUTUR] Étiquettes-pastilles des maquettes (F-bureau / F-mobile), en ligne sous la
// courbe à toutes les largeurs — le tiroir mobile fermé (2026-09-10) cède la place à la maquette.
// Cible tactile : 44 px sous 1024 px, 36 px au bureau (classes LITTÉRALES, jamais interpolées).
const CHIP = 'h-11 lg:h-9 px-3 rounded-full border flex items-center gap-2 text-[13px] transition-colors focus-ring';
const CHIP_ON = 'bg-surfaceHighlight/60 border-white/10 text-ink-100 hover:bg-surfaceHighlight';
const CHIP_OFF = 'border-white/6 text-ink-400 hover:text-ink-200';

export const FutureLegendDrawer: React.FC<FutureLegendDrawerProps> = ({
    runMC, hiddenSeries, isVisible, toggleSeries, showAllSeries, children,
}) => {
    const items = FUTURE_LEGEND_ITEMS.filter((it) => !it.mcOnly || runMC);
    const masquees = hiddenSeries.size;
    return (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Séries du graphique">
            {items.map((it) => {
                const on = isVisible(it.key);
                return (
                    <button
                        key={it.key}
                        type="button"
                        onClick={() => toggleSeries(it.key)}
                        aria-pressed={on}
                        title={on ? `Masquer ${it.label}` : `Afficher ${it.label}`}
                        className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}
                    >
                        <LegendSwatch shape={it.shape} color={it.color} dimmed={!on} />
                        {it.label}
                    </button>
                );
            })}
            {masquees > 0 && (
                <button
                    type="button"
                    onClick={showAllSeries}
                    title={`${masquees} série${masquees > 1 ? 's' : ''} masquée${masquees > 1 ? 's' : ''}`}
                    className="min-h-11 lg:min-h-9 px-1.5 text-[13px] text-ink-100 underline underline-offset-2 focus-ring rounded-sm"
                >
                    Tout afficher
                </button>
            )}
            {children}
        </div>
    );
};
