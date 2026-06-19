import React, { useState, useRef } from 'react';

type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

interface TooltipProps {
    content: React.ReactNode;
    position?: TooltipPosition;
    /** Délai avant affichage en ms. */
    delay?: number;
    /** Si true, le tooltip wrap le children dans un span inline-block. */
    asChild?: boolean;
    className?: string;
    children: React.ReactNode;
}

const POSITION_CLASSES: Record<TooltipPosition, string> = {
    top:    'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left:   'right-full top-1/2 -translate-y-1/2 mr-2',
    right:  'left-full top-1/2 -translate-y-1/2 ml-2',
};

const ARROW_CLASSES: Record<TooltipPosition, string> = {
    top:    'top-full left-1/2 -translate-x-1/2 border-t-ink-400 border-x-transparent border-b-transparent',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-ink-400 border-x-transparent border-t-transparent',
    left:   'left-full top-1/2 -translate-y-1/2 border-l-ink-400 border-y-transparent border-r-transparent',
    right:  'right-full top-1/2 -translate-y-1/2 border-r-ink-400 border-y-transparent border-l-transparent',
};

/**
 * Phase 3A — Primitive Tooltip légère.
 *
 * Avantages vs `title=""` natif :
 *   - Apparait après un délai contrôlable (défaut 500ms)
 *   - Multi-ligne via ReactNode (titre + description)
 *   - Stylable selon le design system (text-meta, bg-ink, shadow)
 *   - Accessible: aria-describedby propagé au child via wrapper
 *   - Désactivable au touch (mobile: pas de hover, tap)
 *
 * Utilisation simple:
 *   <Tooltip content="Aide contextuelle"><Button>?</Button></Tooltip>
 */
export const Tooltip: React.FC<TooltipProps> = ({
    content, position = 'top', delay = 500, asChild = false,
    className = '', children,
}) => {
    const [visible, setVisible] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const tooltipId = React.useId();

    const show = () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setVisible(true), delay);
    };
    const hide = () => {
        if (timer.current) clearTimeout(timer.current);
        setVisible(false);
    };

    const wrapperClass = asChild ? 'inline-flex' : 'relative inline-flex';
    const describedById = visible ? tooltipId : undefined;
    // [A11Y] aria-describedby sur l'ENFANT (le déclencheur), pas le wrapper : sinon il n'est pas associé au
    // nom accessible d'un <button>/<a> enfant (le SR calcule le nom du child seul). Repli sur le wrapper si
    // l'enfant n'est pas un élément React clonable (ex. texte brut).
    const isElementChild = React.isValidElement(children);
    const child = isElementChild
        ? React.cloneElement(children as React.ReactElement<{ 'aria-describedby'?: string }>, { 'aria-describedby': describedById })
        : children;

    return (
        <span
            className={`${wrapperClass} ${className}`}
            onMouseEnter={show}
            onMouseLeave={hide}
            onFocus={show}
            onBlur={hide}
            onKeyDown={(e) => { if (e.key === 'Escape') hide(); }}
            aria-describedby={isElementChild ? undefined : describedById}
        >
            {child}
            {visible && (
                <span
                    role="tooltip"
                    id={tooltipId}
                    className={`absolute z-50 ${POSITION_CLASSES[position]} pointer-events-none animate-fade-in`}
                >
                    <span className="block bg-ink-400/95 text-ink-50 text-meta px-2.5 py-1.5 rounded-card shadow-xl border border-white/10 max-w-xs whitespace-normal">
                        {content}
                    </span>
                    <span
                        aria-hidden="true"
                        className={`absolute w-0 h-0 border-4 ${ARROW_CLASSES[position]}`}
                    />
                </span>
            )}
        </span>
    );
};
