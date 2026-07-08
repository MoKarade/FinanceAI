// services/sync/syncOrchestrator.ts
// Orchestration de la sync Google Drive : colle gisAuth + driveAppData + syncEngine + syncState
// au snapshot du store. Toute la logique critique de décision est dans syncEngine (pur, testé) ;
// ici on fait l'I/O, toujours en try/catch (ne JAMAIS crasher l'app pour une erreur de sync).
//
// INERTE tant que VITE_GOOGLE_CLIENT_ID n'est pas configuré (cf gisAuth.isGoogleAuthConfigured).

import { logError } from '../errorLogger';
import {
    configureGoogleAuth,
    isGoogleAuthConfigured,
    requestAccessToken,
    getValidAccessToken,
    revokeAccess,
} from '../googleDrive/gisAuth';
import {
    findSyncFile,
    createSyncFile,
    readSyncFile,
    updateSyncFile,
    deleteSyncFile,
    fetchUserIdentity,
    DriveAuthError,
} from '../googleDrive/driveAppData';
import { encryptApiKeys, decryptApiKeys } from './keyCipher';
import { decideOnLoad, shouldPush, hashPayload, buildEnvelope, buildEncryptedEnvelope } from './syncEngine';
import { getPassphrase, setPassphrase, clearPassphrase, hasPassphrase } from './passphraseStore';
import { encryptBackup, decryptBackup, CloudBackupError } from '../cloudBackup';
import { getOrCreateDeviceId, readSyncMeta, writeSyncMeta, clearSyncMeta } from './syncState';
import { setGateAuthedThisSession, clearGateAuthedThisSession } from './authGate';
import type { SyncEnvelope, SyncMeta } from './syncTypes';
import { saveApiKeys } from '../secureKeyStore';
// [PERF-BUNDLE] import STATIQUE : backupAuto est déjà dans le chunk de BOOT (importé statiquement par
// App.tsx via initAutoBackup) → le dynamic import ne créait aucun chunk séparé (INEFFECTIVE_DYNAMIC_IMPORT).
import { createBackupNow } from '../backupAuto';
import { useFinanceStore } from '../../store/useFinanceStore';
import { hasMeaningfulData } from '../../utils/onboarding';

type ApiKeys = { anthropic: string; finnhub: string };

/** Résultat d'un push — permet à l'UI d'être honnête (toast réel vs « rien à sauvegarder »). */
export type PushResult = 'pushed' | 'skipped-empty' | 'skipped-testmode' | 'not-configured' | 'error';

/** Lit les clés API courantes depuis le store (vide si indispo). Sync v2 (V2-C). */
function currentApiKeys(): ApiKeys {
    try {
        const k = useFinanceStore.getState().apiKeys;
        return { anthropic: k?.anthropic ?? '', finnhub: k?.finnhub ?? '' };
    } catch {
        return { anthropic: '', finnhub: '' };
    }
}

/** Vrai s'il y a au moins une clé à synchroniser (évite d'écrire un objet de clés vides). */
function hasAnyKey(k: ApiKeys): boolean {
    return Boolean(k.anthropic || k.finnhub);
}

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

// Doit correspondre au `name` du persist Zustand (store/useFinanceStore.ts) et à backupAuto.
const STORE_KEY = 'financeai-storage';
// `__APP_VERSION__` est injecté par Vite (define). `typeof` évite un ReferenceError en test
// (où le define n'existe pas) — diagnostic uniquement dans l'enveloppe.
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'web';

// ── Helpers purs (testables) ─────────────────────────────────────────────────

/** Retire défensivement les clés API du snapshot (déjà exclues par le partialize, ceinture+bretelles). */
export function stripApiKeys(snapshot: unknown): unknown {
    if (!snapshot || typeof snapshot !== 'object') return snapshot;
    const obj = snapshot as Record<string, unknown>;
    const state = obj.state as Record<string, unknown> | undefined;
    if (state && 'apiKeys' in state) {
        const { apiKeys: _drop, ...rest } = state;
        return { ...obj, state: rest };
    }
    return snapshot;
}

