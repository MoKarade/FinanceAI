// tests/services/syncPushPull.direct.test.ts
//
// [SYNC-PUSH-PULL-NO-UNIT-TEST] (lot 203) — tests DIRECTS de `syncPush` / `syncPull`.
//
// Le ticket disait « zéro test direct, un bug de merge/payload tronqué peut passer inaperçu ». Audité
// d'abord (leçon « L'ALARME d'un ticket se re-mesure autant que son défaut ») : les suites
// `syncOrchestrator.*` ne mockent QUE la frontière (GIS, Drive, coffre IndexedDB, backup) et font
// tourner les VRAIS `pushNow`/`pullNow` — couverture mesurée au lot 203 (`vitest --coverage`,
// 10 fichiers sync) : `syncPull.ts` 89 % de lignes, `syncPush.ts` 80 %. L'alarme était donc trop
// large ; ce qui restait SANS AUCUN test, c'est précis :
//   · `schedulePush` en entier (le push AUTOMATIQUE qui part à chaque changement du store, debounce
//     8 s, re-test du conflit pendant l'attente, saut si rien n'a changé) ;
//   · la réentrance de `pushNow` (deux appels au même tick → UN seul fichier Drive) ;
//   · les trois raisons de refus (`not-configured`, `skipped-empty`, `skipped-testmode`) ;
//   · le chiffrement des clés qui ÉCHOUE (push SANS clés, journalisé) ;
//   · côté pull : blob `enc:true` sans ciphertext, déchiffrement qui échoue pour une autre raison
//     qu'une mauvaise passphrase, backup pré-restauration qui ÉCHOUE, clés chiffrées sans `sub`.
// Chaque cas ci-dessous vise une de ces lignes, et rien d'autre : le reste est déjà tenu par les
// suites d'intégration (ne pas les dupliquer ici).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const STORE_KEY = 'financeai-storage';
const NONEMPTY_LOCAL = { state: { transactions: [{ id: 'tx-local-1', amount: 10 }] }, version: 7 };

const saveApiKeysMock = vi.fn(async (..._args: unknown[]) => undefined);
const createBackupMock = vi.fn(async (..._args: unknown[]) => null);
const logErrorMock = vi.fn();

const gisMocks = vi.hoisted(() => {
    class AuthInteractionRequiredError extends Error {}
    return {
        AuthInteractionRequiredError,
        isGoogleAuthConfigured: vi.fn(() => true),
        getValidAccessToken: vi.fn(async () => 'tok-silent'),
    };
});
vi.mock('../../services/googleDrive/gisAuth', () => ({
    isGoogleAuthConfigured: () => gisMocks.isGoogleAuthConfigured(),
    configureGoogleAuth: () => {},
    AuthInteractionRequiredError: gisMocks.AuthInteractionRequiredError,
    getValidAccessToken: gisMocks.getValidAccessToken,
    renewTokenSilently: vi.fn(async () => { throw new gisMocks.AuthInteractionRequiredError('pas de session'); }),
    requestAccessToken: vi.fn(async () => 'tok-interactive'),
    revokeAccess: () => {},
    traceSilentAuthFailure: () => {},
}));

