// components/ui/Drawer.tsx
// [FUTUR-NAV-TIROIRS] Tiroir superposé — variante « lateral » (ancré à droite, plein écran de
// haut en bas) ou « feuille » (ancré en bas, ~3/4 d'écran, coins arrondis en haut). Portalé sur
// `document.body` pour échapper à tout ancêtre transformé, comme `FutureDetailModal` le fait déjà
// pour sa propre feuille mobile — même patron de bottom-sheet repris ici plutôt que réinventé, pour
// que les deux ne divergent pas avec le temps.
//
// ⚠️ Ne réimplémente PAS le piège de focus : `useFocusTrap` (source unique, `hooks/useFocusTrap.ts`)
// est le seul mécanisme de piège Tab/Shift+Tab du dépôt. Le focus initial, le verrou de scroll,
// Échap et la restauration du focus restent ICI (ils diffèrent légitimement d'un dialogue à
// l'autre) — même répartition que `Modal.tsx`.
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { useFocusTrap } from '../../hooks/useFocusTrap';

export type DrawerVariant = 'lateral' | 'feuille';

interface DrawerProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    subtitle?: React.ReactNode;
    variant: DrawerVariant;
    /** Posé sur le conteneur `role="dialog"` — permet à un déclencheur externe de le référencer
     *  via `aria-controls` AVANT l'ouverture (perdu par rapport à l'ancien bandeau à onglets,
     *  qui exposait `panelId`). Optionnel : un tiroir sans déclencheur externe s'en passe. */
    id?: string;
    closeOnBackdrop?: boolean;
    closeOnEsc?: boolean;
    /**
     * Élément à focaliser à l'ouverture, à la place du bouton ✕.
     *
     * ⚠️ [A11Y-MODAL-GUIDE-NODIALOG] Même piège que `Modal.tsx` : sans ça, un tiroir de SAISIE
     * (`ProjectionControls` en contient un) qui gagnerait un jour un `autoFocus` se le ferait
     * reprendre par le focus différé du ✕ (50 ms). Aucun contenu de tiroir n'en pose aujourd'hui —
     * la prop existe pour que ce jour-là n'ait pas à redécouvrir le problème.
     */
    initialFocusRef?: React.RefObject<HTMLElement | null>;
    children: React.ReactNode;
}

export const Drawer: React.FC<DrawerProps> = ({
    isOpen, onClose, title, subtitle, variant, id,
    closeOnBackdrop = true, closeOnEsc = true, initialFocusRef, children,
}) => {
    const closeBtnRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;
    const titleId = React.useId();

    useFocusTrap(panelRef, isOpen);

    useEffect(() => {
        if (!isOpen) return;
        previousFocusRef.current = (document.activeElement as HTMLElement | null) ?? null;
        const t = setTimeout(() => (initialFocusRef?.current ?? closeBtnRef.current)?.focus(), 50);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const onKey = (e: KeyboardEvent) => {
            if (closeOnEsc && e.key === 'Escape') { onCloseRef.current(); }
        };
        document.addEventListener('keydown', onKey);
        return () => {
            clearTimeout(t);
            document.body.style.overflow = prevOverflow;
            document.removeEventListener('keydown', onKey);
            const target = previousFocusRef.current;
            if (target && document.body.contains(target) && typeof target.focus === 'function') {
                target.focus();
            }
        };
    }, [isOpen, closeOnEsc, initialFocusRef]);

    if (!isOpen) return null;

    const panelClass = variant === 'lateral'
        ? 'fixed inset-y-0 right-0 w-full max-w-[440px] border-l border-white/15'
        : 'fixed inset-x-0 bottom-0 w-full h-[75vh] max-h-[75vh] rounded-t-2xl border-t border-white/15';

    return createPortal(
        <div role="presentation" className="fixed inset-0 z-[9999] bg-black/55 animate-fade-in" onClick={closeOnBackdrop ? onClose : undefined}>
            <div
                ref={panelRef}
                id={id}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onClick={(e) => e.stopPropagation()}
                className={`${panelClass} bg-surface shadow-2xl flex flex-col`}
            >
                <div className="flex items-start justify-between gap-3 p-5 border-b border-white/10 flex-shrink-0">
                    <div className="min-w-0">
                        <h2 id={titleId} className="text-h2 text-ink-50 truncate">{title}</h2>
                        {subtitle && <p className="text-meta text-ink-400 mt-0.5">{subtitle}</p>}
                    </div>
                    <button
                        ref={closeBtnRef}
                        type="button"
                        onClick={onClose}
                        aria-label="Fermer"
                        className="w-11 h-11 flex-shrink-0 inline-flex items-center justify-center rounded-card text-ink-300 hover:text-ink-50 hover:bg-white/10 transition-colors focus-ring"
                    >
                        <Icon name="close" size={18} />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-5 min-h-0">
                    {children}
                </div>
            </div>
        </div>,
        document.body,
    );
};