/**
 * « Vide » = état par défaut d'un appareil neuf / navigation privée (rien à sauvegarder, et surtout
 * rien qui doive écraser Drive). NON-vide dès qu'il y a une vraie donnée utilisateur. La logique
 * « a des données » est partagée avec l'onboarding via `hasMeaningfulData` (source unique : avant,
 * deux listes divergentes faisaient afficher l'onboarding sur des données que la sync refusait
 * d'écraser — revue archi 2026-05-29). Le défaut frais (profil vide + tableaux vides) → « vide ».
 */
export function computeIsEmpty(snapshot: unknown): boolean {
    if (!snapshot || typeof snapshot !== 'object') return true;
    const state = (snapshot as { state?: unknown }).state;
    return !hasMeaningfulData(state as Parameters<typeof hasMeaningfulData>[0]);
}

interface LocalPayload {
    payload: unknown;
    apiKeys: ApiKeys;
    isEmpty: boolean;
    hash: string;
}

function getLocalPayload(): LocalPayload {
    let raw: string | null = null;
    try {
        raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORE_KEY) : null;
    } catch {
        raw = null;
    }
    let parsed: unknown = null;
    if (raw) {
        try {
            parsed = JSON.parse(raw);
        } catch {
            parsed = null;
        }
    }
    const payload = stripApiKeys(parsed);
    const apiKeys = currentApiKeys();
    // Hash de détection-de-changement = PAYLOAD SEUL (pas les clés API). Raison : au gate, les clés
    // ne sont pas encore hydratées (currentApiKeys() = vide tant que App.tsx n'a pas restauré depuis
    // secureKeyStore en async). Les inclure rendrait le hash instable selon le MOMENT du calcul →
    // après un pull+reload, le local paraîtrait « modifié » → push parasite qui EFFACERAIT les clés
    // dans Drive (régression Sync v2). Payload-only = invariant. Les clés restent incluses dans
    // l'enveloppe poussée (cf buildEnvelope) → elles se synchronisent au prochain push de données.
    return { payload, apiKeys, isEmpty: computeIsEmpty(payload), hash: hashPayload(payload) };
}

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
    // Filet : backup local de l'état courant avant d'écraser (réutilise backupAuto).
    try {
        await createBackupNow('auto');
    } catch {
        /* le backup d'assurance est best-effort, on ne bloque pas la restauration */
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
    localStorage.setItem(STORE_KEY, JSON.stringify(payload));
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

// ── Statut observable (pour l'UI) ────────────────────────────────────────────

export interface SyncStatus {
    configured: boolean;
    connected: boolean;
    email: string | null;
    lastSyncedAt: number;
    busy: boolean;
    conflict: boolean;
    error: string | null;
    /**
     * `true` quand un pull a rencontré un blob CHIFFRÉ (`enc:true`) alors qu'aucune passphrase n'est
     * active dans cette session : l'UI doit la demander puis re-puller. Aucune donnée locale n'a été
     * touchée (zéro perte). Repasse à `false` dès qu'un pull aboutit (passphrase fournie) ou qu'on se
     * déconnecte.
     */
    needsPassphrase: boolean;
    /**
     * `true` si une passphrase est active pour cette session (le prochain push chiffrera en `enc:true`).
     * Reflet de `passphraseStore` pour l'UI (afficher l'état + le bon libellé du bouton activer/effacer).
     */
    passphraseActive: boolean;
}

let _status: SyncStatus = {
    configured: false,
    connected: false,
    email: null,
    lastSyncedAt: 0,
    busy: false,
    conflict: false,
    error: null,
    needsPassphrase: false,
    passphraseActive: false,
};
const _listeners = new Set<(s: SyncStatus) => void>();

function setStatus(patch: Partial<SyncStatus>): void {
    _status = { ..._status, ...patch };
    _listeners.forEach((cb) => cb(_status));
}

export function getSyncStatus(): SyncStatus {
    return _status;
}

export function subscribeSyncStatus(cb: (s: SyncStatus) => void): () => void {
    _listeners.add(cb);
    cb(_status);
    return () => _listeners.delete(cb);
}

/**
 * A-t-on DÉJÀ connecté un compte Drive sur cet appareil ? (méta locale présente). Sert à l'app pour
 * ne jamais afficher l'écran d'accueil à un utilisateur de retour, même avant le pull (cf onboarding).
 */
export function hasConnectedBefore(): boolean {
    return !!readSyncMeta()?.connectedEmail;
}

// ── Cycle de vie ─────────────────────────────────────────────────────────────

/** À appeler au boot : configure le Client ID et publie l'état initial (a-t-on déjà connecté ?). */
export function initSync(clientId: string | undefined | null): void {
    configureGoogleAuth(clientId);
    const meta = readSyncMeta();
    setStatus({
        configured: isGoogleAuthConfigured(),
        email: meta?.connectedEmail ?? null,
        lastSyncedAt: meta?.lastSyncedAt ?? 0,
        // Réhydrate l'état passphrase depuis sessionStorage (survit à un reload de page).
        passphraseActive: hasPassphrase(),
    });
}

function currentMeta(): SyncMeta {
    return (
        readSyncMeta() ?? {
            connectedEmail: _status.email,
            lastSyncedAt: 0,
            lastPulledUpdatedAt: 0,
            lastLocalHash: '',
            deviceId: getOrCreateDeviceId(),
        }
    );
}

/** Lit l'enveloppe Drive (ou null). Rafraîchit le token une fois sur 401. */
async function readDrive(token: string): Promise<SyncEnvelope | null> {
    const ref = await findSyncFile(token);
    if (!ref) return null;
    return readSyncFile(token, ref.id);
}

/**
 * Récupère le `sub` Google (id stable) qui sert à chiffrer/déchiffrer les clés API (keyCipher).
 * Depuis la meta si déjà connu (cas normal : écrit au login) ; sinon fetch via le token et persiste.
 * `null` si indispo (userinfo HS) → l'appelant ne chiffrera pas (clés non synchronisées plutôt qu'en clair).
 */
async function resolveSub(token: string): Promise<string | null> {
    const existing = currentMeta().connectedSub;
    if (existing) return existing;
    try {
        const { sub } = await fetchUserIdentity(token);
        if (sub) writeSyncMeta({ ...currentMeta(), connectedSub: sub });
        return sub;
    } catch {
        return null;
    }
}

/** Pousse le payload local vers Drive (create ou update) et met à jour la meta. */
export async function pushNow(): Promise<PushResult> {
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
                    } catch {
                        /* crypto indispo → push sans clés (jamais de clés en clair dans Drive) */
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
                } catch { /* best-effort */ }
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
        setStatus({ busy: false, lastSyncedAt: now, connected: true, conflict: false });
        return 'pushed';
    } catch (e) {
        handleError('push', e);
        return 'error';
    }
}

