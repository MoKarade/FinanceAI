// services/sync/syncLifecycle.ts
// [ARCH-SYNC-SPLIT] Cycle de vie de la sync : boot/connexion/reprise gate/décision/conflit/déconnexion.
// Possède `_decisionInFlight` (anti-réentrance de la décision de boot). Le SWITCH `runDecision` porte
// la garde ANTI-CLOBBER (Marc 2026-07-14 : plus de `restoreIntent` ; local réel + Drive divergent →
// `conflict`, JAMAIS d'écrasement auto). Orchestre push (syncPush) + pull (syncPull). Importé par :
// App.tsx (initSync/runBootSync/hasConnectedBefore), LoginGate (initSync/gateSilentResume/connectAndSync),
// syncPolling (runBootSync), les cartes de réglages (connect/disconnect/deleteRemoteData/resolveConflict).

import {
    configureGoogleAuth,
    isGoogleAuthConfigured,
    requestAccessToken,
    getValidAccessToken,
    renewTokenSilently,
    revokeAccess,
    traceSilentAuthFailure,
    AuthInteractionRequiredError,
} from '../googleDrive/gisAuth';
import { isInactivityExpired, recordActivity, clearActivity } from './inactivityLogout';

/**
 * [Finding panel silent-failure] Reprise silencieuse au boot : un échec par « interaction requise »
 * (pas de session Google) est NOMINAL → silence. Un échec ANORMAL (script GIS injoignable, timeout
 * réseau) doit laisser une trace (`logError` warning) — sinon un boot pendant une panne réseau renvoie
 * au login SANS trace, indiscernable d'un « jamais connecté » (classe GATE-SILENT-DRIVE). Retourne le
 * jeton, ou (`token: null`) si la reprise a échoué — avec `interactionRequired` pour que l'appelant
 * distingue l'échec DÉFINITIF (session Google absente : seule une reconnexion manuelle débloquera)
 * d'un raté TRANSITOIRE (réseau/GIS) que le tick suivant peut résorber tout seul.
 */
async function trySilentReauth(
    phase: 'gate' | 'boot',
): Promise<{ token: string | null; interactionRequired: boolean }> {
    try {
        return { token: await renewTokenSilently(), interactionRequired: false };
    } catch (e) {
        // [AUTH-DRIVE-STILL-RECONNECT] Une seule voie : le helper dérive la sévérité (NOMINAL « pas de
        // session Google » → `info` ; anormal réseau/GIS → `warning` + stack) et throttle par raison.
        // La raison GIS exacte diagnostique POURQUOI la reconnexion est redemandée, visible dans Diagnostics.
        traceSilentAuthFailure(phase, e);
        return { token: null, interactionRequired: e instanceof AuthInteractionRequiredError };
    }
}

// [AUTH-DRIVE-BANNER-FLICKER] Ticks de sync ÉCHOUÉS consécutifs pour une cause TRANSITOIRE côté
// polling (`runBootSync`, tick 60 s + retour d'onglet) — renouvellement silencieux raté (réseau/GIS)
// OU erreur Drive post-jeton non-401 (timeout, 500). Un raté isolé (réveil de veille, Wi-Fi qui
// remonte) ne doit PAS afficher « Non connecté — tes changements ne sont PAS sauvegardés » : le
// message serait faux (rien n'a été perdu, le tick suivant retente et réussit) et c'est exactement la
// bannière-qui-clignote signalée par Marc. On ne bascule `connected:false` qu'après N échecs
// consécutifs (~N min : la panne DURE, la bannière dit alors vrai — plus rien n'est sauvegardé depuis
// N ticks) — ou IMMÉDIATEMENT quand l'échec est définitif (`AuthInteractionRequiredError` : session
// Google morte ; 401 `DriveAuthError` : jeton rejeté — seule une reconnexion manuelle débloquera).
// La série n'est close que par un tick COMPLET réussi (jeton + décision), une connexion explicite, ou
// une déconnexion. [Finding silent-failure #542 §2] Sans le volet « erreur Drive qui persiste », une
// panne Drive durable restait invisible hors de Réglages (la bannière n'affiche que déconnexion/push).
let _transientSyncFailStreak = 0;
const TRANSIENT_SYNC_FAIL_GRACE = 3;

