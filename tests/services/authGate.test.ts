import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    isGateEnabled,
    isGateEscaped,
    setGateEscaped,
    gateRequiresLogin,
    isGateAuthedThisSession,
    setGateAuthedThisSession,
    clearGateAuthedThisSession,
} from '../../services/sync/authGate';

beforeEach(() => {
    // Déterministe : on neutralise un éventuel .env.local (sinon VITE_GOOGLE_* fausse les défauts
    // des arguments → les cas `undefined` liraient l'env au lieu de « absent »).
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
    vi.stubEnv('VITE_GOOGLE_GATE', '');
    try {
        sessionStorage.clear();
    } catch {
        /* sessionStorage indispo en CI : les tests de trappe se contentent du défaut */
    }
});
afterEach(() => {
    vi.unstubAllEnvs();
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

describe('flag « déjà connecté cette session » (anti 2e login après reload)', () => {
    it('faux par défaut', () => {
        expect(isGateAuthedThisSession()).toBe(false);
    });
    it('vrai après setGateAuthedThisSession (survit au reload de restauration)', () => {
        setGateAuthedThisSession();
        expect(isGateAuthedThisSession()).toBe(true);
    });
    it('re-faux après clearGateAuthedThisSession (déconnexion → on re-demande le login)', () => {
        setGateAuthedThisSession();
        clearGateAuthedThisSession();
        expect(isGateAuthedThisSession()).toBe(false);
    });
});
