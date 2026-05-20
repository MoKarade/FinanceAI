
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface ToastMessage {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
}

const safeRandomId = (): string => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
};

export const ToastContainer: React.FC = () => {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    useEffect(() => {
        const handleToast = (event: any) => {
            const { message, type = 'info' } = event.detail;
            const id = safeRandomId();
            setToasts(prev => [...prev, { id, message, type }]);

            setTimeout(() => removeToast(id), 4000);
        };

        window.addEventListener('app-toast', handleToast);
        return () => window.removeEventListener('app-toast', handleToast);
    }, [removeToast]);

    return (
        <div
            role="region"
            aria-live="polite"
            aria-atomic="true"
            aria-label="Notifications"
            className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none"
        >
            <AnimatePresence>
                {toasts.map(toast => (
                    <motion.div
                        key={toast.id}
                        role={toast.type === 'error' ? 'alert' : 'status'}
                        initial={{ opacity: 0, x: 50, scale: 0.9 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                        className={`pointer-events-auto min-w-[300px] p-4 rounded-xl border shadow-2xl flex items-center gap-3 ${toast.type === 'success' ? 'bg-emerald-900/90 border-emerald-500/50 text-emerald-100' :
                                toast.type === 'error' ? 'bg-red-900/90 border-red-500/50 text-red-100' :
                                    'bg-blue-900/90 border-blue-500/50 text-blue-100'
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
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
};

export const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    window.dispatchEvent(new CustomEvent('app-toast', { detail: { message, type } }));
};