/** Un tick de sync a échoué pour une cause transitoire : bascule la bannière si la panne DURE. */
function noteTransientSyncFailure(): void {
    _transientSyncFailStreak++;
    if (_transientSyncFailStreak >= TRANSIENT_SYNC_FAIL_GRACE) setStatus({ connected: false });
}
import {
    findSyncFile,
    deleteSyncFile,
    fetchUserIdentity,
    DriveAuthError,
} from '../googleDrive/driveAppData';
import { decideOnLoad } from './syncEngine';
import { hasPassphrase, clearPassphrase } from './passphraseStore';
import { readSyncMeta, writeSyncMeta, clearSyncMeta } from './syncState';
import { setGateAuthedThisSession, clearGateAuthedThisSession } from './authGate';
import { setStatus, getSyncStatus } from './syncStatusStore';
import { getLocalPayload, summarizeForConflict } from './syncSnapshot';
import { currentMeta, readDrive } from './syncMeta';
import { handleError } from './syncErrors';
import { pushNow } from './syncPush';
import { pullNow } from './syncPull';
import { deleteAllChatAttachmentsFromDrive, resetAttachmentDriveMemos } from '../aiChat/attachmentDriveStore';
import { clearAttachmentCache } from '../aiChat/attachments';

/**
 * A-t-on DÉJÀ connecté un compte Drive sur cet appareil ? (méta locale présente). Sert à l'app pour
 * ne jamais afficher l'écran d'accueil à un utilisateur de retour, même avant le pull (cf onboarding).
 */
export function hasConnectedBefore(): boolean {
    return !!readSyncMeta()?.connectedEmail;
}

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
        // [BUDGET-DRIVE-BANNER-FLASH] RIEN à reprendre (jamais connecté ici, ou Drive non configuré)
        // → réglé d'entrée, la bannière peut parler tout de suite. Sinon on attend la tentative.
        // ⚠️ MONOTONE (`|| déjà réglé`) : `initSync` est appelé DEUX fois au boot (LoginGate puis App),
        // et sans ce OR le second appel ANNULERAIT le règlement obtenu par `gateSilentResume` — la
        // bannière repartirait pour 2,5 s de silence chez quelqu'un qu'on sait déconnecté.
        resumeSettled: getSyncStatus().resumeSettled || !isGoogleAuthConfigured() || !meta?.connectedEmail,
    });
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
        recordActivity(); // [AUTH-DRIVE-INACTIVITY] la connexion démarre le compte à rebours 8h
        _transientSyncFailStreak = 0; // [AUTH-DRIVE-BANNER-FLICKER] reconnexion explicite → série close
        const { email, sub } = await fetchUserIdentity(token); // sub → clé de chiffrement des clés API
        const meta = currentMeta();
        writeSyncMeta({ ...meta, connectedEmail: email, connectedSub: sub ?? meta.connectedSub ?? null });
        setStatus({ connected: true, email });
        // La restauration réhydrate en place (pas de reload). Le flag sert de filet : si un reload
        // survient (rehydrate en échec, ou refresh manuel), le gate ne re-bloque pas sur le login.
        setGateAuthedThisSession();
        // Garde anti-perte STRICTE (plus de « restoreIntent » qui faisait gagner Drive) : si cet
        // appareil a des données réelles ET Drive diverge → `conflict` (choix utilisateur), jamais
        // d'écrasement auto. Le cas « nouvel appareil, je restaure » (local vide) → pull automatique.
        await runDecision(token);
    } catch (e) {
        handleError('connect', e);
    }
}

