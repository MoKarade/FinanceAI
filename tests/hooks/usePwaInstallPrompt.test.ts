// CA-10 — tests du hook usePwaInstallPrompt : recence de dismiss (localStorage + expiration 30j),
// détection standalone, flux beforeinstallprompt / promptInstall / appinstalled.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePwaInstallPrompt } from '../../hooks/usePwaInstallPrompt';

const DISMISSED_KEY = 'pwa-install-dismissed:v1';
const DAY = 24 * 60 * 60 * 1000;

// Faux event `beforeinstallprompt` : prompt() + userChoice contrôlables (la vraie API n'existe pas en jsdom).
function makeInstallEvent(outcome: 'accepted' | 'dismissed'): Event {
    const e = new Event('beforeinstallprompt');
    Object.assign(e, {
        prompt: vi.fn().mockResolvedValue(undefined),
        userChoice: Promise.resolve({ outcome, platform: 'web' }),
    });
    return e;
}

const setStandalone = (on: boolean) => {
    // jsdom n'implémente pas matchMedia ; on le stub uniquement pour le cas standalone.
    window.matchMedia = vi.fn(() => ({ matches: on })) as unknown as typeof window.matchMedia;
};

describe('usePwaInstallPrompt (CA-10)', () => {
    beforeEach(() => {
        localStorage.clear();
        setStandalone(false);
    });
    afterEach(() => {
        localStorage.clear();
        // @ts-expect-error — retire le stub matchMedia entre les tests.
        delete window.matchMedia;
        vi.restoreAllMocks();
    });

    it('état initial : ni installable, ni installé, ni dismissé (storage vide)', () => {
        const { result } = renderHook(() => usePwaInstallPrompt());
        expect(result.current.canInstall).toBe(false);
        expect(result.current.isInstalled).toBe(false);
        expect(result.current.isDismissed).toBe(false);
    });

    it('beforeinstallprompt → canInstall devient true', () => {
        const { result } = renderHook(() => usePwaInstallPrompt());
        act(() => { window.dispatchEvent(makeInstallEvent('accepted')); });
        expect(result.current.canInstall).toBe(true);
    });

    it('dismissForNow → isDismissed true, canInstall false, timestamp persisté', () => {
        const { result } = renderHook(() => usePwaInstallPrompt());
        act(() => { window.dispatchEvent(makeInstallEvent('accepted')); });
        expect(result.current.canInstall).toBe(true);
        act(() => { result.current.dismissForNow(); });
        expect(result.current.isDismissed).toBe(true);
        expect(result.current.canInstall).toBe(false);
        expect(localStorage.getItem(DISMISSED_KEY)).not.toBeNull();
    });

    it('dismiss RÉCENT (< 30j) en storage → isDismissed true au montage', () => {
        localStorage.setItem(DISMISSED_KEY, String(Date.now()));
        const { result } = renderHook(() => usePwaInstallPrompt());
        expect(result.current.isDismissed).toBe(true);
    });

    it('dismiss ANCIEN (> 30j) → isDismissed false (fenêtre expirée)', () => {
        localStorage.setItem(DISMISSED_KEY, String(Date.now() - 31 * DAY));
        const { result } = renderHook(() => usePwaInstallPrompt());
        expect(result.current.isDismissed).toBe(false);
    });

    it('timestamp corrompu (non numérique) → isDismissed false (garde Number.isFinite)', () => {
        localStorage.setItem(DISMISSED_KEY, 'NaN-pas-un-nombre');
        const { result } = renderHook(() => usePwaInstallPrompt());
        expect(result.current.isDismissed).toBe(false);
    });

    it('standalone (matchMedia) → isInstalled true, canInstall false', () => {
        setStandalone(true);
        const { result } = renderHook(() => usePwaInstallPrompt());
        expect(result.current.isInstalled).toBe(true);
        // même avec un event d'install, une app déjà installée n'est pas « installable ».
        act(() => { window.dispatchEvent(makeInstallEvent('accepted')); });
        expect(result.current.canInstall).toBe(false);
    });

    it('promptInstall sans event → retourne null', async () => {
        const { result } = renderHook(() => usePwaInstallPrompt());
        let outcome: 'accepted' | 'dismissed' | null = 'accepted';
        await act(async () => { outcome = await result.current.promptInstall(); });
        expect(outcome).toBeNull();
    });

    it('promptInstall (outcome "dismissed") → persiste le dismiss + isDismissed true', async () => {
        const { result } = renderHook(() => usePwaInstallPrompt());
        act(() => { window.dispatchEvent(makeInstallEvent('dismissed')); });
        let outcome: 'accepted' | 'dismissed' | null = null;
        await act(async () => { outcome = await result.current.promptInstall(); });
        expect(outcome).toBe('dismissed');
        expect(result.current.isDismissed).toBe(true);
        expect(localStorage.getItem(DISMISSED_KEY)).not.toBeNull();
    });

    it('promptInstall (outcome "accepted") → ne dismisse PAS', async () => {
        const { result } = renderHook(() => usePwaInstallPrompt());
        act(() => { window.dispatchEvent(makeInstallEvent('accepted')); });
        let outcome: 'accepted' | 'dismissed' | null = null;
        await act(async () => { outcome = await result.current.promptInstall(); });
        expect(outcome).toBe('accepted');
        expect(result.current.isDismissed).toBe(false);
        expect(localStorage.getItem(DISMISSED_KEY)).toBeNull();
    });

    it('appinstalled → isInstalled true, canInstall false', () => {
        const { result } = renderHook(() => usePwaInstallPrompt());
        act(() => { window.dispatchEvent(makeInstallEvent('accepted')); });
        act(() => { window.dispatchEvent(new Event('appinstalled')); });
        expect(result.current.isInstalled).toBe(true);
        expect(result.current.canInstall).toBe(false);
    });
});
