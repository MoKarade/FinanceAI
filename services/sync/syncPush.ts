// services/sync/syncPush.ts
// [ARCH-SYNC-SPLIT] MODULE money-critical : écrit le snapshot local vers Drive. Possède `_apiKeysHydrated`
// (D5 anti-race), `_pushInFlight` (mutex réentrance), `_pushTimer` (debounce). Importé par : syncLifecycle
// (pushNow via runDecision/connect), syncPassphrase (pushNow), App.tsx (schedulePush/flushPush/markApiKeysHydrated).

import { isGoogleAuthConfigured, getValidAccessToken } from '../googleDrive/gisAuth';
import { findSyncFile, readSyncFile, updateSyncFile, createSyncFile } from '../googleDrive/driveAppData';
import { encryptApiKeys } from './keyCipher';
import { shouldPush, buildEnvelope, buildEncryptedEnvelope } from './syncEngine';
import { getPassphrase } from './passphraseStore';
import { encryptBackup } from '../cloudBackup';
import { getOrCreateDeviceId, writeSyncMeta } from './syncState';
import { useFinanceStore } from '../../store/useFinanceStore';
import type { SyncEnvelope } from './syncTypes';
import { getLocalPayload, hasAnyKey } from './syncSnapshot';
import { setStatus, getSyncStatus } from './syncStatusStore';
import { currentMeta, resolveSub } from './syncMeta';
import { handleError } from './syncErrors';
import { logError } from '../errorLogger';

/** Résultat d'un push — permet à l'UI d'être honnête (toast réel vs « rien à sauvegarder »). */
export type PushResult = 'pushed' | 'skipped-empty' | 'skipped-testmode' | 'not-configured' | 'error';

// D5 (anti-race) — les clés API sont hydratées de façon ASYNC depuis secureKeyStore au boot
// (App.tsx). Tant que ce flag est faux, un push avec clés locales VIDES n'écrase PAS l'apiKeysEnc
// déjà présent dans Drive (il le préserve) → fin du bug « un push parti pendant le boot efface les
// clés ». Une fois vrai (vault confirmé lisible), des clés vides = effacement volontaire → push normal.
let _apiKeysHydrated = false;
export function markApiKeysHydrated(): void { _apiKeysHydrated = true; }

/**
 * Vrai si l'app tourne en MODE TEST (fixtures persona). On ne synchronise JAMAIS ces données :
 * sinon l'auto-push écraserait la vraie sauvegarde Drive par des données de démo (bug 2026-05-29).
 */
function isTestModeActive(): boolean {
    try {
        return useFinanceStore.getState().isTestMode === true;
    } catch {
        return false;
    }
}

// `__APP_VERSION__` est injecté par Vite (define). `typeof` évite un ReferenceError en test
// (où le define n'existe pas) — diagnostic uniquement dans l'enveloppe.
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'web';

// Garde de RÉENTRANCE du push : deux `pushNow()` quasi simultanés (ex. `visibilitychange` hidden +
// `pagehide` au MÊME tick à la fermeture d'onglet — `pushNow` n'écrit la meta qu'après le réseau, donc
// le 2ᵉ passe encore le test de hash) réutilisent le MÊME push en vol au lieu d'en lancer deux → évite
// un double `createSyncFile` (2 fichiers Drive) au 1er push. Calqué sur `_decisionInFlight`.
let _pushInFlight: Promise<PushResult> | null = null;

/** Pousse le payload local vers Drive (create ou update) et met à jour la meta. Dé-doublonné (réentrance). */
export function pushNow(): Promise<PushResult> {
    if (_pushInFlight) return _pushInFlight;
    const run = runPushNow().finally(() => { _pushInFlight = null; });
    _pushInFlight = run;
    return run;
}