/**
 * R2 — reprise SILENCIEUSE pour le gate de login : réutilise un jeton Google DÉJÀ EN CACHE (mémoire
 * ou localStorage — depuis AUTH-DRIVE-PERSIST 2026-07-16, survit reload / fermeture d'onglet). Si
 * présent et non expiré, on récupère l'email, met à jour la meta et exécute la décision de sync
 * (→ pull auto si le local est vide → restauration « tout automatique »).
 *
 * N.B. : AU BOOT on ne tente jamais de popup ni de réseau (GIS est popup-only → un popup sans geste
 * échouerait avec `popup_failed_to_open`). Le renouvellement réseau silencieux existe désormais
 * (`gisAuth.scheduleTokenRenewal`) mais est réservé au MINUTEUR post-login (onglet vivant), pas au
 * boot. Sans jeton en cache valide, on retourne `false` et le gate montre « Se connecter » (clic =
 * geste → popup autorisé).
 *
 * Retourne `true` si authentifié (le gate rend l'app), `false` sinon. Ne lève jamais : un échec
 * silencieux est le cas NORMAL (1er accès, ou jeton expiré/onglet rouvert).
 */
export async function gateSilentResume(): Promise<boolean> {
    // [BUDGET-DRIVE-BANNER-FLASH] Même raison que `runBootSync` : cette fonction a six sorties, et
    // c'est elle qui tranche EN PREMIER au boot (LoginGate). Quel que soit le verdict, la question
    // « est-on connecté ? » cesse d'être sans réponse ici.
    try {
        return await gateSilentResumeInner();
    } finally {
        setStatus({ resumeSettled: true });
    }
}

async function gateSilentResumeInner(): Promise<boolean> {
    if (!isGoogleAuthConfigured()) return false;
    // [AUTH-DRIVE-INACTIVITY] Au-delà de 8h sans activité : NE PAS reprendre silencieusement → borne de
    // session (Loi 25). On purge tout jeton résiduel et on renvoie au login (clic pour se reconnecter).
    if (isInactivityExpired()) {
        revokeAccess();
        setStatus({ busy: false, connected: false });
        return false;
    }
    setStatus({ busy: true, error: null });
    // 1) Jeton silencieux (cache d'abord). Actif < 8h → si le cache est vide/expiré, on tente une ré-auth
    //    SILENCIEUSE RÉSEAU (prompt='' → PAS de popup ; réussit tant que la session Google est valide).
    //    C'est le changement demandé par Marc (2026-07-22 : « je veux plus me reconnecter à chaque fois »).
    //    Échec = cas NORMAL (session Google absente/cookies tiers bloqués) → no-op SANS journaliser, le gate
    //    montre « Se connecter ». ⚠️ prompt='' ne lève JAMAIS de popup au boot (contrairement à 'consent').
    let token: string;
    try {
        token = await getValidAccessToken(); // cache-only : rejette si pas de jeton valide en cache
    } catch {
        // Cache vide/expiré → ré-auth silencieuse réseau (prompt='', sans popup). Échec anormal tracé.
        // (Pas de grâce ici : le gate doit trancher « app ou login » MAINTENANT — montrer le login sur
        // un raté transitoire est le comportement sûr, et un clic le résout.)
        const renewed = await trySilentReauth('gate');
        if (renewed.token === null) {
            setStatus({ busy: false, connected: false });
            return false;
        }
        token = renewed.token;
    }
    // [Finding panel sécurité CRITIQUE] NE PAS recordActivity ici : une reprise silencieuse (déclenchée
    // aussi par le POLLING toutes les 60s, cf startDrivePolling) n'est PAS une interaction utilisateur.
    // Sinon le polling réarme l'horloge en boucle et la déconnexion 8h ne se déclenche JAMAIS. Seuls un
    // vrai geste DOM (onActivity) et une connexion explicite (connectAndSync) avancent `lastActivity`.
    // 2) Le jeton est en main → une erreur APRÈS (identité/lecture Drive, ex. TIMEOUT réseau) est ANORMALE :
    //    on la ROUTE via handleError (→ logError + status.error) au lieu de l'avaler en silence comme un
    //    « pas de session ». Sinon un Drive injoignable renvoyait l'utilisateur au login SANS trace ni message,
    //    indiscernable d'un 1er accès (finding silent-failure 2026-07-16 ; symétrie avec runBootSync). On
    //    conserve le retour `false` (le gate montre le login) — la décision de rendre l'app malgré une sync en
    //    échec reste un choix UX distinct (non pris ici, zone gate sensible).
    try {
        const { email, sub } = await fetchUserIdentity(token); // sub → clé de chiffrement des clés API
        const meta = currentMeta();
        writeSyncMeta({ ...meta, connectedEmail: email, connectedSub: sub ?? meta.connectedSub ?? null });
        setStatus({ connected: true, email });
        setGateAuthedThisSession(); // filet si un reload survient → pas de 2e écran de login
        await runDecision(token); // garde anti-perte stricte (local vide → pull ; local réel divergent → conflict)
        return true;
    } catch (e) {
        setStatus({ busy: false, connected: false });
        // [AUTH-DRIVE-STILL-RECONNECT] Un 401 Drive (jeton accepté par GIS mais rejeté par l'API :
        // scope révoqué en amont, Drive désactivé) était TOTALEMENT muet (finding silent-failure PR
        // #504) → même surface « reconnexion redemandée » que le renouvellement : tracé aussi, sinon
        // Diagnostics n'explique rien et Marc rouvre le même ticket. Le reste (anormal) → handleError.
        if (e instanceof DriveAuthError) traceSilentAuthFailure('gate', e);
        else handleError('boot', e);
        return false;
    }
}

