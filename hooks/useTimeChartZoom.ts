import { useState, useRef, useMemo, useCallback } from 'react';

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
 *
 * Le listener molette est posé via un **callback ref** (et non un useEffect sur
 * un ref objet) : React le rappelle à chaque (dé)montage du nœud, donc le
 * listener suit toujours l'élément vivant. Corrige le bug « zoom mort après
 * changement d'onglet » (le conteneur remontait sans que le useEffect ne se
 * réexécute → listener attaché à un nœud détaché).
 */

export interface TimeChartZoomHandlers {
    onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
    onMouseMove: (e: React.MouseEvent<HTMLDivElement>) => void;
    onMouseUp: () => void;
    onMouseLeave: () => void;
    onDoubleClick: () => void;
}

export interface TimeChartZoom<T> {
    /** Callback ref à poser sur le conteneur (`ref={containerRef}`). */
    containerRef: (node: HTMLDivElement | null) => void;
    /** Élément courant — pour getBoundingClientRect / requestFullscreen. */
    containerEl: React.RefObject<HTMLDivElement | null>;
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
    const elRef = useRef<HTMLDivElement | null>(null);
    const [range, setRange] = useState<[number, number] | null>(null);
    const [isPanning, setIsPanning] = useState(false);
    const panRef = useRef<{ startX: number; startStart: number; startEnd: number } | null>(null);

    const dataLength = data.length;

    // Lues au moment du wheel via refs → handler stable sans closure périmée.
    const dataLengthRef = useRef(dataLength);
    dataLengthRef.current = dataLength;
    const minPointsRef = useRef(minPoints);
    minPointsRef.current = minPoints;
    // F11 (audit 2026-05-28) — range lu via ref dans les handlers de pan, pour que
    // onMouseDown reste stable (sinon recréé à chaque changement de range, donc pendant
    // tout le pan). Combiné au useCallback/useMemo plus bas → objet `handlers` stable.
    const rangeRef = useRef(range);
    rangeRef.current = range;

    const visibleData = useMemo(() => {
        if (!range) return data as T[];
        return (data as T[]).slice(range[0], range[1] + 1);
    }, [data, range]);

    // Normalise puis applique une plage : si elle couvre tout, on repasse en
    // vue complète (range = null) pour réafficher le hint « molette = zoom ».
    const applyRange = useCallback((start: number, end: number) => {
        if (start <= 0 && end >= dataLengthRef.current - 1) {
            setRange(null);
        } else {
            setRange([Math.round(start), Math.round(end)]);
        }
    }, []);

    // Molette via listener natif non-passif (onWheel JSX est passif en React →
    // preventDefault y serait ignoré et la page scrollerait pendant le zoom).
    const handleWheel = useCallback((e: WheelEvent) => {
        e.preventDefault();
        const el = elRef.current;
        if (!el) return;
        const dl = dataLengthRef.current;
        if (dl < 2) return;
        const mp = minPointsRef.current;
        const rect = el.getBoundingClientRect();
        const cursorRel = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        setRange((prev) => {
            const start = prev?.[0] ?? 0;
            const end = prev?.[1] ?? dl - 1;
            const span = end - start;
            const cursorIdx = start + cursorRel * span;
            const factor = e.deltaY < 0 ? 0.85 : 1.15; // zoom in / out
            const newSpan = Math.max(mp, Math.min(dl - 1, span * factor));
            const newStart = Math.max(0, cursorIdx - cursorRel * newSpan);
            const newEnd = Math.min(dl - 1, newStart + newSpan);
            const adjustedStart = Math.max(0, newEnd - newSpan);
            if (adjustedStart <= 0 && newEnd >= dl - 1) return null;
            return [Math.round(adjustedStart), Math.round(newEnd)];
        });
    }, []);

    // Callback ref : (ré)attache le listener à chaque montage du nœud.
    const containerRef = useCallback((node: HTMLDivElement | null) => {
        if (elRef.current) {
            elRef.current.removeEventListener('wheel', handleWheel);
        }
        elRef.current = node;
        if (node) {
            node.addEventListener('wheel', handleWheel, { passive: false });
        }
    }, [handleWheel]);

    const onMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const r = rangeRef.current;
        if (dataLengthRef.current < 2 || !r) return; // pan désactivé en vue complète
        panRef.current = { startX: e.clientX, startStart: r[0], startEnd: r[1] };
        setIsPanning(true);
    }, []);

    const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const pan = panRef.current;
        if (!pan) return;
        const rect = elRef.current?.getBoundingClientRect();
        if (!rect) return;
        const dl = dataLengthRef.current;
        const span = pan.startEnd - pan.startStart;
        const deltaIdx = -((e.clientX - pan.startX) / rect.width) * span;
        const newStart = Math.max(0, Math.min(dl - 1, pan.startStart + deltaIdx));
        const newEnd = Math.min(dl - 1, newStart + span);
        applyRange(Math.max(0, newEnd - span), newEnd);
    }, [applyRange]);

    const endPan = useCallback(() => {
        if (panRef.current) {
            panRef.current = null;
            setIsPanning(false);
        }
    }, []);

    const reset = useCallback(() => setRange(null), []);

    const showRange = useCallback((from: number, to: number) => {
        const dl = dataLengthRef.current;
        if (dl < 2) return;
        const lo = Math.max(0, Math.min(from, dl - 1));
        const hi = Math.max(lo + 1, Math.min(to, dl - 1));
        applyRange(lo, hi);
    }, [applyRange]);

    // F11 — objet handlers mémoïsé : tous les handlers sont stables (useCallback),
    // donc cette référence ne change jamais → le graphe consommateur (et ses enfants
    // mémoïsés) ne re-render pas à cause d'une nouvelle identité de prop à chaque frame.
    const handlers = useMemo<TimeChartZoomHandlers>(() => ({
        onMouseDown, onMouseMove, onMouseUp: endPan, onMouseLeave: endPan, onDoubleClick: reset,
    }), [onMouseDown, onMouseMove, endPan, reset]);

    return {
        containerRef,
        containerEl: elRef,
        visibleData,
        isZoomed: range !== null,
        isPanning,
        range,
        handlers,
        reset,
        showRange,
    };
}
