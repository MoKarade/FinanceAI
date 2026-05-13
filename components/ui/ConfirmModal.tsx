
import React from 'react';

interface ConfirmModalProps {
    isOpen: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    title?: string;
    message: string;
    confirmLabel?: string;
    confirmVariant?: 'danger' | 'warning' | 'primary';
}

/**
 * Modal de confirmation non-bloquant remplaçant window.confirm()
 * Compatible mobile Safari, ne bloque pas le thread principal.
 */
export const ConfirmModal: React.FC<ConfirmModalProps> = ({
    isOpen,
    onConfirm,
    onCancel,
    title = 'Confirmation',
    message,
    confirmLabel = 'Confirmer',
    confirmVariant = 'danger'
}) => {
    if (!isOpen) return null;

    const btnColors = {
        danger: 'bg-red-500 hover:bg-red-600 text-white',
        warning: 'bg-yellow-500 hover:bg-yellow-600 text-white',
        primary: 'bg-primary hover:bg-emerald-600 text-white',
    };

    return (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
            onClick={onCancel}
        >
            <div
                className="bg-[#151922] border border-white/15 rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-scale-in"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-start gap-3 mb-4">
                    <div className={`text-2xl mt-0.5 ${confirmVariant === 'danger' ? 'text-red-400' : 'text-yellow-400'}`}>
                        {confirmVariant === 'danger' ? '⚠️' : '❓'}
                    </div>
                    <div>
                        <h3 className="text-white font-bold text-base mb-1">{title}</h3>
                        <p className="text-gray-400 text-sm leading-relaxed whitespace-pre-line">{message}</p>
                    </div>
                </div>
                <div className="flex gap-3 justify-end mt-5">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-all text-sm font-medium"
                    >
                        Annuler
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`px-4 py-2 rounded-xl transition-all text-sm font-bold shadow-lg active:scale-95 ${btnColors[confirmVariant]}`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};