// Push auto debouncé : appelé à chaque changement du store (cf câblage App.tsx).
let _pushTimer: ReturnType<typeof setTimeout> | null = null;
const PUSH_DEBOUNCE_MS = 8000;

/** Programme un push après une période d'inactivité (debounce). No-op si non connecté. */
export function schedulePush(): void {
    if (!isGoogleAuthConfigured() || !_status.connected) return;
    if (_pushTimer) clearTimeout(_pushTimer);
    _pushTimer = setTimeout(() => {
        _pushTimer = null;
        // Ignore si rien n'a changé depuis la dernière sync (les changements d'UI transitoires
        // — onglet actif, mode privé — déclenchent l'abonnement store sans modifier le snapshot).
        if (getLocalPayload().hash === currentMeta().lastLocalHash) return;
        void pushNow();
    }, PUSH_DEBOUNCE_MS);
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
        setStatus({ conflict: false, needsPassphrase: false });
        await applyPulledPayload(effectivePayload, restoredKeys); // réhydrate le store EN PLACE (pas de reload)
        // Le pull réussi DOIT retomber busy:false : sinon le spinner « Synchronisation… » reste figé
        // après une restauration (applyPulledPayload ne touche pas au statut). Bug : seuls les chemins
        // early-return (drive null) et erreur (handleError) remettaient busy:false. (EPIC 1, 2026-06.)
        setStatus({ busy: false, connected: true, lastSyncedAt: syncedAt });
    } catch (e) {
        handleError('pull', e);
    }
}

/**
 * Connexion interactive (clic utilisateur) : consentement Google, récupère l'email,
 * puis exécute la décision de sync initiale.
 */
