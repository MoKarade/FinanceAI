// tests/services/syncPullPurgeNotice.test.ts
//
// [PURGE-TOAST-UX] (décision Marc 2026-09-05 : OUI, un toast) Le pull Drive qui retire des artefacts de
// persona ne faisait qu'un `logError` — la purge LOCALE au boot, elle, prévenait par un toast. Trois
// étages, prouvés séparément :
//   1. le CANAL (`syncStatusStore`) : un avis émis atteint chaque abonné, un abonné retiré ne l'est plus ;
//   2. l'ÉMISSION (`pullNow` → `applyPulledPayload`), sur le VRAI orchestrateur avec la couche Google
//      mockée (même harnais que `syncOrchestrator.flow.test.ts`) : un payload Drive pollué émet UN avis
//      qui porte le compte ; un payload propre n'émet RIEN (contrôle) ;
//   3. le CÂBLAGE UI (`useAppBootEffects`) : l'abonnement est posé et rend un toast — lu dans la source
//      DÉCOMMENTÉE, parce que le hook de boot lance service worker, sync et sept minuteurs : le monter
//      en test mesurerait tout sauf cette ligne.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const driveState = vi.hoisted(() => ({ payload: null as unknown }));
const saveApiKeysMock = vi.fn(async (..._args: unknown[]) => undefined);
const createBackupMock = vi.fn(async (..._args: unknown[]) => null);

vi.mock('../../services/googleDrive/gisAuth', () => {
    class AuthInteractionRequiredError extends Error {}
    return {
        isGoogleAuthConfigured: () => true,
        configureGoogleAuth: () => {},
        AuthInteractionRequiredError,
        getValidAccessToken: vi.fn(async () => 'tok-silent'),
        renewTokenSilently: vi.fn(async () => 'tok-renewed'),
        requestAccessToken: vi.fn(async () => 'tok-interactive'),
        revokeAccess: vi.fn(() => {}),
        traceSilentAuthFailure: vi.fn(() => {}),
    };
});
vi.mock('../../services/googleDrive/driveAppData', () => {
    class DriveAuthError extends Error {}
    return {
        DriveAuthError,
        findSyncFile: vi.fn(async () => ({ id: 'file-1', modifiedTime: '2024' })),
        readSyncFile: vi.fn(async () => ({
            schemaVersion: 1, updatedAt: 1_700_000_000_000, deviceId: 'other-device', appVersion: 'test', enc: false,
            payload: driveState.payload, apiKeys: { anthropic: '', finnhub: '' },
        })),
        createSyncFile: vi.fn(async () => 'file-1'),
        updateSyncFile: vi.fn(async () => undefined),
        deleteSyncFile: vi.fn(async () => undefined),
        fetchUserEmail: vi.fn(async () => 'marc@example.com'),
        fetchUserIdentity: vi.fn(async () => ({ email: 'marc@example.com', sub: 'sub-123' })),
    };
});
vi.mock('../../services/secureKeyStore', async (orig) => {
    const actual = (await orig()) as typeof import('../../services/secureKeyStore');
    return {
        ...actual,
        saveApiKeys: (...args: unknown[]) => saveApiKeysMock(...args),
        loadApiKeysDetailed: vi.fn(async () => ({ status: 'ok', keys: { anthropic: '', finnhub: '' } })),
    };
});
vi.mock('../../services/backupAuto', () => ({
    createBackupNow: (...args: unknown[]) => createBackupMock(...args),
    initAutoBackup: () => {},
}));

import { pullNow, subscribeSyncNotice, type SyncNotice } from '../../services/sync/syncOrchestrator';
import { emitSyncNotice, _resetSyncNoticeForTests, _resetSyncStatusForTests } from '../../services/sync/syncStatusStore';
import { useFinanceStore } from '../../store/useFinanceStore';
import { stripComments } from '../../utils/stripComments';

