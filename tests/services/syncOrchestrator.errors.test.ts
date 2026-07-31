import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Tests des CHEMINS D'ÉCHEC de la sync Google Drive (le happy path est couvert par
// syncOrchestrator.flow.test.ts). Invariant fondamental : une erreur de sync ne doit JAMAIS
//   - crasher l'app (tout est en try/catch dans l'orchestrateur),
//   - corrompre la meta locale (lastLocalHash/lastPulledUpdatedAt) sur un push raté,
//   - effacer les données locales sur un pull raté.
// On mocke la couche Google (GIS + Drive) + les effets de bord (backup, coffre, logger) ; on garde
// le VRAI orchestrateur, le vrai store, la vraie syncState/syncEngine/authGate.

const STORE_KEY = 'financeai-storage';

// Payload local NON-vide (sinon pushNow court-circuite avec 'skipped-empty' avant le token).
const NONEMPTY_LOCAL = { state: { transactions: [{ id: 'tx-local-1', amount: 10 }] }, version: 7 };

const reloadMock = vi.fn();
const saveApiKeysMock = vi.fn(async (..._args: unknown[]) => undefined);
const createBackupMock = vi.fn(async (..._args: unknown[]) => null);
const logErrorMock = vi.fn();

// Mocks de la couche Google. Les fns I/O sont des vi.fn() qu'on pourra faire échouer par test ;
// leurs implémentations par défaut (succès) sont rétablies dans beforeEach pour l'isolation.
vi.mock('../../services/googleDrive/gisAuth', () => {
    // [AUTH-DRIVE-INACTIVITY] La classe doit exister dans le mock (instanceof dans trySilentReauth).
    class AuthInteractionRequiredError extends Error {}
    return {
        isGoogleAuthConfigured: () => true,
        configureGoogleAuth: () => {},
        AuthInteractionRequiredError,
        getValidAccessToken: vi.fn(async () => 'tok-silent'),
        // Défaut : la ré-auth silencieuse échoue NOMINALEMENT (pas de session) → silence, comme avant.
        renewTokenSilently: vi.fn(async () => { throw new AuthInteractionRequiredError('pas de session'); }),
        requestAccessToken: vi.fn(async () => 'tok-interactive'),
        revokeAccess: () => {},
        traceSilentAuthFailure: () => {},
    };
});

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

// On garde le VRAI crypto et on ne mocke QUE l'I/O IndexedDB du coffre.
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

// Le logger écrit dans localStorage (best-effort) : on le mocke pour ne pas polluer le storage qu'on
// nettoie entre tests, et pour vérifier qu'un échec de sync est bien journalisé sans être relancé.
vi.mock('../../services/errorLogger', () => ({
    logError: (...args: unknown[]) => logErrorMock(...args),
}));

// Importé APRÈS les mocks (vi.mock est hoisté, donc OK).
import {
    gateSilentResume,
    connectAndSync,
    pushNow,
    pullNow,
    runBootSync,
    disconnectSync,
    getSyncStatus,
} from '../../services/sync/syncOrchestrator';
import { readSyncMeta, writeSyncMeta, getOrCreateDeviceId } from '../../services/sync/syncState';
import { useFinanceStore } from '../../store/useFinanceStore';
import * as gisAuth from '../../services/googleDrive/gisAuth';
import * as driveApi from '../../services/googleDrive/driveAppData';
import type { SyncMeta } from '../../services/sync/syncTypes';

const getValidAccessTokenMock = gisAuth.getValidAccessToken as ReturnType<typeof vi.fn>;
const renewTokenSilentlyMock = gisAuth.renewTokenSilently as ReturnType<typeof vi.fn>;
const requestAccessTokenMock = gisAuth.requestAccessToken as ReturnType<typeof vi.fn>;
const findSyncFileMock = driveApi.findSyncFile as ReturnType<typeof vi.fn>;
const readSyncFileMock = driveApi.readSyncFile as ReturnType<typeof vi.fn>;
const updateSyncFileMock = driveApi.updateSyncFile as ReturnType<typeof vi.fn>;
const createSyncFileMock = driveApi.createSyncFile as ReturnType<typeof vi.fn>;

/** Meta « déjà synchronisée » de référence : sert à prouver qu'un push raté ne la corrompt pas. */
function seedSyncedMeta(): SyncMeta {
    const meta: SyncMeta = {
        connectedEmail: 'marc@example.com',
        connectedSub: 'sub-123',
        lastSyncedAt: 1_000,
        lastPulledUpdatedAt: 1_700_000_000_000,
        lastLocalHash: 'deadbeef',
        deviceId: getOrCreateDeviceId(),
    };
    writeSyncMeta(meta);
    return meta;
}