vi.mock('../../services/googleDrive/driveAppData', () => {
    class DriveAuthError extends Error {}
    return {
        DriveAuthError,
        findSyncFile: vi.fn(async () => ({ id: 'file-1', modifiedTime: '2024' })),
        readSyncFile: vi.fn(async () => null),
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

vi.mock('../../services/errorLogger', () => ({
    logError: (...args: unknown[]) => logErrorMock(...args),
}));

// Chiffrement des clés (push) et déchiffrement du bundle (pull) : VRAIES implémentations par défaut,
// remplaçables par cas pour faire ÉCHOUER une étape précise sans toucher au reste de la chaîne.
const cipherMocks = vi.hoisted(() => ({
    encryptApiKeys: vi.fn<(...a: unknown[]) => Promise<string>>(),
    decryptBackup: vi.fn<(...a: unknown[]) => Promise<unknown>>(),
}));
vi.mock('../../services/sync/keyCipher', async (orig) => {
    const actual = (await orig()) as typeof import('../../services/sync/keyCipher');
    cipherMocks.encryptApiKeys.mockImplementation((...a) => (actual.encryptApiKeys as (...x: unknown[]) => Promise<string>)(...a));
    return { ...actual, encryptApiKeys: (...a: unknown[]) => cipherMocks.encryptApiKeys(...a) };
});
vi.mock('../../services/cloudBackup', async (orig) => {
    const actual = (await orig()) as typeof import('../../services/cloudBackup');
    cipherMocks.decryptBackup.mockImplementation((...a) => (actual.decryptBackup as (...x: unknown[]) => Promise<unknown>)(...a));
    return { ...actual, decryptBackup: (...a: unknown[]) => cipherMocks.decryptBackup(...a) };
});

import { pushNow, schedulePush, flushPush, markApiKeysHydrated } from '../../services/sync/syncPush';
import { pullNow } from '../../services/sync/syncPull';
import { setStatus, getSyncStatus, _resetSyncStatusForTests } from '../../services/sync/syncStatusStore';
import { writeSyncMeta, getOrCreateDeviceId } from '../../services/sync/syncState';
import { getLocalPayload } from '../../services/sync/syncSnapshot';
import { setPassphrase, clearPassphrase } from '../../services/sync/passphraseStore';
import { encryptBackup } from '../../services/cloudBackup';
import { useFinanceStore } from '../../store/useFinanceStore';
import * as driveApi from '../../services/googleDrive/driveAppData';

const findSyncFileMock = vi.mocked(driveApi.findSyncFile);
const readSyncFileMock = vi.mocked(driveApi.readSyncFile);
const updateSyncFileMock = vi.mocked(driveApi.updateSyncFile);
const createSyncFileMock = vi.mocked(driveApi.createSyncFile);
const fetchUserIdentityMock = vi.mocked(driveApi.fetchUserIdentity);

const ecrituresDrive = () => updateSyncFileMock.mock.calls.length + createSyncFileMock.mock.calls.length;

/** Meta « déjà synchronisée » avec le hash du payload local COURANT (rien n'a changé depuis). */
function metaAJourAvecLocal(): void {
    writeSyncMeta({
        connectedEmail: 'marc@example.com', connectedSub: 'sub-123', lastSyncedAt: 1_000,
        lastPulledUpdatedAt: 1_700_000_000_000, lastLocalHash: getLocalPayload().hash, deviceId: getOrCreateDeviceId(),
    });
}

beforeEach(() => {
    useFinanceStore.getState().resetState();
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    gisMocks.isGoogleAuthConfigured.mockReturnValue(true);
    gisMocks.getValidAccessToken.mockResolvedValue('tok-silent');
    findSyncFileMock.mockResolvedValue({ id: 'file-1', modifiedTime: '2024' });
    readSyncFileMock.mockResolvedValue(null as never);
    updateSyncFileMock.mockResolvedValue(undefined);
    createSyncFileMock.mockResolvedValue('file-1');
    fetchUserIdentityMock.mockResolvedValue({ email: 'marc@example.com', sub: 'sub-123' });
    createBackupMock.mockResolvedValue(null);
    _resetSyncStatusForTests();
    clearPassphrase();
    localStorage.setItem(STORE_KEY, JSON.stringify(NONEMPTY_LOCAL));
    Object.defineProperty(window, 'location', { configurable: true, writable: true, value: { reload: vi.fn(), search: '', href: 'http://localhost/' } });
});
afterEach(() => {
    vi.useRealTimers();
    clearPassphrase();
});

describe('[SYNC-PUSH-PULL-NO-UNIT-TEST] pushNow — les trois refus disent leur raison, et n\'écrivent rien', () => {
    it('Google non configuré → `not-configured`, aucun jeton demandé', async () => {
        gisMocks.isGoogleAuthConfigured.mockReturnValue(false);
        expect(await pushNow()).toBe('not-configured');
        expect(gisMocks.getValidAccessToken).not.toHaveBeenCalled();
        expect(ecrituresDrive()).toBe(0);
    });

    it('local VIDE → `skipped-empty` (anti-écrasement : un état vide ne part jamais)', async () => {
        localStorage.removeItem(STORE_KEY);
        expect(getLocalPayload().isEmpty).toBe(true); // anti-vacuité de la fixture
        expect(await pushNow()).toBe('skipped-empty');
        expect(ecrituresDrive()).toBe(0);
    });

    it('MODE TEST (persona) → `skipped-testmode` même avec un local non vide', async () => {
        useFinanceStore.setState({ isTestMode: true } as never);
        // ⚠️ Toute mutation du store RÉÉCRIT le blob persisté (middleware persist) : la fixture localStorage
        // posée en `beforeEach` serait effacée par un état par défaut VIDE → `skipped-empty` au lieu du chemin
        // visé (mesuré). Le store se mute D'ABORD, le blob se sème ENSUITE.
        localStorage.setItem(STORE_KEY, JSON.stringify(NONEMPTY_LOCAL));
        expect(getLocalPayload().isEmpty).toBe(false);
        expect(await pushNow()).toBe('skipped-testmode');
        expect(ecrituresDrive()).toBe(0);
    });

    it('contrôle : configuré + local non vide + hors mode test → `pushed`, UNE écriture Drive', async () => {
        expect(await pushNow()).toBe('pushed');
        expect(ecrituresDrive()).toBe(1);
        expect(getSyncStatus().busy).toBe(false);
        expect(getSyncStatus().connected).toBe(true);
    });
});

describe('[SYNC-PUSH-PULL-NO-UNIT-TEST] pushNow — réentrance : deux appels au même tick = UN push, UN fichier', () => {
    it('sans fichier Drive existant, deux pushNow concurrents → un SEUL createSyncFile (pas deux fichiers)', async () => {
        findSyncFileMock.mockResolvedValue(null);
        const [a, b] = await Promise.all([pushNow(), pushNow()]);
        expect([a, b]).toEqual(['pushed', 'pushed']);
        expect(createSyncFileMock).toHaveBeenCalledTimes(1);
        expect(updateSyncFileMock).not.toHaveBeenCalled();
    });

    it('contrôle : deux pushNow SÉQUENTIELS écrivent deux fois (c\'est bien le verrou qui dédoublonne, pas Drive)', async () => {
        findSyncFileMock.mockResolvedValue(null);
        await pushNow();
        await pushNow();
        expect(createSyncFileMock).toHaveBeenCalledTimes(2);
    });
});

describe('[SYNC-PUSH-PULL-NO-UNIT-TEST] pushNow — le chiffrement des clés API ÉCHOUE', () => {
    it('le push PART quand même, SANS clés (jamais en clair), et l\'échec est journalisé', async () => {
        useFinanceStore.getState().updateApiKeys({ anthropic: 'sk-locale', finnhub: '' });
        markApiKeysHydrated();
        localStorage.setItem(STORE_KEY, JSON.stringify(NONEMPTY_LOCAL)); // idem : le store d'abord, le blob ensuite
        cipherMocks.encryptApiKeys.mockRejectedValueOnce(new Error('WebCrypto indisponible'));
        expect(await pushNow()).toBe('pushed');
        expect(updateSyncFileMock).toHaveBeenCalledTimes(1);
        const envelope = updateSyncFileMock.mock.calls[0][2] as { apiKeysEnc?: string; apiKeys?: unknown };
        expect(envelope.apiKeysEnc).toBeUndefined();
        expect(JSON.stringify(envelope)).not.toContain('sk-locale');
        expect(logErrorMock).toHaveBeenCalledWith(expect.objectContaining({ severity: 'warning', message: expect.stringMatching(/chiffrement des clés API ÉCHOUÉ/) }));
    });

    it('contrôle : chiffrement OK → les clés voyagent en `apiKeysEnc`, jamais en clair', async () => {
        useFinanceStore.getState().updateApiKeys({ anthropic: 'sk-locale', finnhub: '' });
        markApiKeysHydrated();
        localStorage.setItem(STORE_KEY, JSON.stringify(NONEMPTY_LOCAL)); // idem : le store d'abord, le blob ensuite
        expect(await pushNow()).toBe('pushed');
        const envelope = updateSyncFileMock.mock.calls[0][2] as { apiKeysEnc?: string };
        expect(typeof envelope.apiKeysEnc).toBe('string');
        expect(JSON.stringify(envelope)).not.toContain('sk-locale');
        expect(logErrorMock).not.toHaveBeenCalled();
    });
});

describe('[SYNC-PUSH-PULL-NO-UNIT-TEST] schedulePush — le push AUTOMATIQUE (debounce 8 s)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        setStatus({ connected: true });
    });

    it('un changement local → rien avant 8 s, UNE écriture après', async () => {
        schedulePush();
        await vi.advanceTimersByTimeAsync(7_900);
        expect(ecrituresDrive()).toBe(0);
        await vi.advanceTimersByTimeAsync(200);
        expect(ecrituresDrive()).toBe(1);
    });

    it('re-programmer pendant l\'attente REPOUSSE le push (une seule écriture, à 8 s du DERNIER changement)', async () => {
        schedulePush();
        await vi.advanceTimersByTimeAsync(5_000);
        schedulePush();
        await vi.advanceTimersByTimeAsync(5_000); // t = 10 s : 8 s depuis le 1er, 5 s depuis le 2e
        expect(ecrituresDrive()).toBe(0);
        await vi.advanceTimersByTimeAsync(3_100); // t = 13,1 s
        expect(ecrituresDrive()).toBe(1);
    });

    it('un CONFLIT qui survient PENDANT les 8 s annule le push (le modal n\'est pas court-circuité)', async () => {
        schedulePush();
        await vi.advanceTimersByTimeAsync(4_000);
        setStatus({ conflict: true });
        await vi.advanceTimersByTimeAsync(10_000);
        expect(ecrituresDrive()).toBe(0);
    });

    it('un conflit DÉJÀ affiché → rien n\'est armé du tout', async () => {
        setStatus({ conflict: true });
        schedulePush();
        await vi.advanceTimersByTimeAsync(10_000);
        expect(ecrituresDrive()).toBe(0);
    });

    it('rien n\'a changé depuis la dernière sync (même hash) → aucun push (les changements d\'UI transitoires ne poussent pas)', async () => {
        metaAJourAvecLocal();
        schedulePush();
        await vi.advanceTimersByTimeAsync(10_000);
        expect(ecrituresDrive()).toBe(0);
    });

    it('non connecté → rien n\'est armé', async () => {
        setStatus({ connected: false });
        schedulePush();
        await vi.advanceTimersByTimeAsync(10_000);
        expect(ecrituresDrive()).toBe(0);
    });
});