// [AUTH-DRIVE-BANNER-FLICKER, finding code-reviewer #542] Garde de réentrance de runBootSync : au
// retour d'onglet, `visibilitychange` ET `focus` (syncPolling attache le même handler aux deux) tirent
// deux runBootSync quasi simultanés, et la garde `busy` du polling ne couvre PAS la phase jeton
// (busy n'est posé que dans runDecision). Sans verrou, UN événement logique (alt-tab pendant un hoquet
// réseau) incrémentait `_transientSyncFailStreak` DEUX fois (prouvé par sonde : bannière dès 2 retours
// d'onglet au lieu de 3 ticks) et deux `renewTokenSilently` concurrents se marchaient dessus dans
// gisAuth (`_pendingReject` singleton → le perdant tombe en timeout). Un appel concurrent réutilise le
// tick en vol — même modèle que `_decisionInFlight`.
let _bootSyncInFlight: Promise<void> | null = null;

/** Sync au boot (silencieux) si l'utilisateur a déjà connecté Drive. Ne bloque jamais l'app. */
export function runBootSync(): Promise<void> {
    if (_bootSyncInFlight) return _bootSyncInFlight;
    // [BUDGET-DRIVE-BANNER-FLASH] `finally` et pas un point de sortie choisi : `runBootSyncTick` a SEPT
    // sorties (non configuré, jamais connecté, inactivité, jeton définitivement perdu, transitoire,
    // succès, erreur Drive). En régler une seule laisserait la bannière muette pour toujours sur les
    // autres — un correctif qui MASQUE une alerte est pire que le clignotement qu'il corrige.
    const run = runBootSyncTick().finally(() => {
        _bootSyncInFlight = null;
        setStatus({ resumeSettled: true });
    });
    _bootSyncInFlight = run;
    return run;
}