async function runPushNow(): Promise<PushResult> {
    if (!isGoogleAuthConfigured()) return 'not-configured';
    const testMode = isTestModeActive();
    const local = getLocalPayload();
    if (!shouldPush(local.isEmpty, testMode)) {
        // On NE pousse jamais un état vide (anti-écrasement) ni en mode test (anti-démo). On RETOURNE
        // la raison pour que l'UI soit honnête (avant : skip silencieux + faux toast « Sauvegardé »).
        return testMode ? 'skipped-testmode' : 'skipped-empty';
    }
    setStatus({ busy: true, error: null });
    try {
        const token = await getValidAccessToken();
        const now = Date.now();
        // Fichier Drive existant (s'il existe) : récupéré UNE seule fois — sert à PRÉSERVER les clés
        // (anti-race D5) ET à décider create vs update plus bas.
        const ref = await findSyncFile(token);
        // Passphrase optionnelle active (D-3) → chemin ZÉRO-KNOWLEDGE : on chiffre le payload COMPLET
        // ET les clés API ensemble avec `encryptBackup` (la passphrase ne quitte jamais l'appareil).
        // Sinon → chemin historique INCHANGÉ (`enc:false`, payload en clair, clés via `apiKeysEnc`).
        const passphrase = getPassphrase();
        let envelope: SyncEnvelope;
        if (passphrase !== null) {
            // Bundle chiffré = payload + clés (les clés voyagent DANS le ciphertext, pas en `apiKeysEnc`).
            // encryptBackup valide la passphrase (≥12 caractères) et lève sinon → capté par le catch
            // global qui publie un statut d'erreur honnête sans rien écrire dans Drive.
            const encPayload = await encryptBackup({ payload: local.payload, apiKeys: local.apiKeys }, passphrase);
            envelope = buildEncryptedEnvelope(encPayload, getOrCreateDeviceId(), APP_VERSION, now);
        } else {
            // Clés API : CHIFFRÉES avant d'entrer dans l'enveloppe (C1). Dérivé du sub Google → déchiffrable
            // sur tous les appareils du compte. Best-effort : si pas de sub / crypto indispo, on pousse SANS
            // les clés (jamais en clair) — l'utilisateur les ressaisira sur l'autre appareil.
            let apiKeysEnc: string | undefined;
            if (hasAnyKey(local.apiKeys)) {
                const sub = await resolveSub(token);
                if (sub) {
                    try {
                        apiKeysEnc = await encryptApiKeys(local.apiKeys, sub);
                    } catch (e) {
                        // [SYNC-APIKEYS-SILENT, finding panel 2026-07-21] Best-effort ASSUMÉ (jamais de
                        // clés en clair dans Drive) mais JOURNALISÉ : les catch locaux court-circuitent le
                        // handleError englobant → sans trace, « clés absentes sur l'autre appareil » était
                        // indébuggable. Clés locales intactes, re-poussées au prochain push réussi.
                        logError({
                            source: 'storage', severity: 'warning',
                            message: 'Push Drive : chiffrement des clés API ÉCHOUÉ — push envoyé SANS clés (clés locales intactes).',
                            error: e instanceof Error ? e : new Error(String(e)),
                        });
                    }
                }
            } else if (!_apiKeysHydrated && ref) {
                // D5 (anti-race) : clés locales pas encore hydratées depuis secureKeyStore → NE PAS
                // écraser les clés déjà présentes dans Drive. On relit le blob existant et on PRÉSERVE
                // son apiKeysEnc. (Après hydratation, des clés vides = effacement volontaire → on laisse
                // tomber, comportement normal.) Lecture best-effort : un échec ne pousse pas de clés.
                try {
                    const existing = await readSyncFile(token, ref.id);
                    if (existing && !existing.enc && existing.apiKeysEnc) apiKeysEnc = existing.apiKeysEnc;
                } catch (e) {
                    // [SYNC-APIKEYS-SILENT, finding panel 2026-07-21] Échec de la PRÉSERVATION D5 : ce
                    // push écrase l'apiKeysEnc de Drive sans le relire → le journaliser (sinon des clés
                    // qui « disparaissent » de Drive n'ont aucune explication nulle part).
                    logError({
                        source: 'storage', severity: 'warning',
                        message: 'Push Drive : relecture du blob pour PRÉSERVER les clés API existantes ÉCHOUÉE — push envoyé sans clés (l\'apiKeysEnc Drive existant est écrasé).',
                        error: e instanceof Error ? e : new Error(String(e)),
                    });
                }
            }
            envelope = buildEnvelope(local.payload, getOrCreateDeviceId(), APP_VERSION, now, apiKeysEnc);
        }
        if (ref) await updateSyncFile(token, ref.id, envelope);
        else await createSyncFile(token, envelope);
        const meta = currentMeta();
        writeSyncMeta({
            ...meta,
            lastSyncedAt: now,
            lastPulledUpdatedAt: now,
            lastLocalHash: local.hash,
        });
        setStatus({ busy: false, lastSyncedAt: now, connected: true, conflict: false, conflictSummary: null });
        return 'pushed';
    } catch (e) {
        handleError('push', e);
        return 'error';
    }
}

