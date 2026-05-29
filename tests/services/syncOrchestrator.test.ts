import { describe, it, expect } from 'vitest';
import { stripApiKeys, computeIsEmpty } from '../../services/sync/syncOrchestrator';

describe('stripApiKeys', () => {
    it('retire state.apiKeys si présent (ceinture + bretelles)', () => {
        const snap = { state: { apiKeys: { anthropic: 'sk-secret' }, transactions: [{ id: 't' }] }, version: 6 };
        const out = stripApiKeys(snap) as { state: Record<string, unknown>; version: number };
        expect(out.state.apiKeys).toBeUndefined();
        expect(out.state.transactions).toEqual([{ id: 't' }]);
        expect(out.version).toBe(6);
    });

    it('inoffensif si pas d apiKeys (cas normal : déjà exclu par le partialize)', () => {
        const snap = { state: { transactions: [] }, version: 6 };
        expect(stripApiKeys(snap)).toEqual(snap);
    });

    it('gère null / non-objet sans planter', () => {
        expect(stripApiKeys(null)).toBeNull();
        expect(stripApiKeys('x')).toBe('x');
    });
});

describe('computeIsEmpty', () => {
    it('vide si null / pas de state', () => {
        expect(computeIsEmpty(null)).toBe(true);
        expect(computeIsEmpty({})).toBe(true);
        expect(computeIsEmpty({ state: {} })).toBe(true);
    });

    it('vide si ni transactions ni actifs', () => {
        expect(computeIsEmpty({ state: { transactions: [], assets: [] } })).toBe(true);
    });

    it('non-vide dès qu il y a des transactions', () => {
        expect(computeIsEmpty({ state: { transactions: [{ id: 't' }], assets: [] } })).toBe(false);
    });

    it('non-vide dès qu il y a des actifs', () => {
        expect(computeIsEmpty({ state: { transactions: [], assets: [{ id: 'a' }] } })).toBe(false);
    });
});
