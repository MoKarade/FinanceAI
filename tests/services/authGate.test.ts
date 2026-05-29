import { describe, it, expect, beforeEach } from 'vitest';
import { isGateEnabled, isGateEscaped, setGateEscaped, gateRequiresLogin } from '../../services/sync/authGate';

beforeEach(() => {
    try {
        sessionStorage.clear();
    } catch {
        /* sessionStorage indispo en CI : les tests de trappe se contentent du défaut */
    }
});

describe('isGateEnabled — capacité (Client ID) + activation (flag)', () => {
    it('off si pas de Client ID, même avec le flag', () => {
        expect(isGateEnabled('', '1')).toBe(false);
        expect(isGateEnabled(undefined, '1')).toBe(false);
    });
    it('off si Client ID mais flag absent/faux (livraison dark)', () => {
        expect(isGateEnabled('cid.apps', undefined)).toBe(false);
        expect(isGateEnabled('cid.apps', '')).toBe(false);
        expect(isGateEnabled('cid.apps', '0')).toBe(false);
        expect(isGateEnabled('cid.apps', 'off')).toBe(false);
    });
    it('on seulement si Client ID ET flag truthy', () => {
        expect(isGateEnabled('cid.apps', '1')).toBe(true);
        expect(isGateEnabled('cid.apps', 'true')).toBe(true);
        expect(isGateEnabled('cid.apps', 'ON')).toBe(true);
        expect(isGateEnabled('cid.apps', 'yes')).toBe(true);
    });
});

describe('gateRequiresLogin — décision pure', () => {
    it('gate désactivé → jamais de login (comportement actuel)', () => {
        expect(gateRequiresLogin({ enabled: false, escaped: false, authenticated: false })).toBe(false);
    });
    it('trappe anti-lockout → pas de login', () => {
        expect(gateRequiresLogin({ enabled: true, escaped: true, authenticated: false })).toBe(false);
    });
    it('activé + non échappé + non authentifié → login requis', () => {
        expect(gateRequiresLogin({ enabled: true, escaped: false, authenticated: false })).toBe(true);
    });
    it('authentifié → pas de login', () => {
        expect(gateRequiresLogin({ enabled: true, escaped: false, authenticated: true })).toBe(false);
    });
});

describe('trappe anti-lockout (sessionStorage)', () => {
    it('faux par défaut', () => {
        expect(isGateEscaped()).toBe(false);
    });
    it('vrai après setGateEscaped (pour la session)', () => {
        setGateEscaped();
        expect(isGateEscaped()).toBe(true);
    });
});
