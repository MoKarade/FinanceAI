import { useState, useRef, useMemo, useEffect, useCallback } from 'react';

/**
 * G4 — interaction zoom/pan réutilisable pour les graphiques temporels.
 *
 * Extrait le comportement « Google Finance » historiquement embarqué dans
 * `ZoomableTimeChart` pour qu'il serve aussi le graphique Futur (qui a son
 * propre rendu : aires empilées, barres, ReferenceDot d'événements, tooltip
 * expert). Le hook ne connaît que des **indices de tableau** : il calcule une
 * fenêtre visible `[start, end]` et renvoie la tranche correspondante. Chaque
 * graphique reste maître de son rendu.
 *
 *   - Molette : zoom in/out centré sur le curseur
 *   - Glisser : pan latéral (seulement quand on est zoomé)
 *   - Double-clic / reset() : retour à la vue complète
 *   - showRange(from, to) : sélecteur de période (ex. « 10 ans »)
 */

export interface TimeChartZoomHandlers {
    onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
    onMouseMove: (e: React.MouseEvent<HTMLDivElement>) => void;
    onMouseUp: () => void;
    onMouseLeave: () => void;
    onDoubleClick: () => void;
}

export interface TimeChartZoom<T> {
    /** À poser sur le conteneur du graphique (mesure + listener molette). */
    containerRef: React.RefObject<HTMLDivElement | null>;
    /** Tranche visible des données (= `data` complet si non zoomé). */
    visibleData: T[];
    isZoomed: boolean;
    isPanning: boolean;
    /** Fenêtre visible en indices de tableau, ou null = vue complète. */
    range: [number, number] | null;
    handlers: TimeChartZoomHandlers;
    reset: () => void;
    /** Affiche la sous-plage [from, to] (indices tableau, bornés). */
    showRange: (from: number, to: number) => void;
}

const DEFAULT_MIN_POINTS = 5; // empêche de zoomer plus fin que 5 points

export function useTimeChartZoom<T>(
    data: readonly T[],
    options?: { minPoints?: number },
): TimeChartZoom<T> {
    const minPoints = options?.minPoints ?? DEFAULT_MIN_POINTS;
    const containerRef = useRef<HTMLDivElement>(null);
    const [range, setRange] = useState<[number, number] | null>(null);
    const [isPanning, setIsPanning] = useState(false);
    const panRef = useRef<{ startX: number; startStart: number; startEnd: number } | null>(null);

    const dataLength = data.length;

    const visibleData = useMemo(() => {
        if (!range) return data as T[];
        return (data as T[]).slice(range[0], range[1] + 1);
    }, [data, range]);

    // Normalise puis applique une plage : si elle couvre tout, on repasse en
    // vue complète (range = null) pour réafficher le hint « molette = zoom ».
    const applyRange = useCallback((start: number, end: number) => {
        if (start <= 0 && end >= dataLength - 1) {
            setRange(null);
        } else {
            setRange([Math.round(start), Math.round(end)]);
        }
    }, [dataLength]);

    // Molette via listener natif non-passif : `onWheel` JSX est passif en React,
    // donc preventDefault() y est ignoré et la page scrollerait pendant le zoom.
    useEffect(() => {
        const el = containerRef.current;
        if (!el || dataLength < 2) return;

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const rect = el.getBoundingClientRect();
            const cursorRel = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            setRange((prev) => {
                const start = prev?.[0] ?? 0;
                const end = prev?.[1] ?? dataLength - 1;
                const span = end - start;
                const cursorIdx = start + cursorRel * span;
                const factor = e.deltaY < 0 ? 0.85 : 1.15; // zoom in / out
                const newSpan = Math.max(minPoints, Math.min(dataLength - 1, span * factor));
                const newStart = Math.max(0, cursorIdx - cursorRel * newSpan);
                const newEnd = Math.min(dataLength - 1, newStart + newSpan);
                const adjustedStart = Math.max(0, newEnd - newSpan);
                if (adjustedStart <= 0 && newEnd >= dataLength - 1) return null;
                return [Math.round(adjustedStart), Math.round(newEnd)];
            });
        };

        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [dataLength, minPoints]);

    const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (dataLength < 2 || !range) return; // pan désactivé en vue complète
        panRef.current = { startX: e.clientX, startStart: range[0], startEnd: range[1] };
        setIsPanning(true);
    };

    const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const pan = panRef.current;
        if (!pan) return;
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const span = pan.startEnd - pan.startStart;
        const deltaIdx = -((e.clientX - pan.startX) / rect.width) * span;
        const newStart = Math.max(0, Math.min(dataLength - 1, pan.startStart + deltaIdx));
        const newEnd = Math.min(dataLength - 1, newStart + span);
        applyRange(Math.max(0, newEnd - span), newEnd);
    };

    const endPan = () => {
        if (panRef.current) {
            panRef.current = null;
            setIsPanning(false);
        }
    };

    const reset = useCallback(() => setRange(null), []);

    const showRange = useCallback((from: number, to: number) => {
        if (dataLength < 2) return;
        const lo = Math.max(0, Math.min(from, dataLength - 1));
        const hi = Math.max(lo + 1, Math.min(to, dataLength - 1));
        applyRange(lo, hi);
    }, [dataLength, applyRange]);

    return {
        containerRef,
        visibleData,
        isZoomed: range !== null,
        isPanning,
        range,
        handlers: { onMouseDown, onMouseMove, onMouseUp: endPan, onMouseLeave: endPan, onDoubleClick: reset },
        reset,
        showRange,
    };
}
