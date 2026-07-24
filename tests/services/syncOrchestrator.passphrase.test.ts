/**
 * @vitest-environment jsdom
 *
 * Passphrase OPTIONNELLE de sync zéro-knowledge (D-3). Tests d'INTÉGRATION du flux réel push/pull
 * (vrai orchestrateur + vrai syncEngine/syncState/passphraseStore + VRAI crypto cloudBackup), seule
 * la couche Google (GIS + Drive) et les effets de bord (backup, coffre, logger) sont mockés.
 *
 * On prouve les 5 propriétés exigées :
 *   1. round-trip : push enc:true → pull même passphrase → données + clés restaurées ;
 *   2. pull d'un blob enc:true SANS passphrase en session → needsPassphrase, ZÉRO perte ;
 *   3. pull avec passphrase FAUSSE → échec gracieux (logError warning), données locales intactes ;
 *   4. SANS passphrase → enveloppe IDENTIQUE à aujourd'hui (anti-régression) ;
 *   5. ancien blob enc:false lu sans passphrase → restauré (rétro-compat).
 *
 * webcrypto Node injecté comme dans cloudBackup.test.ts (jsdom n'a pas SubtleCrypto).
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { webcrypto } from 'node:crypto';

const STORE_KEY = 'financeai-storage';
const PASS = 'passphrase-zero-knowledge-2026'; // ≥ 12 caractères

const reloadMock = vi.fn();
const saveApiKeysMock = vi.fn(async (..._args: unknown[]) => undefined);
const createBackupMock = vi.fn(async (..._args: unknown[]) => null);
const logErrorMock = vi.fn();

vi.mock('../../services/googleDrive/gisAuth', () => ({
    isGoogleAuthConfigured: () => true,
    configureGoogleAuth: () => {},
    getValidAccessToken: vi.fn(async () => 'tok-silent'),
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

// VRAI crypto (encryptJson/decryptJson) ; on ne mocke QUE l'I/O IndexedDB du coffre.
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

// Logger mocké : ne pas polluer le storage qu'on nettoie + vérifier les avertissements (échec gracieux).
vi.mock('../../services/errorLogger', () => ({
    logError: (...args: unknown[]) => logErrorMock(...args),
}));

// Importé APRÈS les mocks (vi.mock hoisté).
import {
    pushNow,
    pullNow,
    setSyncPassphrase,
    clearSyncPassphrase,
    removeSyncPassphrase,
    getSyncStatus,
    disconnectSync,
} from '../../services/sync/syncOrchestrator';
import { useFinanceStore } from '../../store/useFinanceStore';
import * as driveApi from '../../services/googleDrive/driveAppData';

const findSyncFileMock = driveApi.findSyncFile as ReturnType<typeof vi.fn>;
const readSyncFileMock = driveApi.readSyncFile as ReturnType<typeof vi.fn>;
const createSyncFileMock = driveApi.createSyncFile as ReturnType<typeof vi.fn>;
const updateSyncFileMock = driveApi.updateSyncFile as ReturnType<typeof vi.fn>;

const LOCAL = { state: { transactions: [{ id: 'tx-local-1', amount: 42 }], config: { users: [{ name: 'Marc' }] } }, version: 7 };

beforeAll(() => {
    if (!globalThis.crypto?.subtle) {
        (globalThis as { crypto?: Crypto }).crypto = webcrypto as unknown as Crypto;
    }
});

beforeEach(() => {
    useFinanceStore.getState().resetState();
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    findSyncFileMock.mockImplementation(async () => ({ id: 'file-1', modifiedTime: '2024' }));
    readSyncFileMock.mockImplementation(async () => null);
    createSyncFileMock.mockImplementation(async () => 'file-1');
    updateSyncFileMock.mockImplementation(async () => undefined);
    Object.defineProperty(window, 'location', {
        configurable: true,
        writable: true,
        value: { reload: reloadMock, search: '', href: 'http://localhost/' },
    });
    // Repart « déconnecté » + passphrase purgée (disconnectSync efface la passphrase de session).
    disconnectSync();
});

afterEach(() => {
    vi.clearAllMocks();
});

/** Capture l'enveloppe envoyée à Drive (create ou update), peu importe le chemin emprunté. */
function sentEnvelope(): {
    enc: boolean;
    payload: unknown;
    encPayload?: string;
    apiKeysEnc?: string;
    apiKeys?: unknown;
} {
    const created = createSyncFileMock.mock.calls.at(-1)?.[1];
    const updated = updateSyncFileMock.mock.calls.at(-1)?.[2];
    return (created ?? updated) as ReturnType<typeof sentEnvelope>;
}

