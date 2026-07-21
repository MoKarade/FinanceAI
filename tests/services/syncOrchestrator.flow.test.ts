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
    flushPush,
    getSyncStatus,
    markApiKeysHydrated,
    summarizeForConflict,
} from '../../services/sync/syncOrchestrator';
import { buildEnvelope } from '../../services/sync/syncEngine';
import { isGateAuthedThisSession } from '../../services/sync/authGate';
import { useFinanceStore } from '../../store/useFinanceStore';
import * as errorLogger from '../../services/errorLogger';

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
        // Après une restauration RÉUSSIE, le spinner doit retomber (busy:false) — sinon « Synchronisation… »
        // reste figé en permanence après un pull (régression corrigée EPIC 1, 2026-06).
        expect(getSyncStatus().busy).toBe(false);
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

describe('summarizeForConflict — résumé « cet appareil vs Drive » (choix éclairé du conflit)', () => {
    it('compte les placements et transactions d un payload persist Zustand', () => {
        expect(summarizeForConflict({ state: { assets: [{}, {}, {}], transactions: [{}, {}] } })).toEqual({
            assets: 3,
            transactions: 2,
        });
    });
    it('défensif : payload null (blob chiffré) / malformé / sans state → zéros (pas de crash)', () => {
        expect(summarizeForConflict(null)).toEqual({ assets: 0, transactions: 0 });
        expect(summarizeForConflict(undefined)).toEqual({ assets: 0, transactions: 0 });
        expect(summarizeForConflict('bogus')).toEqual({ assets: 0, transactions: 0 });
        expect(summarizeForConflict({ state: {} })).toEqual({ assets: 0, transactions: 0 });
        expect(summarizeForConflict({ state: { assets: 'notarray' } })).toEqual({ assets: 0, transactions: 0 });
    });
});

