import React, { useEffect, useRef } from 'react';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: React.ReactNode;
    subtitle?: React.ReactNode;
    icon?: React.ReactNode;
    size?: ModalSize;
    closeOnBackdrop?: boolean;
    closeOnEsc?: boolean;
    /** Slot pour des actions à droite du titre (ex: actions secondaires). */
    headerActions?: React.ReactNode;
    /** Footer slot — affiché en bas, séparé par un border-top. */
    footer?: React.ReactNode;
    className?: string;
    children: React.ReactNode;
}

const SIZE_CLASSES: Record<ModalSize, string> = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-2xl',
    full: 'max-w-5xl max-h-[90vh]',
};

/**
 * Phase 3A — Primitive Modal unifiée.
 *
 * Remplace les 5+ implémentations custom (ConfirmModal, GuideModal,
 * BudgetAiModal, BackupPanel modals, Transactions wizard…).
 *
 * Caractéristiques:
 *  - role="dialog" + aria-modal="true" + aria-labelledby auto
 *  - Backdrop blur + escape key + clic backdrop (configurables)
 *  - Focus trap minimal: focus initial sur le close button
 *  - Lock body scroll quand ouvert (évite scroll arrière-plan)
 *  - Mobile-friendly: w-full max-w-X, p-4 du backdrop pour padding sûr
 */
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const Modal: React.FC<ModalProps> = ({
    isOpen, onClose,
    title, subtitle, icon,
    size = 'md',
    closeOnBackdrop = true,
    closeOnEsc = true,
    headerActions, footer,
    className = '', children,
}) => {
    const closeBtnRef = useRef<HTMLButtonElement>(null);
    const dialogRef = useRef<HTMLDivElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);
    // `onClose` est souvent une fonction inline (nouvelle référence à chaque rendu du parent). On la
    // garde dans un ref pour que l'effet de focus NE dépende PAS de son identité : sinon il se relançait
    // à chaque frappe dans un champ → setTimeout re-focus le bouton ✕ → impossible de taper (bug Marc).
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;
    const titleId = React.useId();

    useEffect(() => {
        if (!isOpen) return;
        // P2.2 — save current focus pour le restaurer à la fermeture (a11y keyboard)
        previousFocusRef.current = (document.activeElement as HTMLElement | null) ?? null;
        const t = setTimeout(() => closeBtnRef.current?.focus(), 50);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const onKey = (e: KeyboardEvent) => {
            if (closeOnEsc && e.key === 'Escape') { onCloseRef.current(); return; }
            if (e.key !== 'Tab' || !dialogRef.current) return;
            const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey) {
                if (document.activeElement === first) { last.focus(); e.preventDefault(); }
            } else {
                if (document.activeElement === last) { first.focus(); e.preventDefault(); }
            }
        };
        document.addEventListener('keydown', onKey);
        return () => {
            clearTimeout(t);
            document.body.style.overflow = prevOverflow;
            document.removeEventListener('keydown', onKey);
            // P2.2 — restore focus à l'opener (guard si l'élément a été détruit)
            const target = previousFocusRef.current;
            if (target && document.body.contains(target) && typeof target.focus === 'function') {
                target.focus();
            }
        };
    }, [isOpen, closeOnEsc]);

    if (!isOpen) return null;

    return (
        <div
            role="presentation"
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
            onClick={closeOnBackdrop ? onClose : undefined}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={title ? titleId : undefined}
                onClick={e => e.stopPropagation()}
                className={[
                    'bg-surface border border-white/15 rounded-card shadow-2xl w-full overflow-hidden',
                    'animate-slide-up flex flex-col max-h-[90vh]',
                    SIZE_CLASSES[size],
                    className,
                ].filter(Boolean).join(' ')}
            >
                {(title || headerActions) && (
                    <div className="flex items-start justify-between gap-3 p-4 border-b border-white/10 flex-shrink-0">
                        <div className="flex items-center gap-3 min-w-0">
                            {icon && <span className="text-h1 flex-shrink-0" aria-hidden="true">{icon}</span>}
                            <div className="min-w-0">
                                {title && <h2 id={titleId} className="text-h2 text-ink-50 truncate">{title}</h2>}
                                {subtitle && <p className="text-meta text-ink-400 mt-0.5">{subtitle}</p>}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            {headerActions}
                            <button
                                ref={closeBtnRef}
                                type="button"
                                onClick={onClose}
                                aria-label="Fermer"
                                className="w-11 h-11 inline-flex items-center justify-center rounded-card text-ink-300 hover:text-ink-50 hover:bg-white/10 transition-colors focus-ring"
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto p-4 min-h-0">
                    {children}
                </div>

                {footer && (
                    <div className="flex items-center justify-end gap-2 p-4 border-t border-white/10 flex-shrink-0">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
};