const realTx = { id: 'tx-reel-1', date: '2026-06-04', payee: 'Paie / ROBOVIC INC.', amount: 837.31, category: 'Salaire' };
// Même convention d'id que les fixtures de `personaSanitizer.test.ts` (préfixe reconnu par le registre).
const personaTx = { id: 'persona-tx-1', date: '2026-06-01', payee: 'Shopify - Dépôt paie', amount: 3200, category: 'Salaire' };
const enveloppe = (transactions: unknown[]) => ({
    state: { isTestMode: false, transactions, config: { users: [{ name: 'Marc', netSalary: 5000, grossSalary: 7000 }] } },
    version: 7,
});

beforeEach(() => {
    useFinanceStore.getState().resetState();
    localStorage.clear();
    sessionStorage.clear();
    _resetSyncNoticeForTests();
    _resetSyncStatusForTests();
    createBackupMock.mockClear();
});
afterEach(() => { _resetSyncNoticeForTests(); });

describe('[PURGE-TOAST-UX] 1. le canal d’avis de sync', () => {
    it('un avis atteint chaque abonné ; un abonné retiré ne reçoit plus rien', () => {
        const a = vi.fn(); const b = vi.fn();
        const offA = subscribeSyncNotice(a); subscribeSyncNotice(b);
        const avis: SyncNotice = { kind: 'purge-pull', removed: 2, texte: 'deux' };
        emitSyncNotice(avis);
        expect(a).toHaveBeenCalledWith(avis);
        expect(b).toHaveBeenCalledWith(avis);
        offA();
        emitSyncNotice({ kind: 'purge-pull', removed: 1, texte: 'un' });
        expect(a).toHaveBeenCalledTimes(1);
        expect(b).toHaveBeenCalledTimes(2);
    });

    it('sans abonné, émettre ne jette pas (un avis sans abonné est perdu, par conception)', () => {
        expect(() => emitSyncNotice({ kind: 'purge-pull', removed: 1, texte: 'x' })).not.toThrow();
    });
});

describe('[PURGE-TOAST-UX] 2. le pull Drive ÉMET l’avis quand il purge — sur le vrai orchestrateur', () => {
    it('payload Drive pollué : un avis, qui porte le compte et une phrase sans montant', async () => {
        driveState.payload = enveloppe([personaTx, realTx]);
        const recu: SyncNotice[] = [];
        subscribeSyncNotice((n) => recu.push(n));

        await pullNow();

        expect(recu).toHaveLength(1);
        expect(recu[0].kind).toBe('purge-pull');
        expect(recu[0].removed).toBe(1);
        expect(recu[0].texte).toContain('1 donnée(s) de test');
        expect(recu[0].texte).not.toMatch(/\d\s?\$/); // rien à masquer : pas de montant dans la phrase
        // La restauration a bien eu lieu, désinfectée : la transaction réelle est là, l'artefact non.
        const persisted = JSON.parse(localStorage.getItem('financeai-storage') as string);
        expect(persisted.state.transactions.map((t: { id: string }) => t.id)).toEqual(['tx-reel-1']);
    });

    it('contrôle — payload propre : restauration identique, AUCUN avis', async () => {
        driveState.payload = enveloppe([realTx]);
        const recu: SyncNotice[] = [];
        subscribeSyncNotice((n) => recu.push(n));

        await pullNow();

        expect(recu).toHaveLength(0);
        const persisted = JSON.parse(localStorage.getItem('financeai-storage') as string);
        expect(persisted.state.transactions.map((t: { id: string }) => t.id)).toEqual(['tx-reel-1']);
    });
});

describe('[PURGE-TOAST-UX] 3. le boot s’abonne et rend un toast (source décommentée)', () => {
    const src = stripComments(readFileSync(resolve(__dirname, '../../hooks/useAppBootEffects.ts'), 'utf8'));
    it('l’abonnement est posé, AVANT le premier pull, et son rappel appelle showToast', () => {
        const abonnement = src.indexOf('subscribeSyncNotice(');
        const premierPull = src.indexOf('runBootSync()');
        expect(abonnement).toBeGreaterThan(-1);
        expect(premierPull).toBeGreaterThan(-1);
        expect(abonnement).toBeLessThan(premierPull); // un avis sans abonné est perdu
        expect(src).toMatch(/subscribeSyncNotice\(\(n\) => showToast\(n\.texte/);
        expect(src).toContain('unsubNotice();'); // retiré au démontage, comme les autres abonnements
    });
});
