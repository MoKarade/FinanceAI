import React, { useState, useEffect, useCallback } from 'react';

// Sprint 2 H5 (Sprint 2 quick wins) — Migration framer-motion → CSS keyframes
// Économie : ~80 KB gzip dans le bundle. framer-motion était utilisé UNIQUEMENT
// pour ce composant (1 usage isolé). Les animations sont maintenant dans
// index.css (.animate-toast-in / .animate-toast-out).

export interface ToastMessage {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
    isExiting?: boolean;
}

const safeRandomId = (): string => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
};

const EXIT_ANIMATION_MS = 200;
const TOAST_LIFETIME_MS = 4000;

export const ToastContainer: React.FC = () => {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    const removeToast = useCallback((id: string) => {
        // 2-phase remove pour permettre l'animation de sortie : on marque
        // d'abord isExiting=true (CSS animation toast-slide-out joue), puis
        // on retire vraiment de l'array après EXIT_ANIMATION_MS.
        setToasts(prev => prev.map(t => t.id === id ? { ...t, isExiting: true } : t));
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, EXIT_ANIMATION_MS);
    }, []);

    useEffect(() => {
        const handleToast = (event: CustomEvent<{ message: string; type?: 'success' | 'error' | 'info' }>) => {
            const { message, type = 'info' } = event.detail;
            const id = safeRandomId();
            setToasts(prev => [...prev, { id, message, type }]);

            setTimeout(() => removeToast(id), TOAST_LIFETIME_MS);
        };

        window.addEventListener('app-toast', handleToast as EventListener);
        return () => window.removeEventListener('app-toast', handleToast as EventListener);
    }, [removeToast]);

    return (
        <div
            role="region"
            aria-live="polite"
            aria-atomic="true"
            aria-label="Notifications"
            className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none"
        >
            {toasts.map(toast => (
                <div
                    key={toast.id}
                    role={toast.type === 'error' ? 'alert' : 'status'}
                    className={`${toast.isExiting ? 'animate-toast-out' : 'animate-toast-in'} pointer-events-auto min-w-[300px] p-4 rounded-xl border shadow-2xl flex items-center gap-3 ${toast.type === 'success' ? 'bg-emerald-900/90 border-success-500/50 text-emerald-100' :
                            toast.type === 'error' ? 'bg-red-900/90 border-danger-500/50 text-red-100' :
                                'bg-blue-900/90 border-info-500/50 text-blue-100'
                        }`}
                >
                    <span className="text-xl" aria-hidden="true">
                        {toast.type === 'success' ? '✅' : toast.type === 'error' ? '❌' : 'ℹ️'}
                    </span>
                    <div className="flex-1 text-sm font-medium">{toast.message}</div>
                    <button
                        onClick={() => removeToast(toast.id)}
                        aria-label="Fermer la notification"
                        className="touch-target flex items-center justify-center opacity-50 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50 transition-opacity rounded"
                    >
                        ✕
                    </button>
                </div>
            ))}
        </div>
    );
};

export const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    window.dispatchEvent(new CustomEvent('app-toast', { detail: { message, type } }));
};
