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
} from '../googleDrive/gisAuth';
import { isInactivityExpired, recordActivity, clearActivity } from './inactivityLogout';
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
import { setStatus } from './syncStatusStore';
import { getLocalPayload, summarizeForConflict } from './syncSnapshot';
import { currentMeta, readDrive } from './syncMeta';
import { handleError } from './syncErrors';
import { pushNow } from './syncPush';
import { pullNow } from './syncPull';

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
        try {
            token = await renewTokenSilently(); // réseau, sans popup — reconnexion silencieuse tant que session Google OK
        } catch {
            setStatus({ busy: false, connected: false });
            return false;
        }
    }
    recordActivity(); // reprise réussie = activité (réarme le compte à rebours 8h)
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
        if (!(e instanceof DriveAuthError)) handleError('boot', e);
        return false;
    }
}

/** Sync au boot (silencieux) si l'utilisateur a déjà connecté Drive. Ne bloque jamais l'app. */
export async function runBootSync(): Promise<void> {
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
        try {
            token = await renewTokenSilently();
        } catch {
            setStatus({ connected: false });
            return;
        }
    }
    recordActivity();
    // 2) Le jeton est en main → une erreur APRÈS (lecture/écriture Drive) est, elle, anormale → handleError.
    try {
        setStatus({ connected: true });
        await runDecision(token); // garde anti-perte stricte (identique au gate désormais)
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
    clearActivity(); // repart d'une ardoise propre au prochain login
    setStatus({ connected: false, busy: false });
}

/** Déconnexion : révoque le token et efface la meta de sync. */
export function disconnectSync(): void {
    revokeAccess();
    clearActivity();
    clearSyncMeta();
    clearGateAuthedThisSession(); // re-demande le login au prochain accès (sinon le gate serait sauté)
    // La passphrase est un secret de SESSION : on la purge à la déconnexion (sinon elle resterait
    // déchiffrer un blob d'un autre compte reconnecté dans le même onglet).
    clearPassphrase();
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
        revokeAccess();
        clearActivity();
        clearSyncMeta();
        clearPassphrase(); // secret de session purgé avec la déconnexion qui suit la suppression
        setStatus({ busy: false, connected: false, email: null, conflict: false, conflictSummary: null, lastSyncedAt: 0, needsPassphrase: false });
    } catch (e) {
        handleError('delete', e);
    }
}