describe('ANTI-CLOBBER reconnexion (Marc 2026-07-14) — le local réel ne se perd JAMAIS en silence', () => {
    it('reconnexion (méta vierge) + données locales RÉELLES + Drive divergent → CONFLICT, local NON écrasé', async () => {
        // Le scénario EXACT de la perte : appareil déconnecté (méta vierge → aucune trace de sync) avec
        // de vraies données (3 placements), Drive porte une VIEILLE copie pauvre (driveEnvelope = 1 actif).
        // AVANT le fix : connectAndSync → restoreIntent → pull → localStorage écrasé par la copie Drive.
        // APRÈS : conflit signalé, aucune écriture locale, l'utilisateur choisit via SyncConflictModal.
        localStorage.setItem(STORE_KEY, JSON.stringify({
            state: {
                assets: [{ symbol: 'AAA' }, { symbol: 'BBB' }, { symbol: 'CCC' }],
                transactions: [{ id: 'l1' }, { id: 'l2' }],
                config: { users: [{ name: 'Marc', grossSalary: 108000, netSalary: 80000 }] },
            },
            version: 7,
        }));

        await connectAndSync();

        // Conflit signalé (pas de pull auto), et le résumé « cet appareil vs Drive » est exposé.
        expect(getSyncStatus().conflict).toBe(true);
        expect(getSyncStatus().conflictSummary?.local.assets).toBe(3);
        expect(getSyncStatus().conflictSummary?.drive.assets).toBe(1); // driveEnvelope = 1 actif (VFV)

        // DISCRIMINANT : le localStorage N'A PAS été écrasé par la copie Drive (3 placements intacts).
        // Sur l'ancien code (pull auto), il ne resterait que la seule VFV de Drive.
        const persisted = JSON.parse(localStorage.getItem(STORE_KEY) as string);
        expect(persisted.state.assets).toHaveLength(3);
        expect(createBackupMock).not.toHaveBeenCalled(); // pas d'applyPulledPayload → pas d'écrasement
    });

    it('pendant un CONFLIT : flushPush ne pousse PAS (le modal n est pas court-circuité par un masquage d onglet)', async () => {
        // Provoque un conflit (méta vierge + local réel + Drive divergent).
        localStorage.setItem(STORE_KEY, JSON.stringify({
            state: { assets: [{ symbol: 'AAA' }, { symbol: 'BBB' }], transactions: [{ id: 'l1' }], config: { users: [{ name: 'Marc', grossSalary: 108000 }] } },
            version: 7,
        }));
        await connectAndSync();
        expect(getSyncStatus().conflict).toBe(true);

        const driveApi = await import('../../services/googleDrive/driveAppData');
        const updateSpy = driveApi.updateSyncFile as ReturnType<typeof vi.fn>;
        const createSpy = driveApi.createSyncFile as ReturnType<typeof vi.fn>;
        updateSpy.mockClear();
        createSpy.mockClear();

        // Masquage d'onglet pendant le conflit → flushPush ne doit RIEN pousser (sinon il écraserait
        // Drive et auto-résoudrait le conflit sans le choix utilisateur — finding money-critical).
        flushPush();
        await Promise.resolve();
        await Promise.resolve();

        expect(updateSpy).not.toHaveBeenCalled();
        expect(createSpy).not.toHaveBeenCalled();
        expect(getSyncStatus().conflict).toBe(true); // conflit intact, pas auto-résolu
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
                // [PERSONA-PURGE] id RÉALISTE obligatoire : « d1 » est un id de fixture persona
                // (testBudget TEST_DEBTS) → la ceinture anti-fuite du push le purgerait (voulu).
                debts: [{ id: '1752585600001' }],
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

    // [PERSONA-PURGE] Preuve POSITIVE de la ceinture au push (finding panel : l'évitement
    // d'un id persona dans la fixture n'est pas une preuve — celle-ci exerce le nettoyage).
    it('pushNow DÉSINFECTE un payload réel pollué par des artefacts de persona avant l’envoi Drive', async () => {
        const local = {
            state: {
                isTestMode: false,
                transactions: [
                    { id: 'persona-tx-1', payee: 'Shopify - Dépôt paie', amount: 3200 },
                    { id: '1752585600002', payee: 'Paie / ROBOVIC INC.', amount: 837.31 },
                ],
                financialGoals: [{ id: 'kar-fg1', name: 'Indépendance financière (1 M$)' }],
                assets: [{ id: '1752585600003', symbol: 'XEQT' }],
                config: { users: [{ name: 'Marc' }] },
            },
            version: 7,
        };
        localStorage.setItem(STORE_KEY, JSON.stringify(local));

        const driveApi = await import('../../services/googleDrive/driveAppData');
        const result = await pushNow();
        expect(result).toBe('pushed');
        const sent =
            (driveApi.updateSyncFile as ReturnType<typeof vi.fn>).mock.calls[0]?.[2] ??
            (driveApi.createSyncFile as ReturnType<typeof vi.fn>).mock.calls[0]?.[1];
        expect(sent).toBeDefined();
        const state = sent.payload.state as { transactions: Array<{ id: string }>; financialGoals: unknown[]; assets: Array<{ id: string }> };
        expect(state.transactions.map(t => t.id)).toEqual(['1752585600002']); // persona-tx-1 purgé
        expect(state.financialGoals).toEqual([]);                              // kar-fg1 purgé
        expect(state.assets.map(a => a.id)).toEqual(['1752585600003']);        // le réel intact
    });

    it('pullNow DÉSINFECTE un payload Drive HISTORIQUE pollué avant de l’écrire en local', async () => {
        // Local VIDE (→ decideOnLoad pull) ; Drive = copie d'époque avec pollution persona.
        const driveApi = await import('../../services/googleDrive/driveAppData');
        (driveApi.readSyncFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ...driveEnvelope,
            payload: {
                state: {
                    isTestMode: false,
                    transactions: [
                        { id: 'persona-tx-9', payee: 'Loyer - Condo Griffintown', amount: -1750 },
                        { id: 'tx-drive-1', payee: 'réelle', amount: 42 },
                    ],
                    budgetItems: [{ id: 'kar-b1', name: 'Loyer (condo)' }, { id: 'cat_1700000000000', name: 'Épicerie' }],
                },
                version: 7,
            },
        });
        await pullNow(); // Promise<void> — la preuve est l'état ÉCRIT en local ci-dessous
        const written = JSON.parse(localStorage.getItem(STORE_KEY)!) as {
            state: { transactions: Array<{ id: string }>; budgetItems: Array<{ id: string }> };
        };
        expect(written.state.transactions.map(t => t.id)).toEqual(['tx-drive-1']);   // persona-tx-9 purgé
        expect(written.state.budgetItems.map(b => b.id)).toEqual(['cat_1700000000000']); // kar-b1 purgé
    });

    it('[SYNC-APIKEYS-SILENT audit 2026-07-16] échec de persistance des clés API au pull → logError warning, données quand même restaurées', async () => {
        // Discriminant : l'ancien catch était VIDE — les clés vivaient en mémoire seulement et
        // « disparaissaient » au reload sans AUCUNE trace (asymétrique avec le push qui journalise).
        const logSpy = vi.spyOn(errorLogger, 'logError');
        saveApiKeysMock.mockRejectedValueOnce(new Error('coffre IndexedDB indispo'));
        await expect(pullNow()).resolves.toBeUndefined(); // best-effort : pas de crash
        expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({
            source: 'storage',
            severity: 'warning',
            message: expect.stringMatching(/clés API ÉCHOUÉE/),
        }));
        // Les DONNÉES sont restaurées malgré l'échec du coffre (le best-effort est préservé).
        const written = JSON.parse(localStorage.getItem(STORE_KEY)!) as { state: { transactions: unknown[] } };
        expect(written.state.transactions.length).toBeGreaterThan(0);
        logSpy.mockRestore();
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

    it('local NON-vide + Drive SANS fichier : deux reprises concurrentes → UN SEUL createSyncFile (anti-doublon Drive)', async () => {
        // Scénario le plus dangereux nommé dans le code (~ligne 452) : sans verrou, deux décisions
        // « push » concurrentes appelleraient chacune createSyncFile → DEUX fichiers financeai-sync.json
        // dans le Drive (doublon impossible à réconcilier ensuite).
        const driveApi = await import('../../services/googleDrive/driveAppData');
        const findSpy = driveApi.findSyncFile as ReturnType<typeof vi.fn>;
        const createSpy = driveApi.createSyncFile as ReturnType<typeof vi.fn>;
        findSpy.mockClear();
        createSpy.mockClear();
        // Local non-vide (sinon la décision serait noop/pull) ET Drive vide (findSyncFile → null) →
        // la décision est « push » → createSyncFile.
        localStorage.setItem(STORE_KEY, JSON.stringify({ state: { transactions: [{ id: 'local-1' }] }, version: 7 }));
        let release: () => void = () => {};
        const gate = new Promise<void>((r) => { release = r; });
        try {
            // La 1re lecture Drive (readDrive de runDecision) est bloquée le temps que les DEUX reprises
            // entrent dans runDecision ; toutes les lectures Drive renvoient « aucun fichier ».
            findSpy.mockImplementation(async () => { await gate; return null; });

            const both = Promise.all([gateSilentResume(), gateSilentResume()]);
            await new Promise((r) => setTimeout(r, 0));
            release();
            await both;

            // Le verrou _decisionInFlight a dédupliqué : une seule décision → un seul createSyncFile.
            expect(createSpy).toHaveBeenCalledTimes(1);
        } finally {
            // mockImplementation PERSISTE (vi.clearAllMocks ne restaure pas l'impl du factory vi.mock) :
            // on rétablit le défaut pour ne pas polluer les tests suivants (sinon findSyncFile=null fuit).
            findSpy.mockImplementation(async () => ({ id: 'file-1', modifiedTime: '2024' }));
        }
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

// D5 — race : un push parti pendant le boot (clés API pas encore hydratées depuis secureKeyStore)
// ne doit PLUS écraser l'apiKeysEnc déjà présent dans Drive (sinon clés perdues sur les autres
// appareils). L'ORDRE compte : le flag _apiKeysHydrated ne se réinitialise pas → le cas « non
// hydraté » doit s'exécuter AVANT le cas « hydraté » (qui appelle markApiKeysHydrated).
describe('D5 — anti-race : clés API préservées si pas encore hydratées', () => {
    const blobWithKeys = {
        schemaVersion: 1, updatedAt: 1, deviceId: 'other', appVersion: 't',
        enc: false, apiKeysEnc: 'EXISTING-ENC-BLOB',
        payload: { state: { transactions: [{ id: 'x' }] }, version: 7 },
    };

    it('clés locales VIDES + PAS hydratées → préserve l\'apiKeysEnc déjà dans Drive (ne l\'écrase pas)', async () => {
        const driveApi = await import('../../services/googleDrive/driveAppData');
        useFinanceStore.getState().updateApiKeys({ anthropic: '', finnhub: '' });
        localStorage.setItem(STORE_KEY, JSON.stringify({ state: { transactions: [{ id: 'local' }] }, version: 7 }));
        (driveApi.readSyncFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce(blobWithKeys);

        expect(await pushNow()).toBe('pushed');
        const sent = (driveApi.updateSyncFile as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[2];
        expect(sent.apiKeysEnc).toBe('EXISTING-ENC-BLOB'); // préservé, PAS effacé
    });

    it('[SYNC-APIKEYS-SILENT push, finding panel 2026-07-21] relecture de préservation D5 ÉCHOUE → logError warning, push part quand même (sans clés)', async () => {
        // Discriminant : l'ancien `catch { /* best-effort */ }` était VIDE — l'apiKeysEnc Drive était
        // écrasé sans AUCUNE trace (« mes clés ont disparu sur l'autre appareil » indébuggable).
        // ⚠️ Doit rester AVANT le test markApiKeysHydrated (le flag ne se réinitialise pas).
        const driveApi = await import('../../services/googleDrive/driveAppData');
        const logSpy = vi.spyOn(errorLogger, 'logError');
        useFinanceStore.getState().updateApiKeys({ anthropic: '', finnhub: '' });
        localStorage.setItem(STORE_KEY, JSON.stringify({ state: { transactions: [{ id: 'local-d5' }] }, version: 7 }));
        (driveApi.readSyncFile as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Drive 500'));

        expect(await pushNow()).toBe('pushed'); // best-effort préservé : le push part
        expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({
            source: 'storage', severity: 'warning',
            message: expect.stringMatching(/PRÉSERVER les clés API existantes ÉCHOUÉE/),
        }));
        logSpy.mockRestore();
    });

    it('après markApiKeysHydrated() : clés vides = effacement volontaire → on n\'écrase plus avec les anciennes', async () => {
        const driveApi = await import('../../services/googleDrive/driveAppData');
        markApiKeysHydrated(); // App.tsx l'appelle après le chargement du vault (status ok)
        useFinanceStore.getState().updateApiKeys({ anthropic: '', finnhub: '' });
        localStorage.setItem(STORE_KEY, JSON.stringify({ state: { transactions: [{ id: 'local2' }] }, version: 7 }));
        // Pas de mock readSyncFile ici : la branche « préserve » est skippée (flag hydraté) → readSyncFile
        // n'est PAS appelé (et un mockResolvedValueOnce non consommé fuiterait vers le test suivant).

        expect(await pushNow()).toBe('pushed');
        const sent = (driveApi.updateSyncFile as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[2];
        expect(sent.apiKeysEnc).toBeUndefined(); // hydraté + vide → effacement respecté
    });
});

describe('pullNow — déchiffrement des clés ÉCHOUE (SF-3 : données OK, clés vides, pas de crash)', () => {
    it('apiKeysEnc indéchiffrable (sub/blob KO) : DONNÉES restaurées, clés vides, logError warning, busy:false', async () => {
        const driveApi = await import('../../services/googleDrive/driveAppData');
        const logSpy = vi.spyOn(errorLogger, 'logError').mockImplementation(() => {});
        try {
            // Enveloppe Drive avec de VRAIES données + un blob de clés syntaxiquement valide (base64)
            // mais INDÉCHIFFRABLE avec le sub mocké (sub-123) → decryptApiKeys rejette (AES-GCM).
            const badEnvelope = {
                ...driveEnvelope,
                apiKeys: undefined, // pas d'ancien format en clair → on force le chemin chiffré
                apiKeysEnc: 'A'.repeat(40), // base64 valide (30 octets > IV) mais auth GCM échouera
            };
            (driveApi.readSyncFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce(badEnvelope);
            // Clés locales vides au départ (on vérifie qu'elles le RESTENT, pas de fantôme).
            useFinanceStore.getState().updateApiKeys({ anthropic: '', finnhub: '' });

            await expect(pullNow()).resolves.toBeUndefined(); // pas de crash

            const s = useFinanceStore.getState();
            // CŒUR : les DONNÉES financières sont restaurées malgré l'échec sur les clés.
            expect(s.transactions).toEqual([{ id: 'tx-drive-1', amount: 42 }]);
            expect(s.config.users[0].name).toBe('Marc');
            // Les clés restent VIDES (jamais de clés à moitié déchiffrées injectées).
            expect(s.apiKeys.anthropic).toBe('');
            expect(s.apiKeys.finnhub).toBe('');
            // L'échec est JOURNALISÉ (non silencieux) en severity 'warning', source 'storage'.
            const warnCall = logSpy.mock.calls.find(
                ([arg]) => (arg as { severity?: string })?.severity === 'warning',
            );
            expect(warnCall).toBeTruthy();
            expect((warnCall?.[0] as { source?: string })?.source).toBe('storage');
            // Statut propre : la sync n'est pas restée « busy ».
            expect(getSyncStatus().busy).toBe(false);
            expect(getSyncStatus().conflict).toBe(false);
        } finally {
            logSpy.mockRestore();
        }
    });
});
