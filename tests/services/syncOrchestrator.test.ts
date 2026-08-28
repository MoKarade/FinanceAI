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

describe('computeIsEmpty — profil / données de planification (fix 2026-05-29)', () => {
    it('VIDE si état par défaut frais (users sans nom ni salaire, tableaux vides)', () => {
        const fresh = { state: { transactions: [], assets: [], config: { users: [{ name: '', netSalary: 0, grossSalary: 0 }] } } };
        expect(computeIsEmpty(fresh)).toBe(true);
    });
    it('NON-vide si un utilisateur a un nom (profil renseigné, sans transactions ni actifs)', () => {
        const s = { state: { transactions: [], assets: [], config: { users: [{ name: 'Marc', netSalary: 0, grossSalary: 0 }] } } };
        expect(computeIsEmpty(s)).toBe(false);
    });
    it('NON-vide si un utilisateur a un salaire', () => {
        expect(computeIsEmpty({ state: { config: { users: [{ name: '', netSalary: 4000 }] } } })).toBe(false);
        expect(computeIsEmpty({ state: { config: { users: [{ name: '', grossSalary: 5400 }] } } })).toBe(false);
    });
    it('NON-vide dès qu un tableau de données a un élément (dettes, voyages…)', () => {
        expect(computeIsEmpty({ state: { debts: [{ id: 'd' }] } })).toBe(false);
        expect(computeIsEmpty({ state: { travelGoals: [{ id: 'g' }] } })).toBe(false);
    });
    it('VIDE si seuls des tableaux à 1 entrée PAR DÉFAUT sont présents (realEstateGoals/childGoals)', () => {
        // Ces tableaux contiennent une entrée par défaut → ne doivent PAS compter comme « non-vide ».
        const s = {
            state: {
                transactions: [], assets: [],
                realEstateGoals: [{ id: 'main_property', isActive: false, price: 0 }],
                childGoals: [{ id: 'child_1', isActive: false }],
                config: { users: [{ name: '', netSalary: 0, grossSalary: 0 }] },
            },
        };
        expect(computeIsEmpty(s)).toBe(true);
    });
});
