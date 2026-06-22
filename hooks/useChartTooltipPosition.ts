import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
    clampTooltipPosition,
    TOOLTIP_MARGIN,
    TOOLTIP_OFFSET_X,
    TOOLTIP_OFFSET_Y,
    TOOLTIP_WIDTH,
} from '../utils/chartTooltip';

// [R3] Machine d'état du tooltip figeable du graphe Futur.
//
//   idle ──onHoverPoint──▶ hovering ──freezeOn──▶ frozen
//    ▲                        │                      │
//    └───onChartLeave─────────┘                      │
//    └────────────release / Échap / clic-dehors──────┘
//
// PERF : la POSITION est en `useRef` + mutation DOM directe (jamais de state React
// au mousemove → pas de re-render à 60 fps). Le state React ne change qu'au
// changement de POINT (≈ au passage d'un mois à l'autre) ou de MODE.
//
// Gelé = ancré : le survol et les mousemove n'affectent plus la position. Seuls
// les listeners `document` (Échap + clic-dehors) sont actifs, et UNIQUEMENT en gelé.

export type ChartTooltipMode = 'idle' | 'hovering' | 'frozen';

export interface UseChartTooltipOptions<P> {
    /** Clé d'identité d'un point (ex. `monthIndex`) → déduplique les re-render au survol. */
    getKey: (point: P) => string | number;
    /** Conteneur du graphe : clic-dedans = re-fige (pas release) + cible de la restitution du focus. */
    containerRef: React.RefObject<HTMLElement | null>;
}

export interface ChartTooltip<P> {
    mode: ChartTooltipMode;
    point: P | null;
    /** À poser sur l'élément portail du tooltip. */
    tooltipRef: React.RefObject<HTMLDivElement | null>;
    /** Mousemove sur le graphe (coords viewport) — position seule, zéro re-render. */
    onPointerMove: (clientX: number, clientY: number) => void;
    /** Recharts a rapporté le point survolé. */
    onHoverPoint: (point: P) => void;
    /** Le curseur a quitté la zone traçée. */
    onChartLeave: () => void;
    /** Clic sur le graphe → fige sur le point donné (repli : point courant). */
    freezeOn: (point: P | null) => void;
    /** Libère (retour idle). */
    release: () => void;
}

export function useChartTooltipPosition<P>({ getKey, containerRef }: UseChartTooltipOptions<P>): ChartTooltip<P> {
    const [mode, setMode] = useState<ChartTooltipMode>('idle');
    const [point, setPoint] = useState<P | null>(null);

    const tooltipRef = useRef<HTMLDivElement | null>(null);
    const posRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const heightRef = useRef(0); // hauteur mesurée au changement de contenu → évite un reflow/mousemove

    // Miroirs synchrones (les callbacks stables lisent l'état courant sans se recréer).
    const modeRef = useRef<ChartTooltipMode>(mode);
    modeRef.current = mode;
    const pointRef = useRef<P | null>(point);
    pointRef.current = point;

    const applyPosition = useCallback(() => {
        const el = tooltipRef.current;
        if (!el) return;
        const { left, top } = clampTooltipPosition({
            cursorX: posRef.current.x,
            cursorY: posRef.current.y,
            tooltipWidth: TOOLTIP_WIDTH,
            tooltipHeight: heightRef.current || el.offsetHeight,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            offsetX: TOOLTIP_OFFSET_X,
            offsetY: TOOLTIP_OFFSET_Y,
            margin: TOOLTIP_MARGIN,
        });
        el.style.left = `${left}px`;
        el.style.top = `${top}px`;
    }, []);

    const onPointerMove = useCallback((clientX: number, clientY: number) => {
        posRef.current = { x: clientX, y: clientY };
        if (modeRef.current === 'hovering') applyPosition(); // gelé = ancré : on ne bouge plus
    }, [applyPosition]);

    const onHoverPoint = useCallback((next: P) => {
        if (modeRef.current === 'frozen') return; // gelé : le survol est ignoré
        setPoint((prev) => (prev !== null && getKey(prev) === getKey(next) ? prev : next));
        setMode((m) => (m === 'hovering' ? m : 'hovering'));
    }, [getKey]);

    const onChartLeave = useCallback(() => {
        if (modeRef.current !== 'hovering') return; // gelé : on garde le tooltip
        setMode('idle');
        setPoint(null);
    }, []);

    const freezeOn = useCallback((next: P | null) => {
        const target = next ?? pointRef.current;
        if (target === null) return; // rien à figer
        setPoint(target);
        setMode('frozen');
    }, []);

    const release = useCallback(() => {
        setMode('idle');
        setPoint(null);
    }, []);

    // Repositionne quand le contenu (point) ou le mode change : la hauteur du
    // tooltip varie (bloc Impôts, événements, bouton figé…) → re-mesure + re-clamp.
    useLayoutEffect(() => {
        if (!point) return;
        heightRef.current = tooltipRef.current?.offsetHeight ?? 0;
        applyPosition();
    }, [point, mode, applyPosition]);

    // a11y : au figer, focus le tooltip (lecteur d'écran + Échap) ; à la libération,
    // restitue le focus au graphe (containerRef doit être focusable : tabIndex=-1).
    const prevModeRef = useRef<ChartTooltipMode>(mode);
    useEffect(() => {
        const prev = prevModeRef.current;
        if (mode === 'frozen' && prev !== 'frozen') {
            tooltipRef.current?.focus();
        } else if (prev === 'frozen' && mode !== 'frozen') {
            containerRef.current?.focus?.();
        }
        prevModeRef.current = mode;
    }, [mode, containerRef]);

    // Listeners document (Échap + clic-dehors) — montés UNIQUEMENT en gelé, retirés au unmount/dégel.
    useEffect(() => {
        if (mode !== 'frozen') return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') release();
        };
        const onDocPointerDown = (e: PointerEvent) => {
            const target = e.target as Node | null;
            const tip = tooltipRef.current;
            const container = containerRef.current;
            if (tip && target && tip.contains(target)) return;       // clic DANS le tooltip = garder (scroll, bouton)
            if (container && target && container.contains(target)) return; // clic sur le graphe = re-fige (géré par onClick)
            release();
        };
        document.addEventListener('keydown', onKey);
        document.addEventListener('pointerdown', onDocPointerDown, true); // capture : précède les handlers React
        return () => {
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('pointerdown', onDocPointerDown, true);
        };
    }, [mode, release, containerRef]);

    return { mode, point, tooltipRef, onPointerMove, onHoverPoint, onChartLeave, freezeOn, release };
}
