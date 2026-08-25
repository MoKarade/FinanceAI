// tests/services/syncResumeSettled.test.ts
//
// [BUDGET-DRIVE-BANNER-FLASH] La bannière « Non connecté à Google Drive — tes changements ne sont PAS
// sauvegardés » apparaissait au chargement puis disparaissait. Marc : « je ne veux PAS qu'elle
// apparaisse quand ce n'est pas nécessaire ».
//
// ⚠️ MESURÉ, pas supposé : le mécanisme n'est pas un tremblement d'une frame. `App.tsx` appelle
// `initSync(...)` — qui publie `configured: true` — puis retarde `runBootSync` de **2 500 ms**
// (`setTimeout(() => { void runBootSync(); }, 2500)`). Pendant toute cette fenêtre, `connected` est
// encore à sa valeur par DÉFAUT (`false`) et la bannière prend ce défaut pour un verdict.
//
// Le fond du bug : **`connected: false` recouvre deux faits opposés** — « on a essayé et on n'est pas
// connecté » et « on n'a pas encore essayé ». D'où `resumeSettled`, qui répond à la question que
// `connected` ne pose pas. Même famille que « pas encore connu ≠ zéro ».
//
// ⚠️ Le risque du correctif est SYMÉTRIQUE et pire : masquer une alerte pour toujours. Les deux
// derniers tests existent pour ça — un appareil qui n'a JAMAIS connecté Drive doit voir l'invitation
// TOUT DE SUITE, et `runBootSync` doit régler le drapeau quelle que soit celle de ses SEPT sorties
// qu'il emprunte.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const gisMocks = vi.hoisted(() => {
    class AuthInteractionRequiredError extends Error {}
    return {
        AuthInteractionRequiredError,
        configured: { value: true },
        getValidAccessToken: vi.fn(async () => 'tok-silent'),
        renewTokenSilently: vi.fn(async () => 'tok-renewed'),
        requestAccessToken: vi.fn(async () => 'tok-interactive'),
        revokeAccess: vi.fn(() => {}),
        traceSilentAuthFailure: vi.fn(() => {}),
    };
});
vi.mock('../../services/googleDrive/gisAuth', () => ({
    isGoogleAuthConfigured: () => gisMocks.configured.value,
    configureGoogleAuth: () => {},
    AuthInteractionRequiredError: gisMocks.AuthInteractionRequiredError,
    getValidAccessToken: gisMocks.getValidAccessToken,
    renewTokenSilently: gisMocks.renewTokenSilently,
    requestAccessToken: gisMocks.requestAccessToken,
    revokeAccess: gisMocks.revokeAccess,
    traceSilentAuthFailure: gisMocks.traceSilentAuthFailure,
}));

vi.mock('../../services/googleDrive/driveAppData', () => {
    class DriveAuthError extends Error {}
    return {
        DriveAuthError,
        findSyncFile: vi.fn(async () => null),
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
        saveApiKeys: vi.fn(async () => undefined),
        loadApiKeysDetailed: vi.fn(async () => ({ status: 'ok', keys: { anthropic: '', finnhub: '' } })),
    };
});

vi.mock('../../services/backupAuto', () => ({
    createBackupNow: vi.fn(async () => null),
    initAutoBackup: () => {},
}));

import { initSync, runBootSync, gateSilentResume, getSyncStatus } from '../../services/sync/syncOrchestrator';
import { writeSyncMeta } from '../../services/sync/syncState';
import { _resetSyncStatusForTests } from '../../services/sync/syncStatusStore';
import { recordActivity, clearActivity } from '../../services/sync/inactivityLogout';
import { useFinanceStore } from '../../store/useFinanceStore';

/** Un appareil qui a DÉJÀ connecté un compte Drive : c'est le seul cas où il y a une reprise à attendre. */
const appareilDeRetour = () => writeSyncMeta({
    // ⚠️ `readSyncMeta` REJETTE (→ null) toute méta où `lastPulledUpdatedAt`, `lastLocalHash` ou
    // `deviceId` manque. Une fixture partielle rendrait donc « jamais connecté » et le test mesurerait
    // le cas opposé à celui qu'il annonce — vu, et c'est pour ça que le 1er test assère `false`.
    connectedEmail: 'marc@example.com', connectedSub: 'sub-123', lastSyncedAt: 1,
    lastPulledUpdatedAt: 0, lastLocalHash: '', deviceId: 'd1',
});