export async function connectAndSync(): Promise<void> {
    if (!isGoogleAuthConfigured()) return;
    setStatus({ busy: true, error: null });
    try {
        const token = await requestAccessToken(true);
        const { email, sub } = await fetchUserIdentity(token); // sub → clé de chiffrement des clés API
        const meta = currentMeta();
        writeSyncMeta({ ...meta, connectedEmail: email, connectedSub: sub ?? meta.connectedSub ?? null });
        setStatus({ connected: true, email });
        // La restauration réhydrate en place (pas de reload). Le flag sert de filet : si un reload
        // survient (rehydrate en échec, ou refresh manuel), le gate ne re-bloque pas sur le login.
        setGateAuthedThisSession();
        await runDecision(token, true); // login explicite → intention de restauration
    } catch (e) {
        handleError('connect', e);
    }
}

/**
 * R2 — reprise SILENCIEUSE pour le gate de login : réutilise un jeton Google DÉJÀ EN CACHE (mémoire
 * ou sessionStorage, survit à un reload tant que l'onglet reste ouvert et que le jeton n'a pas
 * expiré ~1 h). Si présent, on récupère l'email, met à jour la meta et exécute la décision de sync
 * (→ pull auto si le local est vide → restauration « tout automatique »).
 *
 * N.B. : il n'y a PLUS de renouvellement réseau silencieux (GIS est popup-only → un popup au boot
 * sans geste utilisateur échouait avec `popup_failed_to_open`). Sans jeton en cache valide, on
 * retourne `false` et le gate montre le bouton « Se connecter » (clic = geste → popup autorisé).
 *
 * Retourne `true` si authentifié (le gate rend l'app), `false` sinon. Ne lève jamais : un échec
 * silencieux est le cas NORMAL (1er accès, ou jeton expiré/onglet rouvert).
 */
export async function gateSilentResume(): Promise<boolean> {
    if (!isGoogleAuthConfigured()) return false;
    setStatus({ busy: true, error: null });
    try {
        const token = await getValidAccessToken(); // cache-only : rejette si pas de jeton valide en cache
        const { email, sub } = await fetchUserIdentity(token); // sub → clé de chiffrement des clés API
        const meta = currentMeta();
        writeSyncMeta({ ...meta, connectedEmail: email, connectedSub: sub ?? meta.connectedSub ?? null });
        setStatus({ connected: true, email });
        setGateAuthedThisSession(); // filet si un reload survient → pas de 2e écran de login
        await runDecision(token, true); // reprise au gate → intention de restauration (pull si Drive a des données)
        return true;
    } catch {
        // Échec silencieux attendu (pas de session / pas de consentement) → cas nominal au 1er
        // accès, pas un bug. Le gate basculera sur le login interactif.
        setStatus({ busy: false, connected: false });
        return false;
    }
}

/** Sync au boot (silencieux) si l'utilisateur a déjà connecté Drive. Ne bloque jamais l'app. */
export async function runBootSync(): Promise<void> {
    if (!isGoogleAuthConfigured()) return;
    const meta = readSyncMeta();
    if (!meta?.connectedEmail) return; // jamais connecté → rien au boot
    // 1) Jeton silencieux (cache only — cf gisAuth : pas de popup au boot). Un échec ICI est le cas
    //    NORMAL après expiration du jeton (~1 h) : reprise silencieuse impossible sans geste utilisateur.
    //    On le traite comme un no-op SANS journaliser d'erreur (sinon bruit à chaque boot + faux
    //    positifs dans SystemView). L'utilisateur recliquera « Connecter ».
    let token: string;
    try {
        token = await getValidAccessToken();
    } catch {
        setStatus({ connected: false });
        return;
    }
    // 2) Le jeton est en main → une erreur APRÈS (lecture/écriture Drive) est, elle, anormale → handleError.
    try {
        setStatus({ connected: true });
        await runDecision(token, false); // boot normal (hors gate) → garde anti-perte stricte
    } catch (e) {
        setStatus({ connected: false });
        if (!(e instanceof DriveAuthError)) handleError('boot', e);
    }
}

