// services/sync/syncPull.ts
// [ARCH-SYNC-SPLIT] MODULE money-critical : lit Drive et ÉCRIT le local (réhydratation EN PLACE).
// C'est le point exact de la perte 230k$ (2026-07-14) → `applyPulledPayload` fait un backup d'assurance
// AVANT d'écraser, et porte la CEINTURE persona côté PULL (sanitizePersistEnvelope avant d'écrire le
// local — double-ceinture avec syncSnapshot côté PUSH, à NE PAS fusionner). Aucune mutex de pull (préservé
// verbatim). Importé par : syncLifecycle (pullNow via runDecision/resolveConflict), syncPassphrase (pullNow).

import { isGoogleAuthConfigured, getValidAccessToken } from '../googleDrive/gisAuth';
import { decryptApiKeys } from './keyCipher';
import { hashPayload } from './syncEngine';
import { getPassphrase } from './passphraseStore';
import { decryptBackup, CloudBackupError } from '../cloudBackup';
import { writeSyncMeta } from './syncState';
import { saveApiKeys } from '../secureKeyStore';
// [PERF-BUNDLE] import STATIQUE : backupAuto est déjà dans le chunk de BOOT (importé statiquement par
// App.tsx via initAutoBackup) → le dynamic import ne créait aucun chunk séparé (INEFFECTIVE_DYNAMIC_IMPORT).
import { createBackupNow } from '../backupAuto';
import { useFinanceStore } from '../../store/useFinanceStore';
import { sanitizePersistEnvelope } from '../personaSanitizer';
import { logError } from '../errorLogger';
import type { ApiKeys } from './syncTypes';
import { STORE_KEY, hasAnyKey } from './syncSnapshot';
import { setStatus } from './syncStatusStore';
import { currentMeta, readDrive, resolveSub } from './syncMeta';
import { handleError } from './syncErrors';

/**
 * Réapplique un payload tiré de Drive : backup d'assurance → clés API → écriture localStorage →
 * réhydratation EN PLACE du store (sans reload).
 *
 * Pourquoi PAS `window.location.reload()` (l'ancienne approche) : le reload perdait le jeton Google
 * (en mémoire) → 2e login + `connected` repassait à false → l'auto-push ne partait plus
 * (« ça n'enregistre pas mes données »), et l'onboarding « nouvel utilisateur » clignotait avant que
 * les données n'arrivent. `persist.rehydrate()` relit le localStorage, applique les migrations, et
 * met à jour le store VIVANT → les composants se re-render avec les données restaurées, la session
 * reste connectée, les pushes suivants fonctionnent. (Bugs Marc 2026-05-29.)
 */
