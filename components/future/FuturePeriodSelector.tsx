import React from 'react';
import type { TimeChartZoom } from '../../hooks/useTimeChartZoom';
import type { ProjectionChartPoint } from '../../services/projection/types';

/**
 * [FUTUR-MOBILE-PR2] Sélecteur de période de la courbe Futur, en deux habillages du MÊME état
 * (`zoom` de `useTimeChartZoom`, possédé par `FutureProjection` — ce composant ne détient RIEN) :
 *
 * - `variant="buttons"` (desktop, INCHANGÉ) : la rangée de pastilles historique, JSX byte-identique
 *   à l'ancien code de `FutureProjection.tsx` — extraite telle quelle, zéro changement de rendu.
 * - `variant="compact"` (mobile, décision Marc 2026-09-10) : un `<select>` natif — cible tactile,
 *   clavier et lecteur d'écran garantis par le navigateur, tous les présets dont « Aujourd'hui »
 *   (le SEUL chemin clavier vers la fenêtre centrée sur le présent, finding a11y #592) — plus le
 *   bouton plein écran, en 44×44.
 *
 * Horizon INTACT (décision Marc : pas de fenêtre mobile) — ce composant ne change QUE la vue sur
 * une courbe déjà calculée (`zoom.showRange`), jamais `projection.years` ni aucun paramètre de
 * calcul : le risque money-critical identifié par l'architecte (confondre vue et calcul) ne peut
 * pas se produire ici, ce composant ne reçoit même pas `projection`.
 */

// [S5-REFONTE-FUTUR] Presets des maquettes : 5, 10, 20 ans et Tout (30 ans retiré).
const PERIOD_YEARS = [5, 10, 20] as const;

interface FuturePeriodSelectorProps {
    zoom: TimeChartZoom<ProjectionChartPoint>;
    todayPresetRange: [number, number] | null;
    idxForYears: (years: number) => number;
    lastMonthIndex: number;
    onFullscreen: () => void;
    variant: 'buttons' | 'compact';
}

export const FuturePeriodSelector: React.FC<FuturePeriodSelectorProps> = ({
    zoom, todayPresetRange, idxForYears, lastMonthIndex, onFullscreen, variant,
}) => {
    const years = PERIOD_YEARS.filter((y) => y * 12 < lastMonthIndex);

    if (variant === 'compact') {
        const selected = (() => {
            if (!zoom.isZoomed) return 'all';
            if (todayPresetRange && zoom.range && zoom.range[0] === todayPresetRange[0] && zoom.range[1] === todayPresetRange[1]) return 'today';
            const y = years.find((yy) => zoom.range && zoom.range[0] === 0 && zoom.range[1] === idxForYears(yy));
            if (y != null) return String(y);
            return 'custom';
        })();
        const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
            const v = e.target.value;
            if (v === 'all') { zoom.reset(); return; }
            if (v === 'today' && todayPresetRange) { zoom.showRange(todayPresetRange[0], todayPresetRange[1]); return; }
            const y = Number(v);
            if (Number.isFinite(y)) zoom.showRange(0, idxForYears(y));
        };
        return (
            <div className="flex items-center gap-2">
                <select
                    aria-label="Période affichée"
                    value={selected}
                    onChange={onChange}
                    className="min-h-[44px] px-3 rounded-xl bg-black/50 border border-white/10 text-meta font-semibold text-ink-100 focus-ring"
                >
                    {selected === 'custom' && <option value="custom" disabled>Vue personnalisée</option>}
                    {todayPresetRange && <option value="today">Aujourd'hui</option>}
                    {years.map((y) => <option key={y} value={y}>{y} ans</option>)}
                    <option value="all">Tout l'horizon</option>
                </select>
                <button
                    type="button"
                    onClick={onFullscreen}
                    title="Plein écran (Échap pour quitter)"
                    aria-label="Plein écran"
                    className="shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center text-lg rounded-xl text-ink-300 hover:text-white hover:bg-white/10 border border-white/10 transition-colors focus-ring"
                >
                    <span aria-hidden="true">⛶</span>
                </button>
            </div>
        );
    }

    // variant === 'buttons' — desktop, JSX byte-identique à l'ancien code de FutureProjection.tsx.
    // [S5-REFONTE-FUTUR] Boutons texte des maquettes ; l'actif en pastille claire, annoncé par `aria-pressed`.
    const bouton = 'h-9 px-3 rounded-lg text-[13px] transition-colors focus-ring';
    const actif = 'bg-surfaceHighlight text-ink-50 font-semibold';
    const inactif = 'text-ink-300 hover:text-ink-50 hover:bg-white/5';
    return (
        <div className="flex items-center gap-1" role="group" aria-label="Période affichée">
            {/* [FUTUR-DAILY-NATIVE] « Aujourd'hui » = preset de FENÊTRE autour du présent — seul
                chemin FOCUSABLE vers cette fenêtre (finding a11y #592). */}
            {todayPresetRange && (
                <button
                    type="button"
                    onClick={() => zoom.showRange(todayPresetRange[0], todayPresetRange[1])}
                    title="Fenêtre d'environ 6 mois centrée sur aujourd'hui"
                    className={`${bouton} ${inactif}`}
                >
                    Aujourd'hui
                </button>
            )}
            {years.map((y) => {
                const active = !!zoom.range && zoom.range[0] === 0 && zoom.range[1] === idxForYears(y);
                return (
                    <button
                        key={y}
                        type="button"
                        onClick={() => zoom.showRange(0, idxForYears(y))}
                        aria-pressed={active}
                        className={`${bouton} ${active ? actif : inactif}`}
                    >
                        {y} ans
                    </button>
                );
            })}
            <button
                type="button"
                onClick={zoom.reset}
                aria-pressed={!zoom.isZoomed}
                className={`${bouton} ${!zoom.isZoomed ? actif : inactif}`}
            >
                Tout
            </button>
        </div>
    );
};