async function runBootSyncTick(): Promise<void> {
    if (!isGoogleAuthConfigured()) return;
    const meta = readSyncMeta();
    if (!meta?.connectedEmail) return; // jamais connecté → rien au boot
    // [AUTH-DRIVE-INACTIVITY] > 8h d'inactivité → pas de reprise silencieuse (borne de session).
    if (isInactivityExpired()) {
        revokeAccess();
        setStatus({ connected: false });
        return;
    }
    // 1) Jeton silencieux (cache d'abord ; sinon ré-auth silencieuse réseau prompt='' — pas de popup).
    //    Échec = cas NORMAL (session Google absente) → no-op SANS journaliser. Actif < 8h → on tente le
    //    réseau silencieux pour rester connecté sans reconnexion (demande Marc 2026-07-22).
    let token: string;
    try {
        token = await getValidAccessToken();
    } catch {
        const renewed = await trySilentReauth('boot');
        if (renewed.token === null) {
            // [AUTH-DRIVE-BANNER-FLICKER] Définitif (interaction requise) → bannière IMMÉDIATE : elle
            // dit vrai, seule une reconnexion manuelle débloquera. Transitoire (réseau/GIS) → GRÂCE :
            // on garde l'état affiché tel quel et le tick suivant (60 s) retente ; on ne bascule la
            // bannière qu'après N ratés consécutifs (panne qui dure = il faut le dire honnêtement).
            if (renewed.interactionRequired) {
                _transientSyncFailStreak = 0;
                setStatus({ connected: false });
            } else {
                noteTransientSyncFailure();
            }
            return;
        }
        token = renewed.token;
    }
    // [Finding panel sécurité CRITIQUE] Idem gateSilentResume : le polling appelle runBootSync toutes
    // les 60s → ne PAS recordActivity ici (sinon l'horloge d'inactivité ne vieillit jamais).
    // 2) Le jeton est en main → une erreur APRÈS (lecture/écriture Drive) est, elle, anormale → handleError.
    try {
        setStatus({ connected: true });
        await runDecision(token); // garde anti-perte stricte (identique au gate désormais)
        _transientSyncFailStreak = 0; // tick COMPLET réussi (jeton + décision) → la série est close
    } catch (e) {
        // [AUTH-DRIVE-BANNER-FLICKER] Un jeton VALIDE + une erreur Drive transitoire (timeout, réseau
        // au réveil de veille) ≠ « non connecté ». L'ancien `connected:false` inconditionnel ici était
        // la 1ʳᵉ cause de la bannière qui clignote : chaque hoquet réseau du polling 60 s affichait
        // « tes changements ne sont PAS sauvegardés » (faux — le jeton est bon, le tick suivant
        // synchronise). On ne déconnecte IMMÉDIATEMENT que si l'API Drive REJETTE le jeton (401
        // `DriveAuthError` : scope révoqué, vraie perte d'accès) ; le reste est routé handleError
        // (trace + status.error, visible dans Diagnostics) en RESTANT connecté — MAIS compté dans la
        // série [finding silent-failure #542 §2] : une panne Drive qui PERSISTE (N ticks) finit par
        // basculer la bannière, sinon « plus rien ne se sauvegarde » resterait invisible hors Réglages.
        if (e instanceof DriveAuthError) {
            _transientSyncFailStreak = 0;
            setStatus({ connected: false, busy: false }); // busy:false : sinon le polling reste gelé (skip si busy)
            traceSilentAuthFailure('boot', e);
        } else {
            handleError('boot', e);
            noteTransientSyncFailure();
        }
    }
}

// Garde anti-réentrance. Au boot avec le gate actif, `gateSilentResume` ET `runBootSync` (T+2.5 s)
// peuvent déclencher `runDecision` quasi en même temps. Sans verrou, deux décisions se chevauchent →
// double pull/rehydrate, voire double `createSyncFile` (fichier Drive en double). On déduplique : un
// appel concurrent réutilise la décision déjà en vol (revue archi 2026-05-29).
let _decisionInFlight: Promise<void> | null = null;

/**
 * Applique decideOnLoad puis exécute l'action résultante. UNE seule règle anti-perte (plus de
 * `restoreIntent`/exception gate) : local vide → pull (restaure) ; local réel + Drive divergent →
 * `conflict` (choix utilisateur via SyncConflictModal), JAMAIS d'écrasement auto. Retrait 2026-07-14
 * (anti-clobber Marc : une vieille copie Drive écrasait 230k$ de local réel à la reconnexion).
 */