describe('1) Round-trip passphrase : push enc:true → pull même passphrase → données restaurées', () => {
    it('chiffre tout le payload + les clés, puis les restaure au pull', async () => {
        // Local avec données + clés API.
        useFinanceStore.getState().updateApiKeys({ anthropic: 'sk-secret-xyz', finnhub: 'fh-secret' });
        localStorage.setItem(STORE_KEY, JSON.stringify(LOCAL));
        findSyncFileMock.mockResolvedValueOnce(null); // pas encore de fichier → create

        // Active la passphrase, puis push.
        const setRes = await setSyncPassphrase(PASS);
        expect(setRes).toBe('set'); // aucun blob en attente → pas de pull
        const result = await pushNow();
        expect(result).toBe('pushed');

        // Enveloppe : enc:true, encPayload chiffré (FAI1), AUCUN clair, pas de payload ni apiKeysEnc.
        const env = sentEnvelope();
        expect(env.enc).toBe(true);
        expect(env.encPayload).toBeTypeOf('string');
        expect(env.payload).toBeNull();
        expect(env.apiKeysEnc).toBeUndefined();
        // Le ciphertext est un blob "FAI1" base64 ; aucune donnée sensible en clair dans l'enveloppe.
        const asJson = JSON.stringify(env);
        expect(asJson).not.toContain('sk-secret-xyz');
        expect(asJson).not.toContain('fh-secret');
        expect(asJson).not.toContain('tx-local-1');
        expect(asJson).not.toContain('Marc');
        expect(Buffer.from(env.encPayload as string, 'base64').subarray(0, 4).toString('latin1')).toBe('FAI1');

        // Pull du MÊME blob avec la MÊME passphrase (toujours en session) → données + clés restaurées.
        useFinanceStore.getState().updateApiKeys({ anthropic: '', finnhub: '' });
        const enc = { schemaVersion: 1, updatedAt: 2_000_000, deviceId: 'd', appVersion: 't', enc: true, payload: null, encPayload: env.encPayload };
        readSyncFileMock.mockResolvedValueOnce(enc);
        await pullNow();

        expect(getSyncStatus().needsPassphrase).toBe(false);
        expect(getSyncStatus().error).toBeNull();
        expect(useFinanceStore.getState().transactions).toEqual([{ id: 'tx-local-1', amount: 42 }]);
        expect(useFinanceStore.getState().apiKeys.anthropic).toBe('sk-secret-xyz');
        expect(useFinanceStore.getState().apiKeys.finnhub).toBe('fh-secret');
        // localStorage écrit avec le payload déchiffré (et pas de reload).
        expect(JSON.parse(localStorage.getItem(STORE_KEY) as string)).toEqual(LOCAL);
        expect(reloadMock).not.toHaveBeenCalled();
    });
});

