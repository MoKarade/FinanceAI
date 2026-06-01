import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Test d'INTÉGRATION du flux de sync réel (le câblage, pas seulement la décision pure decideOnLoad) :
// gate → jeton → lecture Drive → décision → écriture locale. On mocke la couche Google (GIS + Drive)
// + les effets de bord (backup, coffre de clés) ; on garde le VRAI orchestrateur, le vrai store, la
// vraie syncState/syncEngine/authGate. But : prouver « est-ce que la restauration au gate écrit
// vraiment les données en local ? » et « est-ce qu'un push embarque TOUT ? » (demande Marc 2026-05-29).

const STORE_KEY = 'financeai-storage';

// ── Mocks de la couche Google (aucun réseau) ────────────────────────────────
const driveEnvelope = {
    schemaVersion: 1,
    updatedAt: 1_700_000_000_000,
    deviceId: 'other-device',
    appVersion: 'test',
    enc: false,
    // Payload = format persist Zustand ({state, version}) — vraies données de Marc simulées.
    payload: {
        state: {
            transactions: [{ id: 'tx-drive-1', amount: 42 }],
            assets: [{ symbol: 'VFV', owner: 'marc' }],
            config: { users: [{ name: 'Marc', netSalary: 80000, grossSalary: 108000 }], splitMode: 'prorata' },
            retirementGoal: { targetAge: 60, lifeExpectancy: 92, targetMonthlyIncome: 5000, governmentPension: 1200 },
            documents: [{ id: 'doc-1', name: 'releve.pdf' }],
        },
        version: 7,
    },
    apiKeys: { anthropic: 'sk-from-drive', finnhub: 'fh-from-drive' },
};

const reloadMock = vi.fn();
const saveApiKeysMock = vi.fn(async (..._args: unknown[]) => undefined);
const createBackupMock = vi.fn(async (..._args: unknown[]) => null);

vi.mock('../../services/googleDrive/gisAuth', () => ({
    isGoogleAuthConfigured: () => true,
    configureGoogleAuth: () => {},
    getValidAccessToken: vi.fn(async () => 'tok-silent'),
    requestAccessToken: vi.fn(async () => 'tok-interactive'),
    revokeAccess: () => {},
}));

vi.mock('../../services/googleDrive/driveAppData', () => {
    class DriveAuthError extends Error {}
    return {
        DriveAuthError,
        findSyncFile: vi.fn(async () => ({ id: 'file-1', modifiedTime: '2024' })),
        readSyncFile: vi.fn(async () => driveEnvelope),
        createSyncFile: vi.fn(async () => 'file-1'),
        updateSyncFile: vi.fn(async () => undefined),
        deleteSyncFile: vi.fn(async () => undefined),
        fetchUserEmail: vi.fn(async () => 'marc@example.com'),
        fetchUserIdentity: vi.fn(async () => ({ email: 'marc@example.com', sub: 'sub-123' })),
    };
});

// On garde le VRAI crypto (encryptJson/decryptJson, utilisés par keyCipher pour le round-trip de
// chiffrement) et on ne mocke QUE les fonctions qui touchent IndexedDB (saveApiKeys/load).
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

// Importé APRÈS les mocks (vi.mock est hoisté, donc OK).
import {
    gateSilentResume,
    connectAndSync,
    pushNow,
    pullNow,
    getSyncStatus,
} from '../../services/sync/syncOrchestrator';
import { buildEnvelope } from '../../services/sync/syncEngine';
import { isGateAuthedThisSession } from '../../services/sync/authGate';
import { useFinanceStore } from '../../store/useFinanceStore';

beforeEach(() => {
    useFinanceStore.getState().resetState(); // état store par défaut (isolation entre tests)
    // clear APRÈS resetState : resetState() déclenche une écriture persist du défaut dans
    // localStorage — on la nettoie pour repartir d'une « navigation privée » propre.
    localStorage.clear();
    sessionStorage.clear();
    reloadMock.mockClear();
    saveApiKeysMock.mockClear();
    createBackupMock.mockClear();
    // Stub window.location.reload (jsdom le marque « Not implemented » sinon).
    Object.defineProperty(window, 'location', {
        configurable: true,
        writable: true,
        value: { reload: reloadMock, search: '', href: 'http://localhost/' },
    });
});
afterEach(() => {
    vi.clearAllMocks();
});

describe('Flux gate → restauration (intégration, Drive mocké)', () => {
    it('local VIDE (nav privée) : gateSilentResume restaure les données Drive DANS LE STORE, sans reload', async () => {
        const ok = await gateSilentResume();

        expect(ok).toBe(true);
        // CŒUR DU TEST : après le gate, le STORE VIVANT contient les données Drive (réhydratation
        // en place — c'est ce que voient les composants, sans rechargement de page).
        const s = useFinanceStore.getState();
        expect(s.transactions).toEqual([{ id: 'tx-drive-1', amount: 42 }]);
        expect(s.config.users[0].name).toBe('Marc');         // profil
        expect(s.retirementGoal.lifeExpectancy).toBe(92);     // espérance de vie
        expect(s.documents).toHaveLength(1);                  // documents
        expect(s.apiKeys.anthropic).toBe('sk-from-drive');    // clés injectées (utilisables tout de suite)
        // localStorage aussi écrit (persistance) ET surtout : PAS de reload (jeton/connexion préservés).
        expect(JSON.parse(localStorage.getItem(STORE_KEY) as string)).toEqual(driveEnvelope.payload);
        expect(reloadMock).not.toHaveBeenCalled();
        // Session marquée → pas de 2e login si un reload survenait par ailleurs.
        expect(isGateAuthedThisSession()).toBe(true);
        // Reste connecté → l'auto-push fonctionnera (corrige « ça n'enregistre pas »).
        expect(getSyncStatus().connected).toBe(true);
    });

    it('connectAndSync (login interactif) restaure aussi dans le store, sans reload', async () => {
        await connectAndSync();
        const s = useFinanceStore.getState();
        expect(s.transactions).toEqual([{ id: 'tx-drive-1', amount: 42 }]);
        expect(s.documents).toHaveLength(1);
        expect(getSyncStatus().email).toBe('marc@example.com');
        expect(getSyncStatus().connected).toBe(true);
        expect(reloadMock).not.toHaveBeenCalled();
    });
});