async function runDecision(token: string): Promise<void> {
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
        });
        switch (decision.action) {
            case 'pull':
                await pullNow();
                break;
            case 'push':
                await pushNow();
                break;
            case 'conflict':
                // Divergence réelle → JAMAIS d'écrasement auto. On expose un RÉSUMÉ (nb de placements/
                // transactions de chaque côté + date Drive) pour que l'utilisateur choisisse sans se
                // tromper (anti-clobber Marc 2026-07-14 : voir « cet appareil : 15 placements » vs
                // « Drive : 1 placement, il y a 3 mois » évite de restaurer une vieille copie pauvre).
                setStatus({
                    busy: false,
                    conflict: true,
                    conflictSummary: {
                        local: summarizeForConflict(local.payload),
                        drive: {
                            // Blob chiffré → payload illisible (null) → comptes 0 non significatifs :
                            // on marque `encrypted` pour que le modal affiche « contenu inconnu ».
                            ...summarizeForConflict(drive?.enc ? null : drive?.payload),
                            updatedAt: drive?.updatedAt ?? 0,
                            encrypted: Boolean(drive?.enc),
                        },
                    },
                });
                break;
            case 'noop':
            default:
                setStatus({ busy: false, conflict: false, conflictSummary: null });
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
    // On n'efface PAS le conflit d'avance : pushNow/pullNow remettent `conflict:false` eux-mêmes AU
    // SUCCÈS, et laissent le conflit AFFICHÉ en cas d'échec (réseau) → le choix explicite « garder cet
    // appareil » / « restaurer Drive » n'est jamais annulé en silence (finding silent-failure 2026-07-14 :
    // avant, un pull raté effaçait quand même le conflit, l'utilisateur retombait sur la bannière générique).
    if (keep === 'local') await pushNow();
    else await pullNow();
}

/**
 * [AUTH-DRIVE-INACTIVITY] Déconnexion AUTOMATIQUE après 8h d'inactivité (déclenchée par le minuteur de
 * `inactivityLogout`). Révoque le jeton (arrête le renouvellement + la sync) MAIS garde la meta
 * (`connectedEmail`) → reconnexion facile en un clic, pas de ré-onboarding, et l'anti-clobber (conflict,
 * jamais d'écrasement) protège déjà la reconnexion. La bannière `SyncStatusBanner` (déconnecté + données)
 * invite alors à se reconnecter. Distinct de `disconnectSync` (déconnexion MANUELLE, qui efface la meta).
 */
export function handleInactivityLogout(): void {
    revokeAccess();
    // [Finding panel sécurité CRITIQUE] NE PAS clearActivity : garder l'horodatage périmé (déjà ≥8h
    // dans le passé) → `isInactivityExpired()` reste TRUE jusqu'à une VRAIE reconnexion (connectAndSync,
    // qui recordActivity). Sinon `null → isInactivityExpired false` → le polling reconnecte tout seul en
    // ≤60s et la déconnexion ne « colle » jamais. `clearActivity` est réservé aux déconnexions MANUELLES.
    setStatus({ connected: false, busy: false });
}

/** Déconnexion : révoque le token et efface la meta de sync. */
export function disconnectSync(): void {
    revokeAccess();
    clearActivity();
    _transientSyncFailStreak = 0; // état neuf : une future connexion repart sans série héritée
    clearSyncMeta();
    clearGateAuthedThisSession(); // re-demande le login au prochain accès (sinon le gate serait sauté)
    // La passphrase est un secret de SESSION : on la purge à la déconnexion (sinon elle resterait
    // déchiffrer un blob d'un autre compte reconnecté dans le même onglet).
    clearPassphrase();
    // [B2, hygiène panel] Mémos Drive du chat (dédup push/fetch) + octets en mémoire : purgés au
    // changement de compte — des mémos d'un compte A ne doivent pas piloter les push/fetch du compte B.
    resetAttachmentDriveMemos();
    clearAttachmentCache();
    setStatus({ connected: false, email: null, conflict: false, conflictSummary: null, lastSyncedAt: 0, needsPassphrase: false });
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
        // [Finding panel CRITIQUE — Loi 25] Le bouton « Supprimer mes données de Google Drive »
        // doit AUSSI effacer les fichiers de pièces jointes du chat (`financeai-chat-attach-*` :
        // relevés/PDF réels) — sinon l'effacement « irréversible » mentait : le fichier de sync
        // partait, les documents restaient dans l'appDataFolder indéfiniment.
        await deleteAllChatAttachmentsFromDrive(token);
        revokeAccess();
        clearActivity();
        clearSyncMeta();
        clearPassphrase(); // secret de session purgé avec la déconnexion qui suit la suppression
        clearAttachmentCache(); // les octets en mémoire suivent l'effacement
        setStatus({ busy: false, connected: false, email: null, conflict: false, conflictSummary: null, lastSyncedAt: 0, needsPassphrase: false });
    } catch (e) {
        handleError('delete', e);
    }
}