describe('2) Pull d un blob enc:true SANS passphrase → needsPassphrase, ZÉRO perte', () => {
    it('n applique rien, ne crashe pas, et signale needsPassphrase', async () => {
        // Données locales présentes (ne doivent PAS être touchées).
        localStorage.setItem(STORE_KEY, JSON.stringify(LOCAL));
        const encBlob = { schemaVersion: 1, updatedAt: 3_000_000, deviceId: 'd', appVersion: 't', enc: true, payload: null, encPayload: 'FAI1-whatever' };
        readSyncFileMock.mockResolvedValueOnce(encBlob);

        await expect(pullNow()).resolves.toBeUndefined();

        expect(getSyncStatus().needsPassphrase).toBe(true);
        expect(getSyncStatus().busy).toBe(false);
        // ZÉRO perte : localStorage local intact, store non réhydraté, pas de backup déclenché.
        expect(JSON.parse(localStorage.getItem(STORE_KEY) as string)).toEqual(LOCAL);
        expect(useFinanceStore.getState().transactions).toEqual([]); // store resetState, jamais écrasé par Drive
        expect(createBackupMock).not.toHaveBeenCalled();
    });
});

describe('3) Pull avec passphrase FAUSSE → échec gracieux, données locales intactes', () => {
    it('journalise un warning, publie un message clair, ne touche pas au local', async () => {
        // 1) Produire un vrai blob chiffré avec la BONNE passphrase via un push.
        localStorage.setItem(STORE_KEY, JSON.stringify(LOCAL));
        findSyncFileMock.mockResolvedValueOnce(null);
        await setSyncPassphrase(PASS);
        await pushNow();
        const goodCipher = sentEnvelope().encPayload as string;

        // 2) Nouvelle session : on efface la passphrase et on en met une FAUSSE (≥12 pour passer la validation).
        clearSyncPassphrase();
        // Remettre des données locales connues (le push n'a pas touché le local, mais soyons explicites).
        localStorage.setItem(STORE_KEY, JSON.stringify(LOCAL));
        logErrorMock.mockClear();
        const setRes = await setSyncPassphrase('mauvaise-passphrase-1234');
        // setSyncPassphrase ne re-pull PAS ici (needsPassphrase n'était pas posé) → on pull manuellement.
        expect(setRes).toBe('set');

        const encBlob = { schemaVersion: 1, updatedAt: 4_000_000, deviceId: 'd', appVersion: 't', enc: true, payload: null, encPayload: goodCipher };
        readSyncFileMock.mockResolvedValueOnce(encBlob);
        await pullNow();

        // Échec GRACIEUX : message clair + warning loggé, données locales JAMAIS perdues.
        expect(getSyncStatus().error).toMatch(/passphrase/i);
        expect(getSyncStatus().needsPassphrase).toBe(true);
        expect(logErrorMock).toHaveBeenCalled();
        const sev = logErrorMock.mock.calls.at(-1)?.[0];
        expect(sev?.severity).toBe('warning');
        expect(JSON.parse(localStorage.getItem(STORE_KEY) as string)).toEqual(LOCAL);
        expect(useFinanceStore.getState().transactions).toEqual([]);
        expect(createBackupMock).not.toHaveBeenCalled();
    });
});

describe('4) SANS passphrase : enveloppe IDENTIQUE à aujourd hui (anti-régression)', () => {
    it('push produit enc:false, payload en clair, AUCUN encPayload', async () => {
        // Pas de passphrase active (disconnectSync l'a purgée en beforeEach).
        localStorage.setItem(STORE_KEY, JSON.stringify(LOCAL));
        findSyncFileMock.mockResolvedValueOnce(null);
        const result = await pushNow();
        expect(result).toBe('pushed');

        const env = sentEnvelope();
        expect(env.enc).toBe(false);
        expect(env.payload).toEqual(LOCAL); // payload EN CLAIR comme avant
        expect('encPayload' in env).toBe(false); // aucun champ chiffré parasite
    });

    it('push avec clés API SANS passphrase : clés via apiKeysEnc (keyCipher), pas encPayload', async () => {
        useFinanceStore.getState().updateApiKeys({ anthropic: 'sk-clear-path', finnhub: '' });
        localStorage.setItem(STORE_KEY, JSON.stringify(LOCAL));
        findSyncFileMock.mockResolvedValueOnce(null);
        await pushNow();

        const env = sentEnvelope();
        expect(env.enc).toBe(false);
        expect(env.apiKeysEnc).toBeTypeOf('string'); // chemin historique des clés (chiffré via sub)
        expect('encPayload' in env).toBe(false);
        expect(JSON.stringify(env)).not.toContain('sk-clear-path'); // clés jamais en clair
    });
});

