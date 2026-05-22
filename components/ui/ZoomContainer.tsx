import React from 'react';
import type { TimeChartZoom } from '../../hooks/useTimeChartZoom';

/**
 * G7 — enveloppe « Google Finance » réutilisable pour n'importe quel graphique
 * recharts. Pose le ref + les handlers de `useTimeChartZoom` sur le conteneur,
 * gère le curseur (grab/grabbing), le bouton « Vue complète » quand on est
 * zoomé et le hint « Molette = zoom » sinon.
 *
 * Usage :
 *   const zoom = useTimeChartZoom(data);
 *   <ZoomContainer zoom={zoom} style={{ height: 350 }}>
 *     <ResponsiveContainer>… data={zoom.visibleData} …</ResponsiveContainer>
 *   </ZoomContainer>
 */
interface ZoomContainerProps {
    zoom: TimeChartZoom<any>;
    className?: string;
    style?: React.CSSProperties;
    children: React.ReactNode;
    /** Affiche le hint « Molette = zoom » en vue complète (défaut true). */
    hint?: boolean;
}

export const ZoomContainer: React.FC<ZoomContainerProps> = ({ zoom, className = '', style, children, hint = true }) => {
    const cursor = zoom.isZoomed && zoom.isPanning ? 'cursor-grabbing' : zoom.isZoomed ? 'cursor-grab' : 'cursor-default';
    return (
        <div
            ref={zoom.containerRef}
            {...zoom.handlers}
            style={style}
            className={`relative select-none ${cursor} ${className}`}
        >
            {children}
            {zoom.isZoomed ? (
                <button
                    type="button"
                    onClick={zoom.reset}
                    className="absolute top-1 right-1 z-10 px-2 py-0.5 text-tiny bg-white/10 hover:bg-white/20 border border-white/15 rounded text-ink-200 font-medium transition-colors focus-ring"
                    title="Réinitialiser la vue (double-clic aussi)"
                >
                    ↺ Vue complète
                </button>
            ) : hint ? (
                <div className="absolute bottom-1 right-1 text-tiny text-ink-600 pointer-events-none bg-black/30 px-1.5 py-0.5 rounded">
                    Molette = zoom
                </div>
            ) : null}
        </div>
    );
};
