/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    CONSENT_STORAGE_KEY,
    getStoredConsent,
    setConsent,
    applyGtagConsent,
} from '../../services/consent';

type GtagWindow = typeof globalThis & { gtag?: (...args: unknown[]) => void };

beforeEach(() => {
    localStorage.clear();
    delete (globalThis as GtagWindow).gtag;
});

afterEach(() => {
    delete (globalThis as GtagWindow).gtag;
});

describe('consent — Loi 25 / Consent Mode v2', () => {
    it('getStoredConsent : null si rien de persisté', () => {
        expect(getStoredConsent()).toBeNull();
    });

    it('getStoredConsent : restitue granted / denied', () => {
        localStorage.setItem(CONSENT_STORAGE_KEY, 'granted');
        expect(getStoredConsent()).toBe('granted');
        localStorage.setItem(CONSENT_STORAGE_KEY, 'denied');
        expect(getStoredConsent()).toBe('denied');
    });

    it('getStoredConsent : valeur inattendue => null (pas de confiance aveugle)', () => {
        localStorage.setItem(CONSENT_STORAGE_KEY, 'peut-être');
        expect(getStoredConsent()).toBeNull();
    });

    it('setConsent persiste le choix', () => {
        setConsent('granted');
        expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBe('granted');
        setConsent('denied');
        expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBe('denied');
    });

    it('setConsent propage à gtag (consent update analytics_storage)', () => {
        const gtag = vi.fn();
        (globalThis as GtagWindow).gtag = gtag;
        setConsent('granted');
        expect(gtag).toHaveBeenCalledWith('consent', 'update', { analytics_storage: 'granted' });
        setConsent('denied');
        expect(gtag).toHaveBeenCalledWith('consent', 'update', { analytics_storage: 'denied' });
    });

    it('applyGtagConsent : no-op silencieux si gtag absent', () => {
        expect(() => applyGtagConsent('granted')).not.toThrow();
    });
});
