/**
 * Gestion de la date du dernier export backup et logique du rappel.
 *
 * Stockage : localStorage, clé 'lastBackupAt' (timestamp ISO).
 * Séparé du persist Zustand pour survivre à un resetState ou à une restauration.
 */

const STORAGE_KEY = 'lastBackupAt' as const;
const NAG_AFTER_DAYS = 14;

/**
 * Enregistre la date du dernier export réussi (maintenant).
 */
export const markBackupDone = (): void => {
    try {
        localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    } catch {
        // Quota déjà plein ou localStorage indisponible : pas critique ici.
    }
};

/**
 * Retourne la date du dernier export, ou null si jamais fait.
 */
export const getLastBackupDate = (): Date | null => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const d = new Date(raw);
        return isNaN(d.getTime()) ? null : d;
    } catch {
        return null;
    }
};

export interface BackupNagStatus {
    /** Afficher le rappel ? */
    shouldShow: boolean;
    /** Date du dernier backup, null si jamais fait. */
    lastBackupAt: Date | null;
    /** Nombre de jours depuis le dernier backup (null si jamais fait). */
    daysSinceLast: number | null;
}

/**
 * Calcule si le rappel doit être affiché.
 *
 * @param hasUserData - L'utilisateur a des données réelles (pas en mode test / onboarding).
 * @param isTestMode  - Le mode test est actif.
 * @param now         - Injecté pour faciliter les tests unitaires (défaut : Date.now).
 */
export const computeBackupNagStatus = (
    hasUserData: boolean,
    isTestMode: boolean,
    now: number = Date.now(),
): BackupNagStatus => {
    // Jamais affiché en mode test ni si pas de données réelles.
    if (isTestMode || !hasUserData) {
        return { shouldShow: false, lastBackupAt: null, daysSinceLast: null };
    }

    const lastBackupAt = getLastBackupDate();

    if (!lastBackupAt) {
        // Jamais fait de backup ET l'user a des données : afficher.
        return { shouldShow: true, lastBackupAt: null, daysSinceLast: null };
    }

    const msElapsed = now - lastBackupAt.getTime();
    const daysSinceLast = msElapsed / (1000 * 60 * 60 * 24);

    return {
        shouldShow: daysSinceLast > NAG_AFTER_DAYS,
        lastBackupAt,
        daysSinceLast,
    };
};