async function applyPulledPayload(payload: unknown, apiKeys?: ApiKeys): Promise<void> {
    if (typeof localStorage === 'undefined') return;
    // Filet : backup local de l'état courant avant d'écraser (réutilise backupAuto). Le SyncConflictModal
    // promet « un backup local est tenté avant » → un échec ne bloque pas la restauration, mais NE DOIT PAS
    // être avalé en silence (finding silent-failure 2026-07-14) : on journalise en 'warning' pour que
    // « restauration SANS filet » soit visible (diagnostics/SystemView), pas invisible.
    try {
        const backup = await createBackupNow('auto');
        if (!backup) {
            logError({ source: 'storage', severity: 'warning', message: 'applyPulledPayload: backup pré-restauration non créé (localStorage vide ou IndexedDB indispo) — restauration SANS filet' });
        }
    } catch (e) {
        logError({ source: 'storage', severity: 'warning', message: 'applyPulledPayload: backup pré-restauration échoué — restauration SANS filet', error: e instanceof Error ? e : new Error(String(e)) });
    }
    // Sync v2 : ré-applique les clés API. Chiffrées dans secureKeyStore (persistées) ET injectées
    // dans le store vivant tout de suite (utilisables sans reload). Best-effort : si le coffre est
    // indispo, on restaure quand même les données (l'utilisateur ressaisira ses clés).
    if (apiKeys && hasAnyKey(apiKeys)) {
        try {
            await saveApiKeys(apiKeys);
        } catch {
            /* coffre indispo — données restaurées quand même */
        }
        try {
            useFinanceStore.getState().updateApiKeys(apiKeys);
        } catch {
            /* le store réhydratera les clés au prochain boot via secureKeyStore */
        }
    }
    // [PERSONA-PURGE] Ceinture côté PULL : une copie Drive HISTORIQUE peut encore contenir des
    // artefacts de persona (fuite d'avant les gardes) → on désinfecte AVANT d'écraser le local,
    // sinon la restauration ré-injecterait la pollution qu'on vient de purger.
    const { envelope: cleanPayload, report: pullPurge } = sanitizePersistEnvelope(payload);
    if (pullPurge.removedTotal > 0) {
        logError({
            source: 'storage', severity: 'warning',
            message: `applyPulledPayload : ${pullPurge.removedTotal} artefact(s) de persona retirés du payload Drive avant restauration`,
        });
    }
    localStorage.setItem(STORE_KEY, JSON.stringify(cleanPayload));
    // Restaurer des données = utilisateur EXISTANT → ne JAMAIS réafficher l'onboarding « nouvel
    // utilisateur ». Sans ça, l'onboarding s'affichait puis, en se terminant, faisait un setAppState
    // qui ÉCRASAIT les profils (config.users) ET les clés API restaurés par des valeurs vides du
    // formulaire — d'où « âge retraite OK mais profils/clés absents » (bug Marc 2026-05-29).
    try {
        localStorage.setItem('app_onboarding_done', 'true');
    } catch {
        /* best-effort */
    }
    // Réhydratation en place : relit le localStorage qu'on vient d'écrire → met à jour le store.
    try {
        await useFinanceStore.persist.rehydrate();
    } catch {
        // Filet ultime : si rehydrate échoue (très rare), on retombe sur un reload pour garantir
        // que l'utilisateur voie ses données (au prix d'un éventuel 2e login).
        if (typeof window !== 'undefined') window.location.reload();
    }
}