describe('Push : ce qui est exporté embarque TOUT (demande Marc)', () => {
    it('pushNow envoie l’intégralité du state local (profils, retraite, documents, transactions, actions)', async () => {
        // Local = données complètes de Marc.
        const local = {
            state: {
                transactions: [{ id: 'a' }, { id: 'b' }],
                assets: [{ symbol: 'XEQT' }],
                investmentTransactions: [{ id: 'it1' }],
                debts: [{ id: 'd1' }],
                config: { users: [{ name: 'Marc', netSalary: 80000, grossSalary: 108000 }] },
                retirementGoal: { targetAge: 60, lifeExpectancy: 92 },
                documents: [{ id: 'doc1' }, { id: 'doc2' }],
                savingsGoals: [{ id: 's1' }],
            },
            version: 7,
        };
        localStorage.setItem(STORE_KEY, JSON.stringify(local));

        const driveApi = await import('../../services/googleDrive/driveAppData');
        const result = await pushNow();
        expect(result).toBe('pushed');

        // L'enveloppe envoyée (create ou update) doit contenir EXACTEMENT le payload local complet.
        const sent =
            (driveApi.updateSyncFile as ReturnType<typeof vi.fn>).mock.calls[0]?.[2] ??
            (driveApi.createSyncFile as ReturnType<typeof vi.fn>).mock.calls[0]?.[1];
        expect(sent).toBeDefined();
        expect(sent.payload).toEqual(local); // tout le state, rien de tronqué
        expect(sent.payload.state.documents).toHaveLength(2);
        expect(sent.payload.state.retirementGoal.lifeExpectancy).toBe(92);
        expect(sent.payload.state.config.users[0].name).toBe('Marc');
    });
});

describe('Verrou anti-double-sync (boot : gate + runBootSync)', () => {
    it('deux reprises concurrentes → UNE seule décision (pas de double lecture / écriture Drive)', async () => {
        const driveApi = await import('../../services/googleDrive/driveAppData');
        const findSpy = driveApi.findSyncFile as ReturnType<typeof vi.fn>;
        findSpy.mockClear();
        // On bloque la 1re lecture Drive le temps que les DEUX reprises atteignent runDecision : la 2e
        // doit alors réutiliser la décision déjà en vol (verrou _decisionInFlight) au lieu d'en lancer
        // une seconde. Sans verrou : 2 décisions → 4 findSyncFile (chacune readDrive + pullNow).
        let release: () => void = () => {};
        const gate = new Promise<void>((r) => { release = r; });
        findSpy.mockImplementationOnce(async () => { await gate; return { id: 'file-1', modifiedTime: '2024' }; });

        const both = Promise.all([gateSilentResume(), gateSilentResume()]);
        await new Promise((r) => setTimeout(r, 0)); // laisse les 2 atteindre runDecision
        release();
        await both;

        // 1 décision = readDrive (1) + pullNow→readDrive (1) = 2 appels. Le verrou a évité le doublon.
        expect(findSpy).toHaveBeenCalledTimes(2);
    });
});

// Garde-fou : l'enveloppe construite n'oublie aucun champ du payload (sérialisation fidèle).
describe('buildEnvelope — fidélité du payload', () => {
    it('préserve le payload tel quel + le blob de clés CHIFFRÉ (jamais en clair)', () => {
        const payload = { state: { transactions: [{ id: 'z' }], documents: [{ id: 'p' }] }, version: 7 };
        const env = buildEnvelope(payload, 'dev', '1.0', 123, 'ENC_BLOB');
        expect(env.payload).toEqual(payload);
        expect(env.apiKeysEnc).toBe('ENC_BLOB');
        expect(env.apiKeys).toBeUndefined();
    });
});

describe('Chiffrement des clés API (C1) — round-trip push→pull', () => {
    it('push CHIFFRE les clés (apiKeysEnc, pas de clair) et pull les RESTAURE via le sub', async () => {
        const driveApi = await import('../../services/googleDrive/driveAppData');
        // 1) Local avec des clés + des données → push.
        useFinanceStore.getState().updateApiKeys({ anthropic: 'sk-secret-xyz', finnhub: 'fh-secret' });
        localStorage.setItem(STORE_KEY, JSON.stringify({ state: { transactions: [{ id: 't' }] }, version: 7 }));
        (driveApi.findSyncFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null); // pas encore de fichier
        const result = await pushNow();
        expect(result).toBe('pushed');

        // L'enveloppe créée contient un blob CHIFFRÉ, jamais les clés en clair.
        const created = (driveApi.createSyncFile as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1];
        expect(created.apiKeysEnc).toBeTypeOf('string');
        expect(created.apiKeys).toBeUndefined();
        expect(JSON.stringify(created)).not.toContain('sk-secret-xyz');

        // 2) On vide les clés locales, puis on tire CETTE enveloppe → les clés doivent revenir déchiffrées.
        useFinanceStore.getState().updateApiKeys({ anthropic: '', finnhub: '' });
        (driveApi.readSyncFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce(created);
        await pullNow();
        expect(useFinanceStore.getState().apiKeys.anthropic).toBe('sk-secret-xyz');
        expect(useFinanceStore.getState().apiKeys.finnhub).toBe('fh-secret');
    });
});