beforeEach(() => {
    useFinanceStore.getState().resetState(); // état store par défaut (isolation entre tests)
    // clear APRÈS resetState : resetState() déclenche une écriture persist du défaut → on repart
    // d'une « navigation privée » propre.
    localStorage.clear();
    sessionStorage.clear();

    // Réinitialise les mocks I/O : compteurs + implémentations par défaut (succès). Indispensable
    // car certains tests posent des *Once rejetés ; sans reset, ils fuiteraient sur le test suivant.
    vi.clearAllMocks();
    getValidAccessTokenMock.mockImplementation(async () => 'tok-silent');
    renewTokenSilentlyMock.mockImplementation(async () => {
        throw new gisAuth.AuthInteractionRequiredError('pas de session');
    });
    requestAccessTokenMock.mockImplementation(async () => 'tok-interactive');
    findSyncFileMock.mockImplementation(async () => ({ id: 'file-1', modifiedTime: '2024' }));
    readSyncFileMock.mockImplementation(async () => null);
    updateSyncFileMock.mockImplementation(async () => undefined);
    createSyncFileMock.mockImplementation(async () => 'file-1');

    // Stub window.location.reload (jsdom marque « Not implemented » sinon).
    Object.defineProperty(window, 'location', {
        configurable: true,
        writable: true,
        value: { reload: reloadMock, search: '', href: 'http://localhost/' },
    });

    // _status est un singleton module partagé entre tests : on le ramène à « déconnecté » pour
    // qu'un test d'erreur n'hérite pas d'un `connected: true` laissé par un test précédent.
    disconnectSync();
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('pushNow — échec du jeton Google (getValidAccessToken rejette)', () => {
    it('retourne "error" sans relancer l’exception', async () => {
        localStorage.setItem(STORE_KEY, JSON.stringify(NONEMPTY_LOCAL));
        getValidAccessTokenMock.mockRejectedValueOnce(new Error('token refresh failed'));

        const result = await pushNow();

        expect(result).toBe('error');
    });

    it('NE corrompt PAS la meta locale (lastLocalHash / lastPulledUpdatedAt inchangés)', async () => {
        const seeded = seedSyncedMeta();
        localStorage.setItem(STORE_KEY, JSON.stringify(NONEMPTY_LOCAL));
        getValidAccessTokenMock.mockRejectedValueOnce(new Error('token refresh failed'));

        await pushNow();

        // CŒUR DU TEST : l'écriture meta vient APRÈS le token dans pushNow → un token raté ne doit
        // rien réécrire. Si elle changeait, le prochain boot croirait le local « déjà synchronisé »
        // et ne le pousserait jamais (perte de données silencieuse).
        const meta = readSyncMeta();
        expect(meta?.lastLocalHash).toBe(seeded.lastLocalHash);
        expect(meta?.lastPulledUpdatedAt).toBe(seeded.lastPulledUpdatedAt);
        expect(meta?.lastSyncedAt).toBe(seeded.lastSyncedAt);
    });

    it('n’écrit RIEN dans Drive (ni update ni create)', async () => {
        localStorage.setItem(STORE_KEY, JSON.stringify(NONEMPTY_LOCAL));
        getValidAccessTokenMock.mockRejectedValueOnce(new Error('token refresh failed'));

        await pushNow();

        expect(updateSyncFileMock).not.toHaveBeenCalled();
        expect(createSyncFileMock).not.toHaveBeenCalled();
    });

    it('publie un statut d’erreur honnête (error renseigné, busy retombé à false)', async () => {
        localStorage.setItem(STORE_KEY, JSON.stringify(NONEMPTY_LOCAL));
        getValidAccessTokenMock.mockRejectedValueOnce(new Error('token refresh failed'));

        await pushNow();

        const status = getSyncStatus();
        expect(status.busy).toBe(false);
        expect(status.error).toContain('push');
        expect(logErrorMock).toHaveBeenCalledTimes(1);
    });
});

describe('connectAndSync — échec du consentement (requestAccessToken rejette)', () => {
    it('ne lève aucune exception non rattrapée', async () => {
        requestAccessTokenMock.mockRejectedValueOnce(new Error('user closed popup'));

        await expect(connectAndSync()).resolves.toBeUndefined();
    });

    it('laisse connected à false (le clic raté ne marque pas la session connectée)', async () => {
        requestAccessTokenMock.mockRejectedValueOnce(new Error('user closed popup'));

        await connectAndSync();

        expect(getSyncStatus().connected).toBe(false);
        expect(getSyncStatus().email).toBeNull();
        expect(getSyncStatus().error).toContain('connect');
    });

    it('ne touche pas à Drive quand le consentement échoue', async () => {
        requestAccessTokenMock.mockRejectedValueOnce(new Error('user closed popup'));

        await connectAndSync();

        expect(findSyncFileMock).not.toHaveBeenCalled();
        expect(readSyncFileMock).not.toHaveBeenCalled();
    });
});

describe('gateSilentResume — échec silencieux (getValidAccessToken rejette)', () => {
    it('retourne false sans lever (1er accès non consenti = cas nominal)', async () => {
        getValidAccessTokenMock.mockRejectedValueOnce(new Error('no silent session'));

        const ok = await gateSilentResume();

        expect(ok).toBe(false);
    });

    it('laisse connected à false et busy retombé (le gate montrera le bouton de login)', async () => {
        getValidAccessTokenMock.mockRejectedValueOnce(new Error('no silent session'));

        await gateSilentResume();

        const status = getSyncStatus();
        expect(status.connected).toBe(false);
        expect(status.busy).toBe(false);
    });

    it('échec silencieux : ne journalise PAS d’erreur (ce n’est pas un bug)', async () => {
        getValidAccessTokenMock.mockRejectedValueOnce(new Error('no silent session'));

        await gateSilentResume();

        // gateSilentResume avale l'échec sans handleError → rien dans le logger (sinon faux positifs
        // dans SystemView à chaque 1er accès non connecté).
        expect(logErrorMock).not.toHaveBeenCalled();
    });
});

describe('gateSilentResume — jeton VALIDE mais Drive injoignable (timeout réseau) → erreur ROUTÉE', () => {
    // Discriminant du fix silent-failure 2026-07-16 : sur l'ancien code (catch unique englobant),
    // une erreur de lecture Drive APRÈS un jeton valide était avalée en silence (aucun logError, aucun
    // status.error) → indiscernable d'un « pas de session ». Le nouveau chemin à deux phases doit la
    // ROUTER via handleError. Sur l'ancien code, `expect(logErrorMock).toHaveBeenCalled()` échouerait.
    it('journalise l’erreur + publie status.error (pas un renvoi muet au login)', async () => {
        // Jeton en cache VALIDE (défaut 'tok-silent'), mais la lecture Drive échoue (ex. timeout).
        findSyncFileMock.mockRejectedValueOnce(new Error('Drive : délai dépassé (20 s) — réseau lent'));

        const ok = await gateSilentResume();

        expect(ok).toBe(false); // décision de rendu inchangée : le gate montre le login
        const status = getSyncStatus();
        expect(status.connected).toBe(false);
        expect(status.busy).toBe(false);
        expect(logErrorMock).toHaveBeenCalled(); // tracé (SystemView), pas avalé
        expect(status.error).toBeTruthy(); // visible pour l'UI
    });
});

describe('pullNow — échec de lecture Drive (les données locales sont protégées)', () => {
    it('findSyncFile rejette → pas de crash, statut en erreur', async () => {
        localStorage.setItem(STORE_KEY, JSON.stringify(NONEMPTY_LOCAL));
        findSyncFileMock.mockRejectedValueOnce(new Error('drive list failed'));

        await expect(pullNow()).resolves.toBeUndefined();

        const status = getSyncStatus();
        expect(status.busy).toBe(false);
        expect(status.error).toContain('pull');
    });

    it('findSyncFile rejette → les données LOCALES ne sont PAS effacées', async () => {
        localStorage.setItem(STORE_KEY, JSON.stringify(NONEMPTY_LOCAL));
        findSyncFileMock.mockRejectedValueOnce(new Error('drive list failed'));

        await pullNow();

        // L'écriture localStorage (applyPulledPayload) vient APRÈS readDrive → un échec en amont
        // laisse le local intact. Régression critique sinon : perte de données sur un Drive HS.
        expect(JSON.parse(localStorage.getItem(STORE_KEY) as string)).toEqual(NONEMPTY_LOCAL);
        expect(createBackupMock).not.toHaveBeenCalled(); // applyPulledPayload jamais atteint
    });

    it('readSyncFile rejette → données locales intactes et store inchangé', async () => {
        localStorage.setItem(STORE_KEY, JSON.stringify(NONEMPTY_LOCAL));
        findSyncFileMock.mockResolvedValueOnce({ id: 'file-1', modifiedTime: '2024' });
        readSyncFileMock.mockRejectedValueOnce(new Error('drive read failed'));

        await pullNow();

        expect(JSON.parse(localStorage.getItem(STORE_KEY) as string)).toEqual(NONEMPTY_LOCAL);
        // Le store n'a pas été réhydraté avec des données fantômes.
        expect(useFinanceStore.getState().transactions).toEqual([]);
        expect(getSyncStatus().error).toContain('pull');
    });
});

describe('runBootSync — [AUTH-DRIVE-BANNER-FLICKER] les échecs transitoires ne crient pas « non connecté »', () => {
    /** Amène le statut à `connected: true` par un boot RÉUSSI (mocks par défaut). Remet aussi à zéro
     *  la série d'échecs transitoires (état module de syncLifecycle) — chaque test part propre. */
    async function bootConnected(): Promise<void> {
        seedSyncedMeta();
        localStorage.setItem(STORE_KEY, JSON.stringify(NONEMPTY_LOCAL));
        await runBootSync();
        expect(getSyncStatus().connected).toBe(true); // pré-condition du scénario
    }

    it('jeton VALIDE + erreur Drive transitoire (timeout) → RESTE connecté, erreur routée (pas de bannière-mensonge)', async () => {
        // Discriminant : sur l'ancien code, le catch de runBootSync faisait `connected:false`
        // inconditionnel → chaque hoquet réseau du polling 60 s affichait « tes changements ne sont
        // PAS sauvegardés » (faux — le jeton est bon). C'est la bannière qui clignote de Marc.
        await bootConnected();
        findSyncFileMock.mockRejectedValueOnce(new Error('Drive : délai dépassé — réseau lent'));

        await runBootSync();

        const status = getSyncStatus();
        expect(status.connected).toBe(true); // ÉCHOUE sur l'ancien code (connected:false)
        expect(status.busy).toBe(false);
        expect(status.error).toContain('boot'); // l'erreur reste visible (Diagnostics), pas avalée
        expect(logErrorMock).toHaveBeenCalled();
    });

    it('jeton REJETÉ par l\'API Drive (401 DriveAuthError) → vraie déconnexion, busy retombé', async () => {
        await bootConnected();
        findSyncFileMock.mockRejectedValueOnce(new driveApi.DriveAuthError('401'));

        await runBootSync();

        const status = getSyncStatus();
        expect(status.connected).toBe(false); // accès réellement perdu → la bannière dit vrai
        expect(status.busy).toBe(false); // sinon le polling (skip si busy) resterait gelé à vie
    });

    it('renouvellement silencieux : un raté RÉSEAU isolé ne déconnecte pas (grâce), la persistance oui', async () => {
        await bootConnected();
        // Jeton expiré du cache + renouvellement qui échoue de façon TRANSITOIRE (pas AuthInteractionRequired).
        getValidAccessTokenMock.mockRejectedValue(new Error('Session Google expirée'));
        renewTokenSilentlyMock.mockRejectedValue(new Error('réseau indisponible (réveil de veille)'));

        await runBootSync(); // raté 1
        expect(getSyncStatus().connected).toBe(true); // ÉCHOUE sur l'ancien code (false dès le 1er raté)
        await runBootSync(); // raté 2
        expect(getSyncStatus().connected).toBe(true);
        await runBootSync(); // raté 3 = la panne DURE → on le dit honnêtement
        expect(getSyncStatus().connected).toBe(false);
    });

    it('un renouvellement qui REDEVIENT bon efface la série (pas de déconnexion à retardement)', async () => {
        await bootConnected();
        getValidAccessTokenMock.mockRejectedValue(new Error('Session Google expirée'));
        renewTokenSilentlyMock.mockRejectedValue(new Error('réseau indisponible'));
        await runBootSync(); // raté 1
        await runBootSync(); // raté 2
        renewTokenSilentlyMock.mockResolvedValue('tok-renewed'); // le réseau revient

        await runBootSync(); // succès → série close

        expect(getSyncStatus().connected).toBe(true);
        renewTokenSilentlyMock.mockRejectedValue(new Error('re-hoquet'));
        await runBootSync(); // un NOUVEAU raté isolé repart de zéro : pas d'effet cumulatif
        expect(getSyncStatus().connected).toBe(true);
    });

    it('échec DÉFINITIF (interaction requise : session Google morte) → bannière IMMÉDIATE, sans grâce', async () => {
        await bootConnected();
        getValidAccessTokenMock.mockRejectedValue(new Error('Session Google expirée'));
        // Défaut du mock : renewTokenSilently lève AuthInteractionRequiredError → définitif.

        await runBootSync();

        // Là, « reconnecte-toi » est le bon message dès le 1er échec : rien ne se résorbera tout seul.
        expect(getSyncStatus().connected).toBe(false);
    });
});

describe('runBootSync — aucune connexion antérieure (pas de connectedEmail)', () => {
    it('no-op : ne lit RIEN sur Drive', async () => {
        // Pas de meta → readSyncMeta() renvoie null → connectedEmail absent.
        await expect(runBootSync()).resolves.toBeUndefined();

        expect(findSyncFileMock).not.toHaveBeenCalled();
        expect(readSyncFileMock).not.toHaveBeenCalled();
    });

    it('no-op : ne demande même pas de jeton Google', async () => {
        await runBootSync();

        expect(getValidAccessTokenMock).not.toHaveBeenCalled();
    });
});
