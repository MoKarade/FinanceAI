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
        useFinanceStore.getState().updateApiKeys({ anthropic: 'key1', finnhub: '' });
        useFinanceStore.getState().updateApiKeys({ anthropic: 'key2' });
        const { apiKeys } = useFinanceStore.getState();
        expect(apiKeys.anthropic).toBe('key2');
        expect(apiKeys.finnhub).toBe('');
    });

    it('persiste le state mais EXCLUT apiKeys du localStorage (audit 2026-05)', () => {
        useFinanceStore.getState().updateApiKeys({ anthropic: 'SECRET123', finnhub: 'FINNHUB456' });
        // Force trigger persist (Zustand persiste sur set)
        useFinanceStore.getState().setActiveTab(Tab.SETTINGS);
        const raw = localStorage.getItem('financeai-storage');
        expect(raw).toBeTruthy();
        // Les clés ne doivent JAMAIS être persistées en clair.
        expect(raw).not.toContain('SECRET123');
        expect(raw).not.toContain('FINNHUB456');
        expect(raw).not.toContain('apiKeys');
    });

    it('a une version persist = 7 (v6→v7 — mode test jamais persisté)', () => {
        useFinanceStore.getState().setActiveTab(Tab.SETTINGS);
        const raw = localStorage.getItem('financeai-storage');
        if (!raw) throw new Error('Persist did not write');
        const parsed = JSON.parse(raw);
        expect(parsed.version).toBe(7);
    });

    it('NE persiste PAS le mode test (les fixtures persona ne doivent jamais aller dans localStorage/sync)', () => {
        // Active le mode test : enableTestMode pose isTestMode/realDataSnapshot/activeTestPersonaId.
        useFinanceStore.getState().enableTestMode({}, 'persona-x');
        // Déclenche une écriture persist.
        useFinanceStore.getState().setActiveTab(Tab.SETTINGS);
        const raw = localStorage.getItem('financeai-storage');
        if (!raw) throw new Error('Persist did not write');
        const parsed = JSON.parse(raw);
        expect(parsed.state.isTestMode).toBeUndefined();
        expect(parsed.state.realDataSnapshot).toBeUndefined();
        expect(parsed.state.activeTestPersonaId).toBeUndefined();
        // Ceinture + bretelles : aucune trace de la clé snapshot dans le blob brut.
        expect(raw).not.toContain('realDataSnapshot');
    });

    it('retirementGoal.lifeExpectancy peut être mis à jour via setAppState (Phase C.3)', () => {
        const store = useFinanceStore.getState();
        const goal = store.retirementGoal;
        store.setAppState({ retirementGoal: { ...goal, lifeExpectancy: 95 } });
        expect(useFinanceStore.getState().retirementGoal.lifeExpectancy).toBe(95);
    });
});