beforeEach(() => {
    // ⚠️ `resumeSettled` est MONOTONE : sans cette remise à zéro, le 1er test qui le passe à `true`
    // rend tous les suivants vacueux (l'état de module survit d'un test à l'autre sous Vitest).
    _resetSyncStatusForTests();
    useFinanceStore.getState().resetState();
    localStorage.clear();
    sessionStorage.clear();
    gisMocks.configured.value = true;
    gisMocks.getValidAccessToken.mockReset().mockResolvedValue('tok-silent');
    gisMocks.renewTokenSilently.mockReset().mockResolvedValue('tok-renewed');
    gisMocks.requestAccessToken.mockReset().mockResolvedValue('tok-interactive');
    gisMocks.revokeAccess.mockReset();
    clearActivity();
    recordActivity();
});
afterEach(() => { vi.clearAllMocks(); });

describe('[BUDGET-DRIVE-BANNER-FLASH] « pas encore essayé » ≠ « déconnecté »', () => {
    it('appareil de RETOUR : juste après initSync, la reprise n\'est PAS tranchée', () => {
        appareilDeRetour();
        initSync('client-id');
        // C'est l'état que voit la bannière pendant les 2 500 ms qui précèdent runBootSync.
        expect(getSyncStatus().configured, 'sync non configurée : la fixture ne mesure rien').toBe(true);
        expect(getSyncStatus().connected, 'déjà connecté : il n\'y aurait aucune fenêtre à couvrir').toBe(false);
        expect(getSyncStatus().resumeSettled, 'le boot prétend déjà savoir qu\'on est déconnecté').toBe(false);
    });

    it('appareil JAMAIS connecté : réglé D\'ENTRÉE — l\'invitation ne doit pas attendre', () => {
        // ⚠️ La moitié qui empêche le correctif de devenir pire que le défaut. Rien à reprendre ici :
        // retarder la bannière reviendrait à taire « tes changements ne sont pas sauvegardés » chez
        // quelqu'un qui ne l'a jamais été.
        initSync('client-id');
        expect(getSyncStatus().resumeSettled).toBe(true);
    });

    it('runBootSync tranche même quand il n\'a RIEN à faire (jamais connecté → sortie immédiate)', async () => {
        appareilDeRetour();
        initSync('client-id');
        localStorage.clear(); // la méta disparaît → runBootSync sort par son `return` le plus précoce
        expect(getSyncStatus().resumeSettled, 'déjà réglé : ce test ne mesurerait rien').toBe(false);
        await runBootSync();
        expect(getSyncStatus().resumeSettled, 'une sortie précoce laisse la bannière muette POUR TOUJOURS').toBe(true);
    });

    it('runBootSync tranche aussi quand la reprise silencieuse ÉCHOUE définitivement', async () => {
        appareilDeRetour();
        initSync('client-id');
        gisMocks.getValidAccessToken.mockRejectedValue(new Error('pas de jeton en cache'));
        gisMocks.renewTokenSilently.mockRejectedValue(new gisMocks.AuthInteractionRequiredError('interaction requise'));
        await runBootSync();
        expect(getSyncStatus().connected, 'la reprise aurait dû échouer').toBe(false);
        expect(getSyncStatus().resumeSettled, 'échec définitif : c\'est justement là que la bannière DOIT parler').toBe(true);
    });

    it('gateSilentResume tranche lui aussi (c\'est lui qui parle en PREMIER au boot)', async () => {
        appareilDeRetour();
        initSync('client-id');
        expect(getSyncStatus().resumeSettled).toBe(false);
        await gateSilentResume();
        expect(getSyncStatus().resumeSettled).toBe(true);
    });

    it('initSync est MONOTONE : le 2e appel (App, après LoginGate) ne dé-tranche pas', async () => {
        // `initSync` est appelé DEUX fois au boot — LoginGate puis App. Sans le `||` de monotonie, le
        // second appel effacerait le verdict que `gateSilentResume` vient de rendre, et la bannière
        // repartirait pour 2 500 ms de silence chez quelqu'un qu'on SAIT déconnecté.
        appareilDeRetour();
        initSync('client-id');
        gisMocks.getValidAccessToken.mockRejectedValue(new Error('pas de jeton'));
        gisMocks.renewTokenSilently.mockRejectedValue(new gisMocks.AuthInteractionRequiredError('interaction'));
        await gateSilentResume();
        expect(getSyncStatus().resumeSettled).toBe(true);

        initSync('client-id'); // 2e appel, méta toujours présente
        expect(getSyncStatus().resumeSettled, 'le 2e initSync a effacé le verdict').toBe(true);
    });
});
