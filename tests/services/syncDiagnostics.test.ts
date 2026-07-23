// tests/services/syncDiagnostics.test.ts
//
// [HIST-MULTI-PROVIDER] Module d'état du rapport de sync des historiques (session, non persisté).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    setHistorySyncReport, clearHistorySyncReport, getHistorySyncReport, subscribeHistorySyncReport,
} from '../../services/history/syncDiagnostics';

beforeEach(() => clearHistorySyncReport());

describe('syncDiagnostics', () => {
    it('set → get rend le rapport ; les abonnés sont notifiés ; clear remet à null', () => {
        const listener = vi.fn();
        const unsub = subscribeHistorySyncReport(listener);
        const report = { at: 1, skipped: [{ symbol: 'CW8', reason: 'empty' as const }], patchedCount: 2 };
        setHistorySyncReport(report);
        expect(getHistorySyncReport()).toBe(report); // référence stable (useSyncExternalStore)
        expect(listener).toHaveBeenCalledTimes(1);
        clearHistorySyncReport();
        expect(getHistorySyncReport()).toBeNull();
        expect(listener).toHaveBeenCalledTimes(2);
        unsub();
        setHistorySyncReport(report);
        expect(listener).toHaveBeenCalledTimes(2); // désabonné
    });

    it('un listener qui JETTE n\'empêche pas les autres d\'être notifiés (isolation)', () => {
        const bad = vi.fn(() => { throw new Error('boom'); });
        const good = vi.fn();
        subscribeHistorySyncReport(bad);
        subscribeHistorySyncReport(good);
        setHistorySyncReport({ at: 1, skipped: [], patchedCount: 0 });
        expect(good).toHaveBeenCalledTimes(1);
    });

    it('clear sans rapport → aucun réveil parasite des abonnés', () => {
        const listener = vi.fn();
        subscribeHistorySyncReport(listener);
        clearHistorySyncReport();
        expect(listener).not.toHaveBeenCalled();
    });
});
