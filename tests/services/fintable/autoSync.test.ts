/**
 * @vitest-environment jsdom
 *
 * [FINTABLE-7 Lot 3] Sync bancaire AUTO à l'ouverture, throttlée 1×/jour.
 *
 * Ce qui est verrouillé : (a) les GARDES — pas de jeton / mode test / passe réussie < 24 h /
 * cooldown de tentative 1 h / mutex ; (b) une passe ÉCHOUÉE ne gèle PAS 24 h (le cooldown 1 h
 * borne les retries) ; (c) échec → SEUL le rapport est écrit (jamais de contenu à moitié) ;
 * (d) succès → patch par delta de référence (le champ modifié atteint le store).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    maybeRunDailyFintableSync,
    isDailySyncDue,
    acquireFintableSyncLock,
    releaseFintableSyncLock,
    withCrossTabLock,
    _resetAutoSyncForTests,
} from '../../../services/fintable/autoSync';
import { useFinanceStore } from '../../../store/useFinanceStore';
import type { FintableSyncReport } from '../../../types';

const runMock = vi.fn();
vi.mock('../../../services/fintable/browserSync', () => ({
    runFintableBrowserSync: (...a: unknown[]) => runMock(...a),
}));

const mkReport = (over: Partial<FintableSyncReport> = {}): FintableSyncReport => ({
    at: Date.now(), cutoverDateUsed: null, accountsSeen: 1, accountsWithoutRole: 0,
    transactionsAdded: 0, transfersDetected: 0, cashUpdated: false, debtsUpdated: [],
    investmentReferenceCount: 0, warnings: [], error: null,
    ...over,
});

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    _resetAutoSyncForTests();
    useFinanceStore.getState().resetState();
    useFinanceStore.setState({
        apiKeys: { anthropic: '', finnhub: '', fintable: 'ft_test' },
        isTestMode: false,
        fintableSyncReport: undefined,
    });
});

describe('isDailySyncDue', () => {
    const now = Date.now();
    it('dû sans aucun rapport (jamais synchronisé)', () => {
        expect(isDailySyncDue(undefined, now)).toBe(true);
    });
    it('PAS dû après une passe réussie il y a 2 h', () => {
        expect(isDailySyncDue(mkReport({ at: now - 2 * 3600_000 }), now)).toBe(false);
    });
    it('dû après une passe réussie il y a 25 h', () => {
        expect(isDailySyncDue(mkReport({ at: now - 25 * 3600_000 }), now)).toBe(true);
    });
    it('un ÉCHEC récent ne gèle pas 24 h (c\'est le cooldown de tentative qui borne)', () => {
        expect(isDailySyncDue(mkReport({ at: now - 2 * 3600_000, error: 'panne' }), now)).toBe(true);
    });
});

describe('maybeRunDailyFintableSync — gardes', () => {
    it('sans jeton : ne court pas', async () => {
        useFinanceStore.setState({ apiKeys: { anthropic: '', finnhub: '', fintable: '' } });
        const out = await maybeRunDailyFintableSync();
        expect(out).toEqual({ ran: false, reason: 'no-token' });
        expect(runMock).not.toHaveBeenCalled();
    });

    it('en MODE TEST : ne court JAMAIS (données réelles ↮ persona)', async () => {
        useFinanceStore.setState({ isTestMode: true });
        const out = await maybeRunDailyFintableSync();
        expect(out).toEqual({ ran: false, reason: 'test-mode' });
        expect(runMock).not.toHaveBeenCalled();
    });

    it('passe réussie < 24 h : ne re-court pas (1×/jour)', async () => {
        useFinanceStore.setState({ fintableSyncReport: mkReport({ at: Date.now() - 3600_000 }) });
        const out = await maybeRunDailyFintableSync();
        expect(out).toEqual({ ran: false, reason: 'fresh' });
    });

    it('deux déclenchements rapprochés : le 2e est bloqué par le COOLDOWN de tentative', async () => {
        runMock.mockResolvedValue({ report: mkReport({ error: 'panne réseau' }), statePatch: null });
        await maybeRunDailyFintableSync();
        expect(runMock).toHaveBeenCalledTimes(1);
        // La 1re tentative a échoué (statePatch null) → « dû » encore, mais le cooldown 1 h bloque
        // le F5 anti-boucle. (Sans lui, chaque reload pendant une panne re-taperait Fintable.)
        const out = await maybeRunDailyFintableSync();
        expect(out).toEqual({ ran: false, reason: 'cooldown' });
        expect(runMock).toHaveBeenCalledTimes(1);
    });
});

describe('maybeRunDailyFintableSync — « ne lève jamais » tenu même sur un throw', () => {
    it('[finding silent-failure #545] un throw du chargement/run → outcome { reason: "error" }, pas de rejection', async () => {
        runMock.mockRejectedValue(new Error('chunk périmé'));
        // Sans le catch, cette promesse REJETTERAIT (unhandledrejection dans l'effet App).
        const out = await maybeRunDailyFintableSync();
        expect(out).toEqual({ ran: false, reason: 'error' });
    });

    it('[finding code-reviewer #545 §2] le throw écrit quand même un RAPPORT d\'échec (diagnostics jamais muets)', async () => {
        runMock.mockRejectedValue(new Error('chunk périmé'));
        await maybeRunDailyFintableSync();
        const report = useFinanceStore.getState().fintableSyncReport;
        expect(report?.error).toContain('chunk périmé');
    });
});

describe('maybeRunDailyFintableSync — verrou partagé auto ↔ manuel', () => {
    it('[finding code-reviewer #545 CRITIQUE] une passe MANUELLE en vol (verrou pris) bloque l\'auto', async () => {
        // La carte Réglages acquiert CE verrou avant runFintableBrowserSync — sans exclusion
        // mutuelle, deux passes concurrentes sur des bases figées = dernier-écrivain-gagne.
        expect(acquireFintableSyncLock()).toBe(true);
        try {
            const out = await maybeRunDailyFintableSync();
            expect(out).toEqual({ ran: false, reason: 'in-flight' });
            expect(runMock).not.toHaveBeenCalled();
        } finally {
            releaseFintableSyncLock();
        }
        expect(acquireFintableSyncLock()).toBe(true); // relâché → reprenable
        releaseFintableSyncLock();
    });
});

describe('withCrossTabLock — générique (lot 27, partagé auto ↔ manuel ENTRE onglets)', () => {
    // [FINTABLE-SYNC-XTAB-MANUEL] Généricisé pour que la carte de sync MANUELLE partage le même
    // verrou Web Locks que la passe auto (`XTAB_LOCK_NAME` identique) — la sonde ici mocke
    // `navigator.locks` directement, seule façon d'exercer le chemin Web Locks : jsdom ne l'expose
    // pas, donc toutes les AUTRES passes de ce fichier empruntent déjà le repli sans verrou.
    const original = (navigator as unknown as { locks?: unknown }).locks;
    afterEach(() => {
        const nav = navigator as unknown as { locks?: unknown };
        if (original === undefined) delete nav.locks; else nav.locks = original;
    });

    it('verrou disponible : exécute run() et rend sa valeur, jamais onBusy()', async () => {
        (navigator as unknown as { locks: unknown }).locks = {
            request: async (_name: string, _opts: unknown, cb: () => Promise<unknown>) => cb(),
        };
        const run = vi.fn().mockResolvedValue('ok');
        const onBusy = vi.fn();
        const out = await withCrossTabLock(run, onBusy);
        expect(out).toBe('ok');
        expect(run).toHaveBeenCalledTimes(1);
        expect(onBusy).not.toHaveBeenCalled();
    });

    it('verrou pris par un AUTRE onglet (`request` rend null SANS appeler le rappel) : onBusy(), jamais run()', async () => {
        (navigator as unknown as { locks: unknown }).locks = { request: async () => null };
        const run = vi.fn().mockResolvedValue('ok');
        const onBusy = vi.fn().mockReturnValue('busy');
        const out = await withCrossTabLock(run, onBusy);
        expect(out).toBe('busy');
        expect(run).not.toHaveBeenCalled();
        expect(onBusy).toHaveBeenCalledTimes(1);
    });

    it('API Web Locks absente : repli, exécute run() directement', async () => {
        delete (navigator as unknown as { locks?: unknown }).locks;
        const run = vi.fn().mockResolvedValue('ok');
        const onBusy = vi.fn();
        const out = await withCrossTabLock(run, onBusy);
        expect(out).toBe('ok');
        expect(run).toHaveBeenCalledTimes(1);
        expect(onBusy).not.toHaveBeenCalled();
    });
});

describe('maybeRunDailyFintableSync — TOCTOU mode démo (finding security-privacy #545, prouvé par sonde)', () => {
    it('basculer en mode DÉMO pendant le fetch → RIEN n\'est écrit (ni contenu, ni rapport)', async () => {
        const personaTx = { id: -7, date: '2026-07-01', payee: 'persona', amount: -1, category: 'Autre', status: 'processed' as const };
        useFinanceStore.setState({ transactions: [personaTx] as never });
        const report = mkReport({ transactionsAdded: 1 });
        runMock.mockImplementation(async (current: { transactions: unknown[] }) => {
            // Simule la bascule en démo PENDANT l'attente réseau (le scénario mesuré par l'agent).
            useFinanceStore.setState({ isTestMode: true });
            return {
                report,
                statePatch: {
                    transactions: [...current.transactions, { id: 42, payee: 'REAL-TXN', amount: -99, date: '2026-07-30', category: 'Autre', status: 'processed' }],
                    fintableSyncReport: report,
                },
            };
        });

        const out = await maybeRunDailyFintableSync();

        expect(out).toEqual({ ran: false, reason: 'test-mode' });
        // Les VRAIES données n'ont PAS contaminé la session de démonstration.
        expect(useFinanceStore.getState().transactions.some((t) => t.id === 42)).toBe(false);
        expect(useFinanceStore.getState().fintableSyncReport).toBeUndefined();
    });
});

describe('maybeRunDailyFintableSync — application', () => {
    it('échec : SEUL le rapport est écrit (aucun contenu à moitié)', async () => {
        const failed = mkReport({ error: 'jeton refusé' });
        runMock.mockResolvedValue({ report: failed, statePatch: null });
        const before = useFinanceStore.getState().transactions;

        const out = await maybeRunDailyFintableSync();

        expect(out).toEqual({ ran: true, report: failed });
        expect(useFinanceStore.getState().fintableSyncReport).toEqual(failed);
        expect(useFinanceStore.getState().transactions).toBe(before); // référence intacte
    });

    it('succès : le delta de référence atteint le store (champ modifié écrit, le reste intact)', async () => {
        const report = mkReport({ transactionsAdded: 3 });
        runMock.mockImplementation(async (current: { transactions: unknown[] }) => ({
            report,
            // [FINTABLE-SYNC-STALE-BASE] La passe rend désormais un PATCH déjà réduit (le delta par
            // référence est calculé dans `browserSync`, contre la base réelle de l'application) —
            // l'appelant l'écrit tel quel, sans avoir à choisir une base.
            statePatch: {
                transactions: [...current.transactions, { id: 99, date: '2026-07-30', payee: 'X', amount: -5, category: 'Autre', status: 'processed' }],
                fintableSyncReport: report,
            },
        }));

        const out = await maybeRunDailyFintableSync();

        expect(out.ran).toBe(true);
        expect(useFinanceStore.getState().transactions.some((t) => t.id === 99)).toBe(true);
        expect(useFinanceStore.getState().fintableSyncReport).toEqual(report);
    });
});
