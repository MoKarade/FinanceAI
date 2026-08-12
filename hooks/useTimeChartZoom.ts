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
 *   - Pincement 2 doigts : zoom + déplacement COMBINÉS (le point saisi entre les doigts reste
 *     sous les doigts) ; 1 doigt = la page scrolle normalement (`touch-action: pan-y`, posé par
 *     le hook sur le conteneur — cadrage Marc 2026-08-12, [FUTUR-DAILY-TOUCH])
 *   - Glisser : pan latéral (seulement quand on est zoomé)
 *   - Double-clic / reset() : retour à la vue complète
 *   - showRange(from, to) : sélecteur de période (ex. « 10 ans »)
 *
 * Le listener molette est posé via un **callback ref** (et non un useEffect sur
 * un ref objet) : React le rappelle à chaque (dé)montage du nœud, donc le
 * listener suit toujours l'élément vivant. Corrige le bug « zoom mort après
 * changement d'onglet » (le conteneur remontait sans que le useEffect ne se
 * réexécute → listener attaché à un nœud détaché).
 *
 * PERF (2026-05-29) — les bursts molette/pan (60-120 events/s) sont **coalescés**
 * en `requestAnimationFrame` : au plus UN `setRange` (donc un re-render du graphe)
 * par frame, au lieu d'un par event. Sans ça, chaque cran re-rendait tout le graphe
 * (8 aires + barres + ~64 ReferenceDot) → thread saturé → zoom saccadé. La cible
 * est suivie en synchrone via `rangeRef` pour que les events du même burst se
 * composent correctement même avant le commit.
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
    /**
     * Vrai pendant un pincement ET brièvement après (500 ms) : le consommateur qui sélectionne
     * au TAP (`pointerup` du Futur) doit s'abstenir — le lever du 2e doigt en fin de pincement
     * produit un `pointerup` à faible dérive qui passerait le garde anti-pan et sélectionnerait
     * un jour que l'utilisateur ne visait pas.
     */
    isPinchActive: () => boolean;
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

    // Cible courante de la plage, possédée EXCLUSIVEMENT par commitRange/scheduleRange (jamais
    // écrasée par un render). Sert de base de calcul synchrone aux handlers (wheel/pan) même
    // pendant qu'un frame rAF est en attente.
    const rangeRef = useRef<[number, number] | null>(range);

    // Coalescence rAF : on n'applique au plus qu'un setRange par frame.
    const rafIdRef = useRef<number | null>(null);
    const pendingRef = useRef<[number, number] | null>(null);
    const hasPendingRef = useRef(false);

    const visibleData = useMemo(() => {
        if (!range) return data as T[];
        return (data as T[]).slice(range[0], range[1] + 1);
    }, [data, range]);

    // Normalise : si la plage couvre tout, on repasse en vue complète (range = null) pour
    // réafficher le hint « molette = zoom ».
    const normalizeRange = useCallback((start: number, end: number): [number, number] | null => {
        if (start <= 0 && end >= dataLengthRef.current - 1) return null;
        return [Math.round(start), Math.round(end)];
    }, []);

    const cancelPending = useCallback(() => {
        if (rafIdRef.current !== null && typeof cancelAnimationFrame !== 'undefined') {
            cancelAnimationFrame(rafIdRef.current);
        }
        rafIdRef.current = null;
        hasPendingRef.current = false;
    }, []);

    // Commit IMMÉDIAT (actions discrètes : sélecteur de période, reset) — annule tout frame en attente.
    const commitRange = useCallback((start: number, end: number) => {
        cancelPending();
        const next = normalizeRange(start, end);
        rangeRef.current = next;
        setRange(next);
    }, [cancelPending, normalizeRange]);

    // Commit COALESCÉ (bursts : molette, pan) — au plus un setRange par frame.
    const scheduleRange = useCallback((start: number, end: number) => {
        const next = normalizeRange(start, end);
        rangeRef.current = next;            // base synchrone pour l'event suivant du même burst
        pendingRef.current = next;
        hasPendingRef.current = true;
        if (typeof requestAnimationFrame === 'undefined') {
            hasPendingRef.current = false;  // environnement sans rAF → commit direct
            setRange(next);
            return;
        }
        if (rafIdRef.current === null) {
            rafIdRef.current = requestAnimationFrame(() => {
                rafIdRef.current = null;
                if (hasPendingRef.current) {
                    hasPendingRef.current = false;
                    setRange(pendingRef.current);
                }
            });
        }
    }, [normalizeRange]);

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
        const prev = rangeRef.current; // base = dernière cible (synchrone), pas l'état committé
        const start = prev?.[0] ?? 0;
        const end = prev?.[1] ?? dl - 1;
        const span = end - start;
        const cursorIdx = start + cursorRel * span;
        const factor = e.deltaY < 0 ? 0.85 : 1.15; // zoom in / out
        const newSpan = Math.max(mp, Math.min(dl - 1, span * factor));
        const newStart = Math.max(0, cursorIdx - cursorRel * newSpan);
        const newEnd = Math.min(dl - 1, newStart + newSpan);
        const adjustedStart = Math.max(0, newEnd - newSpan);
        // ⚠️ [ZOOM-ROUND-FIXPOINT 2026-08-11] À PETIT span, l'arrondi entier ANNULE le cran : à
        // span 5, un cran retire 0,75 index réparti ~0,375 par borne — `Math.round` redonne les
        // MÊMES entiers, et comme la base du cran suivant est la cible ARRONDIE, chaque cran
        // repart du même point. Le zoom est coincé sur un point fixe, en SILENCE (mesuré par
        // sonde : 10 crans, fenêtre inchangée). Le dézoom souffrait du symétrique (5×1,15 = 5,75 :
        // même annulation) — une fois au plancher, la molette ne savait plus REMONTER non plus.
        // Quand l'arrondi annule le cran, on force donc un pas ENTIER, du côté le plus éloigné du
        // curseur (pour garder le point visé sous la souris), dans les bornes [mp, dl-1].
        let ns = Math.round(adjustedStart);
        let ne = Math.round(newEnd);
        if (ns === Math.round(start) && ne === Math.round(end)) {
            if (factor < 1 && span > mp) {
                if (cursorRel < 0.5) ne -= 1; else ns += 1;
            } else if (factor > 1 && span < dl - 1) {
                if (ne < dl - 1) ne += 1; else ns = Math.max(0, ns - 1);
            }
        }
        scheduleRange(ns, ne);
    }, [scheduleRange]);

    // [FUTUR-DAILY-TOUCH] Pincement 2 doigts = zoom + pan combinés. La base du geste est FIGÉE au
    // touchstart (`span0`, `dist0`, `idx0`) et chaque touchmove recalcule la fenêtre par RATIO
    // depuis cette base — jamais d'incrément sur la cible arrondie précédente, donc le piège
    // [ZOOM-ROUND-FIXPOINT] de la molette (l'arrondi annule le cran et la base repart du même
    // point) est impossible par construction ici.
    const pinchRef = useRef<{ dist0: number; idx0: number; span0: number } | null>(null);
    const twoFingersRef = useRef(false);
    const pinchEndedAtRef = useRef(0);

    const readPinch = (e: TouchEvent, rect: DOMRect) => {
        const a = e.touches[0], b = e.touches[1];
        return {
            dist: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY),
            midRel: Math.max(0, Math.min(1, ((a.clientX + b.clientX) / 2 - rect.left) / rect.width)),
        };
    };

    // Arme la base du geste dès que l'écart des doigts est MESURABLE (≥ 12 px — en dessous, le
    // ratio dist0/dist exploserait au moindre pixel). ⚠️ L'armement doit pouvoir se faire au
    // touchMOVE, pas seulement au touchstart : un pincement d'écartement RÉEL démarre doigts
    // quasi collés (mesuré par sonde CDP `synthesizePinchGesture` : touchstart à écart ~nul puis
    // écartement) — n'armer qu'au touchstart laissait le geste mort et le graphe inerte au doigt.
    const armPinch = useCallback((e: TouchEvent) => {
        const el = elRef.current;
        if (!el || dataLengthRef.current < 2) return;
        const { dist, midRel } = readPinch(e, el.getBoundingClientRect());
        if (dist < 12) return;
        const prev = rangeRef.current;
        const start = prev?.[0] ?? 0;
        const end = prev?.[1] ?? dataLengthRef.current - 1;
        const span0 = end - start;
        pinchRef.current = { dist0: dist, idx0: start + midRel * span0, span0 };
    }, []);

    const handleTouchStart = useCallback((e: TouchEvent) => {
        if (e.touches.length !== 2) { pinchRef.current = null; return; }
        if (!elRef.current || dataLengthRef.current < 2) return;
        e.preventDefault(); // 2 doigts SUR le graphe = geste du graphe, jamais un zoom de page
        twoFingersRef.current = true; // même non armé (doigts collés), le tap doit être inhibé
        armPinch(e);
    }, [armPinch]);

    const handleTouchMove = useCallback((e: TouchEvent) => {
        if (e.touches.length !== 2) return;
        const el = elRef.current;
        if (!el || dataLengthRef.current < 2) return;
        e.preventDefault();
        if (!pinchRef.current) { armPinch(e); return; } // doigts partis collés → base posée ICI
        const pinch = pinchRef.current;
        const { dist, midRel } = readPinch(e, el.getBoundingClientRect());
        if (dist < 12) return;
        const dl = dataLengthRef.current;
        const newSpan = Math.max(minPointsRef.current, Math.min(dl - 1, pinch.span0 * (pinch.dist0 / dist)));
        // Le point de donnée saisi au départ (idx0) suit le point médian COURANT des doigts :
        // écarter = zoomer, translater les deux doigts = panner, en un seul geste.
        const newStart = Math.max(0, pinch.idx0 - midRel * newSpan);
        const newEnd = Math.min(dl - 1, newStart + newSpan);
        scheduleRange(Math.max(0, newEnd - newSpan), newEnd);
    }, [scheduleRange]);

    const handleTouchEnd = useCallback((e: TouchEvent) => {
        if (twoFingersRef.current && e.touches.length < 2) {
            twoFingersRef.current = false;
            pinchRef.current = null;
            pinchEndedAtRef.current = Date.now();
        }
    }, []);

    const isPinchActive = useCallback(
        () => twoFingersRef.current || pinchRef.current !== null || Date.now() - pinchEndedAtRef.current < 500,
        [],
    );

    // Callback ref : (ré)attache les listeners à chaque montage du nœud ; nettoie le frame en
    // attente au démontage (évite un setRange sur un composant démonté). Molette et touchstart/
    // touchmove sont non-passifs (preventDefault y est nécessaire — en JSX React ils seraient
    // passifs et la page scrollerait/zoomerait pendant le geste).
    const containerRef = useCallback((node: HTMLDivElement | null) => {
        const prev = elRef.current;
        if (prev) {
            prev.removeEventListener('wheel', handleWheel);
            prev.removeEventListener('touchstart', handleTouchStart);
            prev.removeEventListener('touchmove', handleTouchMove);
            prev.removeEventListener('touchend', handleTouchEnd);
            prev.removeEventListener('touchcancel', handleTouchEnd);
        }
        elRef.current = node;
        if (node) {
            node.addEventListener('wheel', handleWheel, { passive: false });
            node.addEventListener('touchstart', handleTouchStart, { passive: false });
            node.addEventListener('touchmove', handleTouchMove, { passive: false });
            node.addEventListener('touchend', handleTouchEnd);
            node.addEventListener('touchcancel', handleTouchEnd);
            // 1 doigt = la page scrolle (pan-y natif) ; tout le reste (pincement, glissé
            // horizontal) arrive en événements ANNULABLES au hook. Posé ici pour que les
            // 9 graphes consommateurs l'héritent sans se modifier.
            node.style.touchAction = 'pan-y';
        } else {
            pinchRef.current = null;
            cancelPending();
        }
    }, [handleWheel, handleTouchStart, handleTouchMove, handleTouchEnd, cancelPending]);

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
        scheduleRange(Math.max(0, newEnd - span), newEnd);
    }, [scheduleRange]);

    const endPan = useCallback(() => {
        if (panRef.current) {
            panRef.current = null;
            setIsPanning(false);
        }
    }, []);

    const reset = useCallback(() => {
        cancelPending();
        rangeRef.current = null;
        setRange(null);
    }, [cancelPending]);

    const showRange = useCallback((from: number, to: number) => {
        const dl = dataLengthRef.current;
        if (dl < 2) return;
        const lo = Math.max(0, Math.min(from, dl - 1));
        const hi = Math.max(lo + 1, Math.min(to, dl - 1));
        commitRange(lo, hi);
    }, [commitRange]);

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
        isPinchActive,
    };
}