describe('[SYNC-PUSH-PULL-NO-UNIT-TEST] flushPush — le push IMMÉDIAT au masquage d\'onglet', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        setStatus({ connected: true });
    });

    it('un push en attente est envoyé TOUT DE SUITE, et le minuteur annulé n\'en envoie pas un second', async () => {
        schedulePush();
        await vi.advanceTimersByTimeAsync(1_000);
        flushPush();
        await vi.advanceTimersByTimeAsync(0);
        expect(ecrituresDrive()).toBe(1);
        await vi.advanceTimersByTimeAsync(10_000);
        expect(ecrituresDrive()).toBe(1);
    });

    it('rien n\'a changé depuis la dernière sync → aucun push au masquage', async () => {
        metaAJourAvecLocal();
        flushPush();
        await vi.advanceTimersByTimeAsync(0);
        expect(ecrituresDrive()).toBe(0);
    });
});

describe('[SYNC-PUSH-PULL-NO-UNIT-TEST] pullNow — chemins d\'échec du blob chiffré (le local reste INTACT)', () => {
    const drive = (patch: Record<string, unknown>) => ({
        schemaVersion: 1, updatedAt: 1_700_000_000_000, deviceId: 'other', appVersion: 'test', enc: true, ...patch,
    });

    it('`enc:true` SANS ciphertext (corrompu) → rien d\'écrit, statut d\'erreur explicite', async () => {
        setPassphrase('passphrase-de-test-12');
        readSyncFileMock.mockResolvedValue(drive({ encPayload: undefined }) as never);
        await pullNow();
        expect(localStorage.getItem(STORE_KEY)).toBe(JSON.stringify(NONEMPTY_LOCAL));
        expect(getSyncStatus().error).toMatch(/corrompue/);
        expect(getSyncStatus().busy).toBe(false);
        expect(createBackupMock).not.toHaveBeenCalled();
    });

    it('déchiffrement qui échoue pour une AUTRE raison qu\'une mauvaise passphrase → « illisible », passphrase redemandée, local intact', async () => {
        setPassphrase('passphrase-de-test-12');
        readSyncFileMock.mockResolvedValue(drive({ encPayload: 'ciphertext-quelconque' }) as never);
        cipherMocks.decryptBackup.mockRejectedValueOnce(new Error('blob tronqué'));
        await pullNow();
        expect(localStorage.getItem(STORE_KEY)).toBe(JSON.stringify(NONEMPTY_LOCAL));
        expect(getSyncStatus().error).toMatch(/illisible/);
        expect(getSyncStatus().needsPassphrase).toBe(true);
        expect(logErrorMock).toHaveBeenCalledWith(expect.objectContaining({ severity: 'warning' }));
    });

    it('contrôle : bundle VALIDE → restauré (le vrai déchiffrement, seule la frontière est simulée)', async () => {
        setPassphrase('passphrase-de-test-12');
        const bundle = { payload: { state: { transactions: [{ id: 'tx-drive', amount: 5 }] }, version: 7 }, apiKeys: { anthropic: '', finnhub: '' } };
        readSyncFileMock.mockResolvedValue(drive({ encPayload: await encryptBackup(bundle, 'passphrase-de-test-12') }) as never);
        await pullNow();
        expect(localStorage.getItem(STORE_KEY)).toContain('tx-drive');
        expect(getSyncStatus().error).toBeNull();
    });
});

