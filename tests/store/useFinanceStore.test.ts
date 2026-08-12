import { describe, it, expect, beforeEach } from 'vitest';
import { useFinanceStore, personaResetBase } from '../../store/useFinanceStore';
import { shouldPush } from '../../services/sync/syncEngine';
import { DEFAULT_FX_RATES } from '../../constants';
import { Tab } from '../../types';

describe('useFinanceStore', () => {
    beforeEach(() => {
        // Reset state entre tests (localStorage est partagé en jsdom).
        useFinanceStore.getState().resetState();
        localStorage.clear();
    });

    it('expose un activeTab initial = FUTURE (la courbe est la page d\'ouverture)', () => {
        // [REFONTE-NAV Lot 1] L'Accueil est retiré : l'app s'ouvre sur la courbe Future.
        const { activeTab } = useFinanceStore.getState();
        expect(activeTab).toBe(Tab.FUTURE);
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

    it('a une version persist = 7 (persistance du mode test = additive, pas de bump)', () => {
        useFinanceStore.getState().setActiveTab(Tab.SETTINGS);
        const raw = localStorage.getItem('financeai-storage');
        if (!raw) throw new Error('Persist did not write');
        const parsed = JSON.parse(raw);
        expect(parsed.version).toBe(7);
    });

    it('PERSISTE le mode test (bannière + persona survivent au reload)', () => {
        // enableTestMode pose isTestMode/realDataSnapshot/activeTestPersonaId — désormais persistés
        // pour que la bannière reste cohérente après un rechargement.
        useFinanceStore.getState().enableTestMode({ transactions: [] }, 'persona-x');
        useFinanceStore.getState().setActiveTab(Tab.SETTINGS); // déclenche une écriture persist
        const raw = localStorage.getItem('financeai-storage');
        if (!raw) throw new Error('Persist did not write');
        const parsed = JSON.parse(raw);
        expect(parsed.state.isTestMode).toBe(true);
        expect(parsed.state.activeTestPersonaId).toBe('persona-x');
        expect(parsed.state.realDataSnapshot).not.toBeUndefined();
    });

    it('mode test persisté : le push Drive reste DÉSACTIVÉ (invariant de sécurité, aucune donnée fictive en ligne)', () => {
        // Même persisté localement, le mode test ne doit JAMAIS pousser sur Drive (bug 2026-05-29).
        expect(shouldPush(false, true)).toBe(false);   // local non vide + mode test → pas de push
        expect(shouldPush(false, false)).toBe(true);   // hors mode test → push normal
    });

    it('le snapshot des vraies données (désormais persisté) ne contient JAMAIS les clés API', () => {
        useFinanceStore.getState().updateApiKeys({ anthropic: 'SECRET_KEY', finnhub: 'FH' });
        useFinanceStore.getState().enableTestMode({ transactions: [] }, 'p');
        const snap = useFinanceStore.getState().realDataSnapshot as Record<string, unknown> | null;
        expect(snap).not.toBeNull();
        expect(JSON.stringify(snap)).not.toContain('SECRET_KEY');
        // Et le blob persisté (qui inclut maintenant realDataSnapshot) n'expose pas la clé.
        useFinanceStore.getState().setActiveTab(Tab.SETTINGS);
        expect(localStorage.getItem('financeai-storage')).not.toContain('SECRET_KEY');
    });

    it('switch de persona : remplace TOUTES les données, aucune fuite de l\'ancien persona', () => {
        const store = () => useFinanceStore.getState();
        // Persona A : définit transactions + childGoals + lifeEvents.
        store().enableTestMode({
            transactions: [{ id: 'a1' } as never],
            childGoals: [{ id: 'cgA' } as never],
            lifeEvents: [{ id: 'leA' } as never],
        }, 'A');
        expect(store().lifeEvents).toEqual([{ id: 'leA' }]);
        // Persona B : ne définit QUE transactions (ni childGoals ni lifeEvents).
        store().enableTestMode({ transactions: [{ id: 'b1' } as never] }, 'B');
        expect(store().transactions).toEqual([{ id: 'b1' }]);
        expect(store().lifeEvents).toEqual([]);                       // fuite de A éliminée (retour défaut)
        expect(store().childGoals).not.toContainEqual({ id: 'cgA' }); // plus le childGoal de A
        expect(store().activeTestPersonaId).toBe('B');
        expect(store().isTestMode).toBe(true);
    });

    it('disableTestMode restaure les vraies données (round-trip)', () => {
        const store = () => useFinanceStore.getState();
        store().setAppState({ transactions: [{ id: 'real1' } as never] });
        store().enableTestMode({ transactions: [{ id: 'fake1' } as never] }, 'A');
        expect(store().transactions).toEqual([{ id: 'fake1' }]);
        store().disableTestMode();
        expect(store().isTestMode).toBe(false);
        expect(store().transactions).toEqual([{ id: 'real1' }]);      // vraies données revenues
        expect(store().realDataSnapshot).toBeNull();
    });

    it('[B4-CHAT-COST, finding panel #489] le coût API dépensé PENDANT la démo est ADDITIONNÉ au cumul réel à la sortie (jamais jeté)', () => {
        // Le chat en mode démo fait de VRAIS appels facturés (vraie clé) — la restauration verbatim
        // du snapshot jetait cette dépense en silence (prouvé par sonde : 5 → 0 → +2 → retour à 5).
        const store = () => useFinanceStore.getState();
        store().setAppState({ aiChatCostUsdTotal: 5 });
        store().enableTestMode({ transactions: [] }, 'A');
        expect(store().aiChatCostUsdTotal).toBe(0);                   // la démo repart de 0 (pas de fuite du vrai total)
        store().setAppState({ aiChatCostUsdTotal: 2 });               // dépense réelle pendant la démo
        store().disableTestMode();
        expect(store().aiChatCostUsdTotal).toBe(7);                   // 5 (réel) + 2 (démo) — rien de perdu
    });

    it('retirementGoal.lifeExpectancy peut être mis à jour via setAppState (Phase C.3)', () => {
        const store = useFinanceStore.getState();
        const goal = store.retirementGoal;
        store.setAppState({ retirementGoal: { ...goal, lifeExpectancy: 95 } });
        expect(useFinanceStore.getState().retirementGoal.lifeExpectancy).toBe(95);
    });

    it('resetState EN mode test SORT du mode test (bug latent : bannière figée)', () => {
        const store = () => useFinanceStore.getState();
        // On entre en mode test (flags posés + snapshot non nul), PUIS on reset depuis ce mode.
        store().enableTestMode({ transactions: [{ id: 'fake' } as never] }, 'persona-z');
        expect(store().isTestMode).toBe(true);
        expect(store().realDataSnapshot).not.toBeNull();
        // resetState doit ramener à un état NEUF, mode test OFF — sinon on resterait coincé en test.
        store().resetState();
        expect(store().isTestMode).toBe(false);
        expect(store().realDataSnapshot).toBeNull();
        expect(store().activeTestPersonaId).toBeNull();
        // Et les données reviennent au défaut propre (pas les fixtures du persona).
        expect(store().transactions).toEqual([]);
    });

    it('triple switch A→B→C : aucune fuite cumulative, seul le dernier persona subsiste', () => {
        const store = () => useFinanceStore.getState();
        // A pose 3 tranches distinctes.
        store().enableTestMode({
            transactions: [{ id: 'a-tx' } as never],
            debts: [{ id: 'a-debt' } as never],
            savingsGoals: [{ id: 'a-sg' } as never],
        }, 'A');
        // B pose UNE autre tranche encore (travelGoals) sans réutiliser celles de A.
        store().enableTestMode({
            travelGoals: [{ id: 'b-travel' } as never],
        }, 'B');
        // C ne pose QUE transactions.
        store().enableTestMode({ transactions: [{ id: 'c-tx' } as never] }, 'C');

        // Seules les tranches de C subsistent ; tout A et B est retombé au défaut.
        expect(store().transactions).toEqual([{ id: 'c-tx' }]);
        expect(store().debts).toEqual([]);          // tranche de A : nettoyée
        expect(store().savingsGoals).toEqual([]);   // tranche de A : nettoyée
        expect(store().travelGoals).toEqual([]);    // tranche de B : nettoyée
        expect(store().activeTestPersonaId).toBe('C');
        expect(store().isTestMode).toBe(true);
    });

    it('triple switch A→B→C puis disable : le snapshot INITIAL des vraies données est conservé', () => {
        const store = () => useFinanceStore.getState();
        // Vraies données avant tout passage en test.
        store().setAppState({ transactions: [{ id: 'REAL' } as never], debts: [{ id: 'REAL-debt' } as never] });
        store().enableTestMode({ transactions: [{ id: 'a' } as never] }, 'A');
        store().enableTestMode({ transactions: [{ id: 'b' } as never] }, 'B');
        store().enableTestMode({ transactions: [{ id: 'c' } as never] }, 'C');
        // Le snapshot ne doit pas avoir été écrasé par les données fictives de A/B/C.
        store().disableTestMode();
        expect(store().isTestMode).toBe(false);
        expect(store().transactions).toEqual([{ id: 'REAL' }]);
        expect(store().debts).toEqual([{ id: 'REAL-debt' }]);
    });

    it('enableTestMode PRÉSERVE les clés API à travers un switch de persona (credentials intacts)', () => {
        const store = () => useFinanceStore.getState();
        store().updateApiKeys({ anthropic: 'ANTHRO_KEY', finnhub: 'FH_KEY' });
        // 1re activation : les clés survivent.
        store().enableTestMode({ transactions: [{ id: 'a' } as never] }, 'A');
        expect(store().apiKeys).toEqual({ anthropic: 'ANTHRO_KEY', finnhub: 'FH_KEY' });
        // Switch de persona : un persona peut tenter de poser ses propres apiKeys vides — ignorés.
        store().enableTestMode({ transactions: [{ id: 'b' } as never], apiKeys: { anthropic: '', finnhub: '' } } as never, 'B');
        expect(store().apiKeys).toEqual({ anthropic: 'ANTHRO_KEY', finnhub: 'FH_KEY' });
        // Et au retour hors test, les clés réelles sont toujours là.
        store().disableTestMode();
        expect(store().apiKeys).toEqual({ anthropic: 'ANTHRO_KEY', finnhub: 'FH_KEY' });
    });

    it('personaResetBase NE réinitialise PAS fxRates / lastUpdate / apiKeys (omission volontaire)', () => {
        const base = personaResetBase() as Record<string, unknown>;
        // Ces 3 clés sont volontairement absentes → le spread `...prev` les conserve au load persona.
        expect(base).not.toHaveProperty('fxRates');
        expect(base).not.toHaveProperty('lastUpdate');
        expect(base).not.toHaveProperty('apiKeys');
        // Mais les tranches de DONNÉES sont bien présentes et remises à vide.
        expect(base.transactions).toEqual([]);
        expect(base.lifeEvents).toEqual([]);
        expect(base.debts).toEqual([]);
    });

    it('enableTestMode CONSERVE fxRates personnalisés (données de marché, pas des données persona)', () => {
        const store = () => useFinanceStore.getState();
        // L'utilisateur a un taux USD custom (≠ défaut) + un lastFetched daté.
        store().updateFxRates({ USD: 1.55, EUR: 1.60, CAD: 1.00, lastFetched: 1700000000 });
        expect(store().fxRates.USD).toBe(1.55);
        // Charger un persona ne doit PAS écraser les taux ni revenir au défaut.
        store().enableTestMode({ transactions: [{ id: 'a' } as never] }, 'A');
        expect(store().fxRates.USD).toBe(1.55);
        expect(store().fxRates.lastFetched).toBe(1700000000);
        expect(store().fxRates.USD).not.toBe(DEFAULT_FX_RATES.USD);
    });

    it('partialize EXCLUT les états UI transitoires du blob persisté (activeTab/isPrivacyMode/lastProjection/pendingFocus)', () => {
        const store = () => useFinanceStore.getState();
        // On pose des valeurs distinctes sur les 4 champs transitoires.
        store().setPrivacyMode(true);
        store().setLastProjection({ chartData: [{ marker: 'LEAK_PROJECTION' }] } as never);
        store().navigateWithFocus(Tab.SETTINGS, 'LEAK_SECTION'); // pose activeTab + pendingFocus, déclenche le persist
        const raw = localStorage.getItem('financeai-storage');
        if (!raw) throw new Error('Persist did not write');
        const parsed = JSON.parse(raw);
        // Ces 4 clés ne doivent JAMAIS atterrir dans le state persisté (cf partialize).
        // En particulier lastProjection : le persister fausserait la "source unique" au reload.
        expect(parsed.state).not.toHaveProperty('activeTab');
        expect(parsed.state).not.toHaveProperty('isPrivacyMode');
        expect(parsed.state).not.toHaveProperty('lastProjection');
        expect(parsed.state).not.toHaveProperty('pendingFocus');
        // Garde-fou complémentaire : leurs marqueurs sérialisés sont absents du blob.
        expect(raw).not.toContain('LEAK_PROJECTION');
        expect(raw).not.toContain('LEAK_SECTION');
        // Sanity : une tranche de DONNÉES, elle, est bien persistée.
        expect(parsed.state).toHaveProperty('transactions');
    });

    it('disableTestMode avec realDataSnapshot null : sort du mode test + repart d\'une base PROPRE (jamais de données fictives passées pour réelles)', () => {
        const store = () => useFinanceStore.getState();
        // État incohérent (blob corrompu / édité) : en mode test mais snapshot des vraies données perdu.
        // Les données VIVANTES sont alors les fixtures fictives du persona.
        store().setAppState({ transactions: [{ id: 'fake' } as never] });
        useFinanceStore.setState({ isTestMode: true, realDataSnapshot: null, activeTestPersonaId: 'orphan' });
        store().disableTestMode();
        // Branche défensive `if (!snap)` : le flag retombe ET on remet une base vide — on ne laisse PAS
        // les données fictives passer pour réelles (sinon, le flag retombé, le push Drive les enverrait).
        expect(store().isTestMode).toBe(false);
        expect(store().realDataSnapshot).toBeNull();
        expect(store().activeTestPersonaId).toBeNull();
        expect(store().transactions).toEqual([]); // base propre, PAS les données fictives orphelines
    });

    it('disableTestMode hors mode test : no-op idempotent (n\'écrase pas les vraies données)', () => {
        const store = () => useFinanceStore.getState();
        store().setAppState({ transactions: [{ id: 'real-only' } as never] });
        const before = store().transactions;
        // Early-return `if (!prev.isTestMode) return prev` : aucun effet de bord.
        store().disableTestMode();
        expect(store().isTestMode).toBe(false);
        expect(store().transactions).toBe(before); // référence inchangée → vraiment un no-op
        // Idempotent : un 2e appel ne change toujours rien.
        store().disableTestMode();
        expect(store().transactions).toEqual([{ id: 'real-only' }]);
        expect(store().realDataSnapshot).toBeNull();
    });
});
