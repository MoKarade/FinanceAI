import { describe, it, expect, beforeEach } from 'vitest';
import { useFinanceStore } from '../../store/useFinanceStore';
import { Tab } from '../../types';

describe('useFinanceStore', () => {
    beforeEach(() => {
        // Reset state entre tests (localStorage est partagé en jsdom).
        useFinanceStore.getState().resetState();
        localStorage.clear();
    });

    it('expose un activeTab initial = DASHBOARD', () => {
        const { activeTab } = useFinanceStore.getState();
        expect(activeTab).toBe(Tab.DASHBOARD);
    });

    it('setActiveTab change l\'onglet courant', () => {
        useFinanceStore.getState().setActiveTab(Tab.INVESTMENTS);
        expect(useFinanceStore.getState().activeTab).toBe(Tab.INVESTMENTS);
    });

    it('setAppState merge sans écraser les champs non touchés', () => {
        const prev = useFinanceStore.getState();
        useFinanceStore.getState().setAppState({ lastUpdate: 12345 });
        const next = useFinanceStore.getState();
        expect(next.lastUpdate).toBe(12345);
        // config, assets, etc. doivent rester (merge superficiel).
        expect(next.config).toEqual(prev.config);
        expect(next.assets).toEqual(prev.assets);
    });

    it('updateApiKeys merge clé par clé sans écraser les autres', () => {
        useFinanceStore.getState().updateApiKeys({ anthropic: 'key1', eraContext: '' });
        useFinanceStore.getState().updateApiKeys({ anthropic: 'key1', eraContext: 'token2' });
        const { apiKeys } = useFinanceStore.getState();
        expect(apiKeys.anthropic).toBe('key1');
        expect(apiKeys.eraContext).toBe('token2');
    });

    it('persiste le state mais EXCLUT apiKeys du localStorage (audit 2026-05)', () => {
        useFinanceStore.getState().updateApiKeys({ anthropic: 'SECRET123', eraContext: 'TOKEN456' });
        // Force trigger persist (Zustand persiste sur set)
        useFinanceStore.getState().setActiveTab(Tab.SETTINGS);
        const raw = localStorage.getItem('financeai-storage');
        expect(raw).toBeTruthy();
        // Les clés ne doivent JAMAIS être persistées en clair.
        expect(raw).not.toContain('SECRET123');
        expect(raw).not.toContain('TOKEN456');
        expect(raw).not.toContain('apiKeys');
    });

    it('a une version persist = 6 (Phase E.8 — DCA multi-achat purchases[])', () => {
        useFinanceStore.getState().setActiveTab(Tab.SETTINGS);
        const raw = localStorage.getItem('financeai-storage');
        if (!raw) throw new Error('Persist did not write');
        const parsed = JSON.parse(raw);
        expect(parsed.version).toBe(6);
    });

    it('retirementGoal.lifeExpectancy peut être mis à jour via setAppState (Phase C.3)', () => {
        const store = useFinanceStore.getState();
        const goal = store.retirementGoal;
        store.setAppState({ retirementGoal: { ...goal, lifeExpectancy: 95 } });
        expect(useFinanceStore.getState().retirementGoal.lifeExpectancy).toBe(95);
    });
});