/** Tire Drive et applique (réhydratation EN PLACE). Met à jour la meta avant d'appliquer. */
export async function pullNow(): Promise<void> {
    if (!isGoogleAuthConfigured()) return;
    setStatus({ busy: true, error: null });
    try {
        const token = await getValidAccessToken();
        const drive = await readDrive(token);
        if (!drive) {
            setStatus({ busy: false });
            return;
        }

        // Payload + clés EFFECTIFS à appliquer. Pour un blob clair (`enc:false`), ce sont directement
        // ceux de l'enveloppe ; pour un blob chiffré (`enc:true`), ils sortent du déchiffrement.
        let effectivePayload: unknown = drive.payload;
        let restoredKeys: ApiKeys = { anthropic: '', finnhub: '' };

        if (drive.enc) {
            // Chemin ZÉRO-KNOWLEDGE : il FAUT la passphrase de cette session pour déchiffrer.
            const passphrase = getPassphrase();
            if (passphrase === null) {
                // Pas de passphrase en session → on N'APPLIQUE RIEN (zéro perte) et on signale à l'UI
                // qu'elle doit la demander, puis re-puller. Pas une erreur : cas nominal d'un nouvel
                // appareil/onglet. busy retombe, pas d'écriture locale, meta intacte.
                setStatus({ busy: false, needsPassphrase: true });
                return;
            }
            const decoded = drive.encPayload;
            if (typeof decoded !== 'string') {
                // Blob marqué chiffré mais sans ciphertext (corruption) → échec gracieux, rien d'écrasé.
                logError({ source: 'storage', severity: 'warning', message: 'pullNow: blob enc:true sans encPayload (corrompu) — données locales conservées' });
                setStatus({ busy: false, error: 'Sync (pull) : sauvegarde chiffrée corrompue (champ manquant).' });
                return;
            }
            let bundle: { payload: unknown; apiKeys?: ApiKeys };
            try {
                bundle = await decryptBackup<{ payload: unknown; apiKeys?: ApiKeys }>(decoded, passphrase);
            } catch (e) {
                // Passphrase FAUSSE / blob altéré → AES-GCM échoue. On NE TOUCHE PAS au local (zéro perte),
                // on journalise un avertissement (non silencieux) et on publie un message clair pour que
                // l'UI re-demande la passphrase. `needsPassphrase` reste vrai → le prompt reste ouvert.
                logError({ source: 'storage', severity: 'warning', message: 'pullNow: déchiffrement de la sauvegarde échoué (passphrase incorrecte ou blob corrompu) — données locales conservées', error: e instanceof Error ? e : new Error(String(e)) });
                const msg = e instanceof CloudBackupError && e.code === 'WRONG_PASSPHRASE'
                    ? 'Sync (pull) : passphrase incorrecte (ou sauvegarde corrompue). Données locales conservées.'
                    : 'Sync (pull) : sauvegarde chiffrée illisible. Données locales conservées.';
                setStatus({ busy: false, needsPassphrase: true, error: msg });
                return;
            }
            effectivePayload = bundle.payload ?? null;
            const k = bundle.apiKeys;
            restoredKeys = { anthropic: k?.anthropic ?? '', finnhub: k?.finnhub ?? '' };
        } else {
            // Chemin EN CLAIR historique (INCHANGÉ). Clés API : nouveau format CHIFFRÉ (apiKeysEnc) →
            // déchiffré via le sub ; sinon ancien blob EN CLAIR (rétro-compat — sera ré-écrit au prochain
            // push). Échec de déchiffrement (mauvais sub / blob altéré) → clés non restaurées, mais les
            // DONNÉES le sont quand même.
            if (drive.apiKeysEnc) {
                const sub = await resolveSub(token);
                if (sub) {
                    try {
                        restoredKeys = await decryptApiKeys(drive.apiKeysEnc, sub);
                    } catch (e) {
                        // SF-3 — clés non restaurées (mauvais sub / blob altéré). Les données
                        // financières le sont quand même, mais l'IA + les cours d'actions seraient
                        // silencieusement HS. On journalise (non silencieux) pour signaler qu'il
                        // faut reconfigurer les clés dans Paramètres.
                        logError({ source: 'storage', severity: 'warning', message: 'pullNow: clés API non restaurées (déchiffrement échoué) — données OK, reconfigurer les clés dans Paramètres', error: e instanceof Error ? e : new Error(String(e)) });
                    }
                }
            } else if (drive.apiKeys) {
                restoredKeys = drive.apiKeys;
            }
        }

        const meta = currentMeta();
        writeSyncMeta({
            ...meta,
            lastSyncedAt: Date.now(),
            lastPulledUpdatedAt: drive.updatedAt,
            // Même hash que getLocalPayload (PAYLOAD seul) → au prochain boot/gate l'état est vu
            // « inchangé » (pas de push parasite, et donc pas d'effacement des clés dans Drive).
            lastLocalHash: hashPayload(effectivePayload),
        });
        const syncedAt = Date.now();
        // Pull réussi → plus besoin de passphrase (réinitialise le drapeau s'il était posé).
        setStatus({ conflict: false, conflictSummary: null, needsPassphrase: false });
        await applyPulledPayload(effectivePayload, restoredKeys); // réhydrate le store EN PLACE (pas de reload)
        // Le pull réussi DOIT retomber busy:false : sinon le spinner « Synchronisation… » reste figé
        // après une restauration (applyPulledPayload ne touche pas au statut). Bug : seuls les chemins
        // early-return (drive null) et erreur (handleError) remettaient busy:false. (EPIC 1, 2026-06.)
        setStatus({ busy: false, connected: true, lastSyncedAt: syncedAt });
    } catch (e) {
        handleError('pull', e);
    }
}
