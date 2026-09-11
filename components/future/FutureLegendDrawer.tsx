import React, { useState } from 'react';
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
    variant: 'inline' | 'drawer';
}

const CHIP_BASE = 'flex items-center gap-1.5 px-2.5 py-1 rounded-card text-tiny font-semibold border transition-colors focus-ring';
const CHIP_SIZE_DRAWER = 'min-h-[44px] min-w-[44px]';
const CHIP_SIZE_INLINE = 'min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0';
const CHIP_STATE_ON = 'bg-white/10 border-white/15 text-ink-100 hover:bg-white/15';
const CHIP_STATE_OFF = 'bg-transparent border-white/5 text-ink-400 line-through hover:text-ink-300';

export const FutureLegendDrawer: React.FC<FutureLegendDrawerProps> = ({
    runMC, hiddenSeries, isVisible, toggleSeries, showAllSeries, variant,
}) => {
    const [ouvert, setOuvert] = useState(false);
    const items = FUTURE_LEGEND_ITEMS.filter((it) => !it.mcOnly || runMC);
    const sizeClass = variant === 'drawer' ? CHIP_SIZE_DRAWER : CHIP_SIZE_INLINE;

    const chips = items.map((it) => {
        const on = isVisible(it.key);
        return (
            <button
                key={it.key}
                type="button"
                onClick={() => toggleSeries(it.key)}
                aria-pressed={on}
                title={on ? `Masquer ${it.label}` : `Afficher ${it.label}`}
                className={`${CHIP_BASE} ${sizeClass} ${on ? CHIP_STATE_ON : CHIP_STATE_OFF}`}
            >
                <LegendSwatch shape={it.shape} color={it.color} dimmed={!on} />
                {it.label}
            </button>
        );
    });

    const toutReafficher = hiddenSeries.size > 0 && (
        <button
            type="button"
            onClick={showAllSeries}
            className="text-tiny font-bold text-primary hover:underline focus-ring rounded px-1"
        >
            Tout réafficher ({hiddenSeries.size} masqué{hiddenSeries.size > 1 ? 's' : ''})
        </button>
    );

    if (variant === 'drawer') {
        // ⚠️ « Tout réafficher » est un BOUTON — ne jamais l'imbriquer dans le bouton de bascule du
        // tiroir (interdit en HTML, et le clic déclencherait les DEUX gestionnaires) : ce sont deux
        // boutons FRÈRES dans un conteneur non interactif.
        const visibles = items.filter((it) => isVisible(it.key)).length;
        const resume = `${visibles} visible${visibles > 1 ? 's' : ''} sur ${items.length}`;
        return (
            <div className="mt-6 bg-black/20 rounded-xl border border-white/5">
                <div className="flex items-center gap-2 px-4 py-2.5">
                    <button
                        type="button"
                        onClick={() => setOuvert((v) => !v)}
                        aria-expanded={ouvert}
                        aria-controls="future-legend-drawer-group"
                        className="min-h-[44px] flex-1 flex items-center gap-2 text-left focus-ring"
                    >
                        <span className="text-tiny text-ink-300 font-semibold">
                            Séries · <span className="text-ink-100">{visibles} visible{visibles > 1 ? 's' : ''}</span> sur {items.length}
                        </span>
                        <span aria-hidden="true" className={`text-ink-400 transition-transform ${ouvert ? 'rotate-180' : ''}`}>▾</span>
                    </button>
                    {toutReafficher}
                </div>
                {/* Région live TOUJOURS montée (avant tout changement) : le compte est un texte
                    STATIQUE dans le bouton, invisible aux lecteurs d'écran quand il varie sans
                    renavigation — patron `COPIER-LE-VOISIN-N-EST-PAS-COPIER-LE-BON-PATRON`. */}
                <span role="status" aria-live="polite" className="sr-only">{resume}</span>
                {ouvert && (
                    <div id="future-legend-drawer-group" className="flex flex-wrap gap-2 px-4 pb-4" role="group" aria-label="Séries du graphique">
                        {chips}
                    </div>
                )}
            </div>
        );
    }

    // variant === 'inline' — desktop, rendu visuel identique à l'ancien code de FutureProjection.tsx.
    return (
        <div className="mt-6 bg-black/20 p-4 rounded-xl border border-white/5">
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <span className="text-tiny text-ink-400 font-semibold uppercase tracking-wide">
                    Légende — clique pour afficher / masquer
                </span>
                {toutReafficher}
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Séries du graphique">
                {chips}
            </div>
        </div>
    );
};