// Push auto debouncé : appelé à chaque changement du store (cf câblage App.tsx).
let _pushTimer: ReturnType<typeof setTimeout> | null = null;
const PUSH_DEBOUNCE_MS = 8000;

/**
 * Vrai si un push AUTOMATIQUE (debounce/flush/poll) doit s'ABSTENIR : un conflit non résolu est
 * affiché (un push l'auto-résoudrait en écrasant Drive SANS le choix utilisateur → court-circuit du
 * SyncConflictModal, perte possible côté Drive) ou un blob chiffré attend sa passphrase. Aligné sur la
 * garde de `startDrivePolling`. (Finding money-critical 2026-07-14 : le moteur publie `lastProjection`
 * ~chaque seconde → `schedulePush` partait pendant le conflit et le résolvait tout seul.)
 */
function autoPushBlocked(): boolean {
    return getSyncStatus().conflict || getSyncStatus().needsPassphrase;
}

/** Programme un push après une période d'inactivité (debounce). No-op si non connecté / conflit / passphrase. */
export function schedulePush(): void {
    if (!isGoogleAuthConfigured() || !getSyncStatus().connected) return;
    if (autoPushBlocked()) return; // ne pas armer un push tant qu'un conflit / prompt passphrase est actif
    if (_pushTimer) clearTimeout(_pushTimer);
    _pushTimer = setTimeout(() => {
        _pushTimer = null;
        // Re-teste : un conflit peut survenir PENDANT les 8 s de debounce (pull Drive concurrent).
        if (autoPushBlocked()) return;
        // Ignore si rien n'a changé depuis la dernière sync (les changements d'UI transitoires
        // — onglet actif, mode privé — déclenchent l'abonnement store sans modifier le snapshot).
        if (getLocalPayload().hash === currentMeta().lastLocalHash) return;
        void pushNow();
    }, PUSH_DEBOUNCE_MS);
}

/**
 * Flush IMMÉDIAT du push en attente — à appeler quand l'onglet se masque/ferme (visibilitychange
 * `hidden` / `pagehide`). Garantit que le DERNIER changement atteint Drive avant que l'utilisateur
 * parte, sans attendre le debounce (sinon un changement suivi d'une fermeture rapide ne serait jamais
 * poussé → le connecteur MCP lirait une copie Drive périmée quand Marc parle à Claude). No-op si non
 * connecté, si un conflit/passphrase est en attente, ou si rien n'a changé depuis la dernière sync.
 */
export function flushPush(): void {
    if (!isGoogleAuthConfigured() || !getSyncStatus().connected) return;
    if (autoPushBlocked()) return; // ne JAMAIS court-circuiter un conflit non résolu au masquage d'onglet
    if (_pushTimer) { clearTimeout(_pushTimer); _pushTimer = null; }
    if (getLocalPayload().hash === currentMeta().lastLocalHash) return; // rien de neuf → pas de push
    void pushNow();
}