// Garde anti-réentrance. Au boot avec le gate actif, `gateSilentResume` ET `runBootSync` (T+2.5 s)
// peuvent déclencher `runDecision` quasi en même temps. Sans verrou, deux décisions se chevauchent →
// double pull/rehydrate, voire double `createSyncFile` (fichier Drive en double). On déduplique : un
// appel concurrent réutilise la décision déjà en vol (revue archi 2026-05-29).
let _decisionInFlight: Promise<void> | null = null;

/**
 * Applique decideOnLoad puis exécute l'action résultante.
 * `restoreIntent` = login PAR LE GATE (l'utilisateur se connecte pour récupérer son compte) : sur un
 * appareil jamais synchronisé, Drive gagne (restaure) au lieu de bloquer sur un faux « conflit ».
 * Au boot normal (`false`), on garde la garde anti-perte stricte.
 */
async function runDecision(token: string, restoreIntent = false): Promise<void> {
    if (_decisionInFlight) return _decisionInFlight; // une décision concurrente est déjà en cours
    const run = (async () => {
        setStatus({ busy: true, error: null });
        const drive = await readDrive(token);
        const local = getLocalPayload();
        const meta = currentMeta();
        const decision = decideOnLoad({
            drive,
            localIsEmpty: local.isEmpty,
            localHash: local.hash,
            meta,
            restoreIntent,
        });
        switch (decision.action) {
            case 'pull':
                await pullNow();
                break;
            case 'push':
                await pushNow();
                break;
            case 'conflict':
                setStatus({ busy: false, conflict: true });
                break;
            case 'noop':
            default:
                setStatus({ busy: false, conflict: false });
                break;
        }
    })();
    _decisionInFlight = run;
    try {
        await run;
    } finally {
        _decisionInFlight = null;
    }
}

/** Résolution de conflit par l'utilisateur : garder le local (push) ou garder Drive (pull). */
export async function resolveConflict(keep: 'local' | 'drive'): Promise<void> {
    setStatus({ conflict: false });
    if (keep === 'local') await pushNow();
    else await pullNow();
}

// ── Polling Drive (rafraîchissement « fluide ») ──────────────────────────────
let _pollTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Sonde Drive périodiquement + au retour sur l'onglet → l'app reflète SEULE les changements (ex.
 * un document rangé par le connecteur MCP) sans rouvrir/rafraîchir. Réutilise `runBootSync`
 * (decideOnLoad + anti-réentrance) : sync BIDIRECTIONNELLE sûre, jamais d'écrasement (conflit explicite
 * si les deux ont divergé). Ne fait rien tant qu'on n'est pas connecté/occupé/en conflit/passphrase.
 * Renvoie une fonction de nettoyage.
 */
export function startDrivePolling(opts?: { intervalMs?: number }): () => void {
    const intervalMs = opts?.intervalMs ?? 60_000;
    const tick = (): void => {
        if (_status.busy || _status.conflict || _status.needsPassphrase) return;
        void runBootSync(); // garde anti-perte interne ; no-op si jamais connecté
    };
    const onFocus = (): void => {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
        tick();
    };
    if (_pollTimer) clearInterval(_pollTimer);
    _pollTimer = setInterval(tick, intervalMs);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onFocus);
    if (typeof window !== 'undefined') window.addEventListener('focus', onFocus);
    return () => {
        if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
        if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onFocus);
        if (typeof window !== 'undefined') window.removeEventListener('focus', onFocus);
    };
}

/** Longueur minimale de passphrase — DOIT rester alignée sur `checkPassphrase` de cloudBackup. */
export const MIN_PASSPHRASE_LENGTH = 12;

export type SetPassphraseResult = 'too-short' | 'set' | 'set-and-pulled';

/**
 * Active/définit la passphrase optionnelle de sync (D-3). Validée ici (≥12 caractères) pour un retour
 * immédiat à l'UI, en cohérence avec `encryptBackup`. Effets :
 *  - stocke le secret en SESSION (mémoire + sessionStorage), jamais en localStorage ni dans Drive ;
 *  - si un pull attendait la passphrase (`needsPassphrase`), RE-PULLE aussitôt pour déchiffrer ;
 *  - sinon, ne touche pas à Drive : le PROCHAIN push ré-écrira le blob en `enc:true` (cycle de migration).
 *
 * NE déclenche PAS de push automatique : laisser l'utilisateur (ou l'auto-push debouncé) pousser évite
 * de ré-écrire Drive juste pour avoir tapé une passphrase, et garde le contrôle côté utilisateur.
 */
