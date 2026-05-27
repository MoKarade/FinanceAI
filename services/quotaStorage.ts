/**
 * Wrapper autour de localStorage qui intercepte QuotaExceededError.
 *
 * Comportement :
 * - getItem / removeItem / key / clear / length : délégués directement, identiques.
 * - setItem : identique en cas de succès ; si localStorage.setItem lève
 *   QuotaExceededError (ou DOMException avec name 'QuotaExceededError' /
 *   NS_ERROR_DOM_QUOTA_REACHED), émet un événement 'financeai-quota-exceeded'
 *   sur window pour que le composant d'alerte puisse réagir, puis re-lance
 *   l'erreur pour ne pas silencier le problème.
 *
 * Usage dans useFinanceStore.ts :
 *   import { createJSONStorage } from 'zustand/middleware';
 *   import { quotaStorage } from '../services/quotaStorage';
 *   ...
 *   storage: createJSONStorage(() => quotaStorage),
 */

export const QUOTA_EXCEEDED_EVENT = 'financeai-quota-exceeded' as const;

const isQuotaError = (err: unknown): boolean => {
    if (!(err instanceof DOMException)) return false;
    return (
        err.name === 'QuotaExceededError' ||
        err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        err.code === 22
    );
};

const emitQuotaWarning = (): void => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(QUOTA_EXCEEDED_EVENT));
};

export const quotaStorage: Storage = {
    get length(): number {
        return localStorage.length;
    },

    key(index: number): string | null {
        return localStorage.key(index);
    },

    getItem(key: string): string | null {
        return localStorage.getItem(key);
    },

    setItem(key: string, value: string): void {
        try {
            localStorage.setItem(key, value);
        } catch (err: unknown) {
            if (isQuotaError(err)) {
                emitQuotaWarning();
            }
            // Re-lancer dans tous les cas : Zustand/l'appelant doit savoir que
            // l'écriture a échoué. Ne pas avaler silencieusement.
            throw err;
        }
    },

    removeItem(key: string): void {
        localStorage.removeItem(key);
    },

    clear(): void {
        localStorage.clear();
    },
};
