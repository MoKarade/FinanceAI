// hooks/usePwaInstallPrompt.ts
//
// Capture l'event `beforeinstallprompt` (PWA installable) et expose une
// fonction `promptInstall()` que l'UI peut déclencher quand l'utilisateur
// clique un bouton custom "Installer l'app".
//
// L'event natif `beforeinstallprompt` est tiré par le navigateur quand
// la PWA est prête à être installée (manifest valide + SW registered).
// Sans gestion custom, Chrome affiche son propre prompt qui est facile
// à manquer. Avec ce hook, on peut afficher un bouton plus visible dans
// l'UI (Configuration ou banner).
//
// Le state `dismissed` est persisté dans localStorage pour ne pas re-prompter
// agressivement si l'utilisateur a déjà refusé.

import { useEffect, useState, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISSED_KEY = 'pwa-install-dismissed:v1';
const DISMISS_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours

export interface PwaInstallState {
    /** L'app est-elle installable (browser supporte + critères PWA OK + pas déjà installée) ? */
    canInstall: boolean;
    /** Déjà installée (chargée en mode standalone) ? */
    isInstalled: boolean;
    /** L'utilisateur a-t-il dismissé récemment (< 30 jours) ? */
    isDismissed: boolean;
    /** Trigger le prompt natif. Retourne 'accepted' / 'dismissed' / null si pas dispo. */
    promptInstall: () => Promise<'accepted' | 'dismissed' | null>;
    /** Marquer comme dismissé pour 30 jours. */
    dismissForNow: () => void;
}

function isStandalone(): boolean {
    if (typeof window === 'undefined') return false;
    // iOS Safari : navigator.standalone. Chrome/Edge : matchMedia.
    if ((window.navigator as Navigator & { standalone?: boolean }).standalone) return true;
    return window.matchMedia?.('(display-mode: standalone)').matches ?? false;
}

function isRecentlyDismissed(): boolean {
    try {
        const raw = localStorage.getItem(DISMISSED_KEY);
        if (!raw) return false;
        const ts = parseInt(raw, 10);
        if (!Number.isFinite(ts)) return false;
        return Date.now() - ts < DISMISS_DURATION_MS;
    } catch {
        return false;
    }
}

export function usePwaInstallPrompt(): PwaInstallState {
    const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null);
    const [installed, setInstalled] = useState<boolean>(() => isStandalone());
    const [dismissed, setDismissed] = useState<boolean>(() => isRecentlyDismissed());

    useEffect(() => {
        const onBeforeInstall = (e: Event) => {
            e.preventDefault();
            setDeferredEvent(e as BeforeInstallPromptEvent);
        };
        const onInstalled = () => {
            setInstalled(true);
            setDeferredEvent(null);
        };
        window.addEventListener('beforeinstallprompt', onBeforeInstall);
        window.addEventListener('appinstalled', onInstalled);
        return () => {
            window.removeEventListener('beforeinstallprompt', onBeforeInstall);
            window.removeEventListener('appinstalled', onInstalled);
        };
    }, []);

    const promptInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | null> => {
        if (!deferredEvent) return null;
        try {
            await deferredEvent.prompt();
            const { outcome } = await deferredEvent.userChoice;
            setDeferredEvent(null);
            if (outcome === 'dismissed') {
                try { localStorage.setItem(DISMISSED_KEY, String(Date.now())); } catch { /* quota */ }
                setDismissed(true);
            }
            return outcome;
        } catch (err) {
            console.warn('[PWA] prompt failed:', err);
            return null;
        }
    }, [deferredEvent]);

    const dismissForNow = useCallback(() => {
        try { localStorage.setItem(DISMISSED_KEY, String(Date.now())); } catch { /* quota */ }
        setDismissed(true);
    }, []);

    return {
        canInstall: !!deferredEvent && !installed && !dismissed,
        isInstalled: installed,
        isDismissed: dismissed,
        promptInstall,
        dismissForNow,
    };
}