export async function setSyncPassphrase(passphrase: string): Promise<SetPassphraseResult> {
    if (typeof passphrase !== 'string' || passphrase.length < MIN_PASSPHRASE_LENGTH) {
        return 'too-short';
    }
    const wasWaiting = _status.needsPassphrase;
    setPassphrase(passphrase);
    setStatus({ passphraseActive: true, error: null });
    if (wasWaiting) {
        // Un blob chiffré attendait : on re-pull pour le déchiffrer maintenant qu'on a le secret.
        // pullNow remet `needsPassphrase:false` en cas de succès, ou le laisse vrai + message clair
        // si la passphrase est fausse (données locales intactes dans tous les cas).
        await pullNow();
        return 'set-and-pulled';
    }
    return 'set';
}

/**
 * Efface la passphrase de session → le prochain push REVIENT au format EN CLAIR (`enc:false`).
 * Les données LOCALES ne sont pas touchées. Si un blob chiffré était en attente, le drapeau
 * `needsPassphrase` est levé (sans passphrase, on ne peut plus le lire — état cohérent pour l'UI).
 */
export function clearSyncPassphrase(): void {
    clearPassphrase();
    setStatus({ passphraseActive: false });
}

export type RemovePassphraseResult = 'removed' | 'removed-and-republished';

/**
 * RETIRE la passphrase ET re-publie aussitôt le coffre EN CLAIR (`enc:false`) si on est connecté et
 * déverrouillé. Sinon, effacer seulement le secret local laisserait le blob Drive `enc:true` → la
 * passphrase « reviendrait » sur un autre appareil (re-prompt). Marc : « pas de passphrase, juste mon
 * compte Google » → on rend le Drive non chiffré immédiatement. `pushNow` garde l'anti-vide/anti-test.
 */
export async function removeSyncPassphrase(): Promise<RemovePassphraseResult> {
    clearSyncPassphrase();
    if (_status.connected && !_status.needsPassphrase && isGoogleAuthConfigured()) {
        await pushNow(); // ré-écrit le blob en clair (le secret est déjà purgé → enc:false)
        return 'removed-and-republished';
    }
    return 'removed';
}

/** Déconnexion : révoque le token et efface la meta de sync. */
export function disconnectSync(): void {
    revokeAccess();
    clearSyncMeta();
    clearGateAuthedThisSession(); // re-demande le login au prochain accès (sinon le gate serait sauté)
    // La passphrase est un secret de SESSION : on la purge à la déconnexion (sinon elle resterait
    // déchiffrer un blob d'un autre compte reconnecté dans le même onglet).
    clearPassphrase();
    setStatus({ connected: false, email: null, conflict: false, lastSyncedAt: 0, needsPassphrase: false });
}

/**
 * Supprime le blob de sync dans le Drive de l'utilisateur, puis déconnecte (révoque + efface meta).
 * Donne à l'utilisateur le contrôle total sur ses données cloud (important sans chiffrement E2E).
 * Les données LOCALES (cet appareil) ne sont pas touchées.
 */
export async function deleteRemoteData(): Promise<void> {
    if (!isGoogleAuthConfigured()) return;
    setStatus({ busy: true, error: null });
    try {
        const token = await getValidAccessToken();
        const ref = await findSyncFile(token);
        if (ref) await deleteSyncFile(token, ref.id);
        revokeAccess();
        clearSyncMeta();
        clearPassphrase(); // secret de session purgé avec la déconnexion qui suit la suppression
        setStatus({ busy: false, connected: false, email: null, conflict: false, lastSyncedAt: 0, needsPassphrase: false });
    } catch (e) {
        handleError('delete', e);
    }
}

function handleError(phase: string, e: unknown): void {
    const message = e instanceof Error ? e.message : String(e);
    setStatus({ busy: false, error: `Sync (${phase}) : ${message}` });
    logError({
        source: 'storage',
        severity: 'warning',
        message: `Sync Google Drive échouée (${phase})`,
        error: e instanceof Error ? e : new Error(message),
    });
}