describe('5) Rétro-compat : ancien blob enc:false lu SANS passphrase → restauré', () => {
    it('pull applique le payload clair même sans passphrase en session', async () => {
        const legacy = {
            schemaVersion: 1,
            updatedAt: 5_000_000,
            deviceId: 'old-device',
            appVersion: 'legacy',
            enc: false,
            payload: { state: { transactions: [{ id: 'tx-legacy', amount: 7 }] }, version: 7 },
            apiKeys: { anthropic: 'sk-legacy-clear', finnhub: 'fh-legacy' }, // ancien format clés en clair
        };
        readSyncFileMock.mockResolvedValueOnce(legacy);
        // Aucune passphrase en session.
        await pullNow();

        expect(getSyncStatus().needsPassphrase).toBe(false);
        expect(getSyncStatus().error).toBeNull();
        expect(useFinanceStore.getState().transactions).toEqual([{ id: 'tx-legacy', amount: 7 }]);
        // Clés legacy en clair restaurées (rétro-compat existante, inchangée).
        expect(useFinanceStore.getState().apiKeys.anthropic).toBe('sk-legacy-clear');
    });
});

describe('Cycle de migration : activer puis effacer la passphrase', () => {
    it('passphrase active → enc:true ; effacée → retour enc:false au push suivant', async () => {
        localStorage.setItem(STORE_KEY, JSON.stringify(LOCAL));

        // Activée → enc:true.
        findSyncFileMock.mockResolvedValueOnce(null);
        await setSyncPassphrase(PASS);
        await pushNow();
        expect(sentEnvelope().enc).toBe(true);

        // Effacée → enc:false au prochain push.
        clearSyncPassphrase();
        expect(getSyncStatus().passphraseActive).toBe(false);
        findSyncFileMock.mockResolvedValueOnce(null);
        await pushNow();
        expect(sentEnvelope().enc).toBe(false);
        expect(sentEnvelope().payload).toEqual(LOCAL);
    });
});

describe('removeSyncPassphrase — retire la passphrase ET re-publie EN CLAIR (zéro re-prompt ailleurs)', () => {
    it('connecté + déverrouillé → efface le secret et pousse un blob enc:false', async () => {
        localStorage.setItem(STORE_KEY, JSON.stringify(LOCAL));
        // 1) active + push enc:true
        await setSyncPassphrase(PASS);
        await pushNow();
        const encBlob = sentEnvelope();
        expect(encBlob.enc).toBe(true);
        // 2) un pull connecte la session (connected:true, needsPassphrase:false, passphrase en session)
        readSyncFileMock.mockResolvedValueOnce({
            schemaVersion: 1, updatedAt: 2_000_000, deviceId: 'd', appVersion: 't',
            enc: true, payload: null, encPayload: encBlob.encPayload,
        });
        await pullNow();
        expect(getSyncStatus().connected).toBe(true);
        expect(getSyncStatus().passphraseActive).toBe(true);
        // 3) retire la passphrase → re-publie en clair, plus de re-prompt ailleurs
        const r = await removeSyncPassphrase();
        expect(r).toBe('removed-and-republished');
        expect(getSyncStatus().passphraseActive).toBe(false);
        const env = sentEnvelope();
        expect(env.enc).toBe(false);
        expect(env.encPayload).toBeUndefined();
        expect(env.payload).toEqual(LOCAL);
    });

    it('déconnecté → efface seulement (aucun push)', async () => {
        await setSyncPassphrase(PASS);
        expect(getSyncStatus().passphraseActive).toBe(true);
        const r = await removeSyncPassphrase();
        expect(r).toBe('removed');
        expect(getSyncStatus().passphraseActive).toBe(false);
        expect(updateSyncFileMock).not.toHaveBeenCalled();
        expect(createSyncFileMock).not.toHaveBeenCalled();
    });
});
