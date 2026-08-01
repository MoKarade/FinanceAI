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

describe('[SEC-GA-DEFER-CONSENT] le SCRIPT gtag.js ne part chez Google qu\'au consentement', () => {
    const gtagScript = () => document.querySelector('script[src^="https://www.googletagmanager.com/gtag/js"]');

    beforeEach(() => {
        gtagScript()?.remove();
    });

    it('setConsent(granted) injecte le script gtag.js (une seule fois)', () => {
        expect(gtagScript()).toBeNull();
        setConsent('granted');
        expect(gtagScript()).not.toBeNull();
        setConsent('granted'); // idempotent : pas de doublon
        expect(document.querySelectorAll('script[src^="https://www.googletagmanager.com/gtag/js"]')).toHaveLength(1);
    });

    it('setConsent(denied) N\'injecte PAS le script (aucune requête vers Google)', () => {
        setConsent('denied');
        expect(gtagScript()).toBeNull();
    });

    it('index.html ne charge PLUS gtag.js statiquement (le différé serait sinon un mensonge)', async () => {
        const fs = await import('node:fs');
        const html = fs.readFileSync('index.html', 'utf8');
        expect(html).not.toMatch(/<script[^>]+googletagmanager\.com/);
        expect(html).toMatch(/ga-init\.js/); // le stub Consent Mode reste au boot
    });

    it('ga-init.js n\'injecte le tag QUE sous consentement persisté granted (clé synchronisée)', async () => {
        const fs = await import('node:fs');
        const js = fs.readFileSync('public/ga-init.js', 'utf8');
        expect(js).toContain(CONSENT_STORAGE_KEY); // contrat de clé partagée
        // Le createElement du tag est DANS le bloc gated par 'granted' : garde grossière mais
        // discriminante — si quelqu'un remonte l'injection hors du if, l'ordre change.
        expect(js.indexOf("=== 'granted'")).toBeGreaterThan(-1);
        expect(js.indexOf("=== 'granted'")).toBeLessThan(js.indexOf('createElement'));
    });
});
