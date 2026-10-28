/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { quotaStorage, QUOTA_EXCEEDED_EVENT } from '../../services/quotaStorage';

beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('quotaStorage - comportement normal', () => {
    it('setItem stocke la valeur et getItem la retourne', () => {
        quotaStorage.setItem('foo', 'bar');
        expect(quotaStorage.getItem('foo')).toBe('bar');
    });

    it('removeItem supprime la valeur', () => {
        quotaStorage.setItem('foo', 'bar');
        quotaStorage.removeItem('foo');
        expect(quotaStorage.getItem('foo')).toBeNull();
    });

    it('clear vide tout le storage', () => {
        quotaStorage.setItem('a', '1');
        quotaStorage.setItem('b', '2');
        quotaStorage.clear();
        expect(quotaStorage.length).toBe(0);
    });

    it('length reflete le nombre de cles', () => {
        expect(quotaStorage.length).toBe(0);
        quotaStorage.setItem('k1', 'v1');
        expect(quotaStorage.length).toBe(1);
    });

    it('key retourne la cle a l index donne', () => {
        quotaStorage.setItem('only', 'val');
        expect(quotaStorage.key(0)).toBe('only');
    });

    it('getItem retourne null pour cle inexistante', () => {
        expect(quotaStorage.getItem('inexistant')).toBeNull();
    });
});

describe('quotaStorage - QuotaExceededError', () => {
    it('emet QUOTA_EXCEEDED_EVENT sur window quand setItem leve QuotaExceededError', () => {
        const quotaError = new DOMException('Quota exceeded', 'QuotaExceededError');
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw quotaError;
        });

        const listener = vi.fn();
        window.addEventListener(QUOTA_EXCEEDED_EVENT, listener);

        expect(() => quotaStorage.setItem('test', 'value')).toThrow(quotaError);
        expect(listener).toHaveBeenCalledOnce();

        window.removeEventListener(QUOTA_EXCEEDED_EVENT, listener);
    });

    it('relance l erreur apres emission de l evenement', () => {
        const quotaError = new DOMException('Full', 'QuotaExceededError');
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw quotaError;
        });

        expect(() => quotaStorage.setItem('key', 'val')).toThrow(DOMException);
    });

    it('n emet PAS l evenement pour une erreur non-quota', () => {
        const genericError = new Error('Erreur inattendue');
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw genericError;
        });

        const listener = vi.fn();
        window.addEventListener(QUOTA_EXCEEDED_EVENT, listener);

        expect(() => quotaStorage.setItem('test', 'value')).toThrow(genericError);
        expect(listener).not.toHaveBeenCalled();

        window.removeEventListener(QUOTA_EXCEEDED_EVENT, listener);
    });

    it('un write qui reussit ne declenche aucun evenement', () => {
        const listener = vi.fn();
        window.addEventListener(QUOTA_EXCEEDED_EVENT, listener);

        quotaStorage.setItem('safe', 'write');

        expect(listener).not.toHaveBeenCalled();
        window.removeEventListener(QUOTA_EXCEEDED_EVENT, listener);
    });

    it('gere NS_ERROR_DOM_QUOTA_REACHED (Firefox legacy)', () => {
        const legacyError = new DOMException('NS_ERROR_DOM_QUOTA_REACHED', 'NS_ERROR_DOM_QUOTA_REACHED');
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw legacyError;
        });

        const listener = vi.fn();
        window.addEventListener(QUOTA_EXCEEDED_EVENT, listener);

        expect(() => quotaStorage.setItem('key', 'val')).toThrow();
        expect(listener).toHaveBeenCalledOnce();

        window.removeEventListener(QUOTA_EXCEEDED_EVENT, listener);
    });
});
