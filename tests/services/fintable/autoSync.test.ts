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
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    maybeRunDailyFintableSync,
    isDailySyncDue,
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
        runMock.mockResolvedValue({ report: mkReport({ error: 'panne réseau' }), nextState: null });
        await maybeRunDailyFintableSync();
        expect(runMock).toHaveBeenCalledTimes(1);
        // La 1re tentative a échoué (nextState null) → « dû » encore, mais le cooldown 1 h bloque
        // le F5 anti-boucle. (Sans lui, chaque reload pendant une panne re-taperait Fintable.)
        const out = await maybeRunDailyFintableSync();
        expect(out).toEqual({ ran: false, reason: 'cooldown' });
        expect(runMock).toHaveBeenCalledTimes(1);
    });
});

describe('maybeRunDailyFintableSync — application', () => {
    it('échec : SEUL le rapport est écrit (aucun contenu à moitié)', async () => {
        const failed = mkReport({ error: 'jeton refusé' });
        runMock.mockResolvedValue({ report: failed, nextState: null });
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
            nextState: {
                ...(current as Record<string, unknown>),
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