describe('[SYNC-PUSH-PULL-NO-UNIT-TEST] pullNow — filets du blob en clair', () => {
    const driveClair = (patch: Record<string, unknown> = {}) => ({
        schemaVersion: 1, updatedAt: 1_700_000_000_000, deviceId: 'other', appVersion: 'test', enc: false,
        payload: { state: { transactions: [{ id: 'tx-drive', amount: 5 }] }, version: 7 }, ...patch,
    });

    it('backup pré-restauration qui LÈVE → journalisé « SANS filet », données restaurées quand même', async () => {
        createBackupMock.mockRejectedValueOnce(new Error('IndexedDB indisponible'));
        readSyncFileMock.mockResolvedValue(driveClair() as never);
        await pullNow();
        expect(localStorage.getItem(STORE_KEY)).toContain('tx-drive');
        expect(logErrorMock).toHaveBeenCalledWith(expect.objectContaining({ severity: 'warning', message: expect.stringMatching(/SANS filet/) }));
    });

    it('clés chiffrées (`apiKeysEnc`) mais AUCUN `sub` résolvable → données restaurées, clés non touchées', async () => {
        fetchUserIdentityMock.mockResolvedValue(null as never);
        readSyncFileMock.mockResolvedValue(driveClair({ apiKeysEnc: 'blob-illisible-sans-sub' }) as never);
        await pullNow();
        expect(localStorage.getItem(STORE_KEY)).toContain('tx-drive');
        expect(saveApiKeysMock).not.toHaveBeenCalled();
        expect(getSyncStatus().error).toBeNull();
    });
});
