/**
 * Rappel discret et dismissable invitant l'utilisateur à exporter un backup.
 *
 * Affiché si :
 *   - l'utilisateur a des données réelles (hasData),
 *   - le mode test est inactif,
 *   - aucun backup n'a été fait depuis > 14 jours (ou jamais).
 *
 * Clé de dismiss : 'backupReminderDismissedAt' dans localStorage.
 * Un dismiss dure 7 jours max ; après, le rappel réapparaît si toujours
 * pertinent (> 14 j sans backup).
 */

import React, { useEffect, useState } from 'react';
import { Tab } from '../types';
import { computeBackupNagStatus } from '../services/backupReminder';
import { QUOTA_EXCEEDED_EVENT } from '../services/quotaStorage';
import { useHasUserData } from '../utils/useHasUserData';
import { useFinanceStore } from '../store/useFinanceStore';
import { showToast } from './ui/Toast';

const DISMISS_KEY = 'backupReminderDismissedAt' as const;
const DISMISS_DURATION_DAYS = 7;

const isDismissed = (): boolean => {
    try {
        const raw = localStorage.getItem(DISMISS_KEY);
        if (!raw) return false;
        const dismissedAt = new Date(raw);
        if (isNaN(dismissedAt.getTime())) return false;
        const msElapsed = Date.now() - dismissedAt.getTime();
        return msElapsed < DISMISS_DURATION_DAYS * 24 * 60 * 60 * 1000;
    } catch {
        return false;
    }
};

const saveDismiss = (): void => {
    try {
        localStorage.setItem(DISMISS_KEY, new Date().toISOString());
    } catch {
        // Pas critique.
    }
};

interface BackupReminderProps {
    onNavigateToSettings: () => void;
}

export const BackupReminder: React.FC<BackupReminderProps> = ({ onNavigateToSettings }) => {
    const { hasData } = useHasUserData();
    const isTestMode = useFinanceStore(s => s.isTestMode);
    const [dismissed, setDismissed] = useState<boolean>(() => isDismissed());
    const [quotaWarning, setQuotaWarning] = useState(false);

    // Re-évaluer si hasData ou isTestMode changent (ex: import de données).
    const [, setTick] = useState(0);
    useEffect(() => {
        const handler = () => setTick(t => t + 1);
        // Re-render au retour au premier plan pour réévaluer les jours écoulés.
        window.addEventListener('focus', handler);
        return () => window.removeEventListener('focus', handler);
    }, []);

    // Alerte quota dépassé — prioritaire sur le rappel normal.
    useEffect(() => {
        const handler = () => {
            setQuotaWarning(true);
            showToast(
                "Stockage presque plein — exporte un backup et libère de l'espace.",
                'error',
            );
        };
        window.addEventListener(QUOTA_EXCEEDED_EVENT, handler);
        return () => window.removeEventListener(QUOTA_EXCEEDED_EVENT, handler);
    }, []);

    const status = computeBackupNagStatus(hasData, isTestMode);

    const showBanner = quotaWarning || (!dismissed && status.shouldShow);

    if (!showBanner) return null;

    const handleDismiss = () => {
        saveDismiss();
        setDismissed(true);
        if (quotaWarning) setQuotaWarning(false);
    };

    const handleNavigate = () => {
        onNavigateToSettings();
        handleDismiss();
    };

    const message = quotaWarning
        ? "Stockage plein — exporte un backup et libère de l'espace pour continuer."
        : status.daysSinceLast !== null
            ? `Dernier backup il y a ${Math.floor(status.daysSinceLast)} jours — pense à en faire un nouveau.`
            : "Tu n'as pas encore fait de backup — tes données ne sont sauvegardées que dans ce navigateur.";

    return (
        <div
            role="status"
            aria-label="Rappel backup"
            className={`mx-3 mb-4 flex items-start gap-3 rounded-xl border px-4 py-3 text-body ${
                quotaWarning
                    ? 'border-danger-500/30 bg-red-900/20 text-red-200'
                    : 'border-warning-500/30 bg-amber-900/15 text-amber-200'
            }`}
        >
            <span className="mt-0.5 shrink-0 text-base" aria-hidden="true">
                {quotaWarning ? '!' : 'i'}
            </span>
            <p className="flex-1 leading-snug">{message}</p>
            <div className="flex shrink-0 items-center gap-2">
                <button
                    type="button"
                    onClick={handleNavigate}
                    className={`rounded-lg px-2.5 py-1 text-meta font-bold transition-colors focus-ring ${
                        quotaWarning
                            ? 'bg-danger-600 hover:bg-danger-500 text-white'
                            : 'bg-amber-700/60 hover:bg-warning-600/70 text-white'
                    }`}
                >
                    Sauvegarder
                </button>
                <button
                    type="button"
                    onClick={handleDismiss}
                    aria-label="Ignorer ce rappel"
                    className="rounded-lg px-2 py-1 text-meta text-ink-300 hover:text-white transition-colors focus-ring"
                >
                    Plus tard
                </button>
            </div>
        </div>
    );
};

// Valeur exportée pour les tests.
export { DISMISS_KEY };
export type { BackupReminderProps };

// Aide au typage pour Layout.tsx (passe Tab.SETTINGS directement).
export const SETTINGS_TAB = Tab.SETTINGS;
