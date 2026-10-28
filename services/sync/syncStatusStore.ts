// services/sync/syncStatusStore.ts
// [ARCH-SYNC-SPLIT] PROPRIÉTAIRE UNIQUE de l'état de statut sync (`_status` + abonnés). Racine du graphe
// de dépendances : ne dépend d'AUCUN autre module sync* → tous les autres (push/pull/lifecycle/polling/
// passphrase) lisent/écrivent le statut via `setStatus`/`getSyncStatus` ci-dessous, JAMAIS via une copie
// locale (sinon désynchronisation silencieuse de l'UI — la classe de bug à éviter). Importé par : quasi tous.

import type { ConflictSummary } from './syncTypes';

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
     * Phase de la DERNIÈRE erreur (`error`) : sert à l'UI pour proposer la BONNE action de reprise.
     * `null` si `error` est null. ⚠️ Ne pas déclencher un `pushNow` de « réessai » sur une erreur de
     * `pull`/`boot`/`connect` (on pousserait un local peut-être PÉRIMÉ par-dessus un Drive qu'on n'a
     * justement pas réussi à lire → clobber). Finding silent-failure 2026-07-14.
     */
    errorPhase: 'pull' | 'push' | 'boot' | 'connect' | 'delete' | null;
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
    /**
     * Résumé « cet appareil vs Drive » quand `conflict` est vrai (nb de placements/transactions de
     * chaque côté + date Drive). `null` hors conflit. Permet à SyncConflictModal d'afficher un choix
     * ÉCLAIRÉ (anti-clobber Marc 2026-07-14) au lieu d'un « garder l'un ou l'autre » à l'aveugle.
     */
    conflictSummary: ConflictSummary | null;
    /**
     * [BUDGET-DRIVE-BANNER-FLASH] La tentative de REPRISE silencieuse au boot a-t-elle abouti (dans un
     * sens ou dans l'autre) ?
     *
     * ⚠️ Sans ce drapeau, `connected: false` recouvre DEUX faits opposés : « on a essayé et on n'est
     * pas connecté » et « on n'a pas encore essayé ». Au boot c'est le second — et l'app l'affichait
     * comme le premier : `initSync` publie `configured: true` avec `connected` encore à sa valeur par
     * défaut, alors que `App.tsx` ne lance `runBootSync` que **2 500 ms plus tard**. Un utilisateur
     * de retour voyait donc « tes changements ne sont PAS sauvegardés » pendant au moins 2,5 s, puis
     * la bannière disparaissait. Même famille que « pas encore connu ≠ zéro ».
     *
     * `true` d'entrée quand il n'y a RIEN à reprendre (jamais connecté sur cet appareil, ou Drive non
     * configuré) : dans ce cas la bannière doit apparaître TOUT DE SUITE — c'est la demande de Marc
     * (« propose de me connecter dès que je ne le suis pas »), et la retarder serait le défaut inverse.
     */
    resumeSettled: boolean;
}

const _defaultStatus: SyncStatus = {
    configured: false,
    connected: false,
    email: null,
    lastSyncedAt: 0,
    busy: false,
    conflict: false,
    error: null,
    errorPhase: null,
    needsPassphrase: false,
    passphraseActive: false,
    conflictSummary: null,
    resumeSettled: false,
};
let _status: SyncStatus = { ..._defaultStatus };
const _listeners = new Set<(s: SyncStatus) => void>();

/**
 * Réservé aux TESTS. `_status` est un état de MODULE : en production il repart à zéro à chaque
 * chargement de page, mais dans une suite Vitest il survit d'un test à l'autre. `resumeSettled` étant
 * MONOTONE par conception (`initSync` ne le remet jamais à `false`), un test qui l'a fait passer à
 * `true` rendrait tous les suivants vacueux sans ce point de remise à zéro. Constaté, pas anticipé.
 */
export function _resetSyncStatusForTests(): void {
    _status = { ..._defaultStatus };
    _listeners.clear();
}


/**
 * @internal — MUTATEUR partagé inter-modules sync uniquement (NE PAS exposer via le barrel public).
 * Remplace `_status` par un nouvel objet (patch) et notifie les abonnés. Tous les modules sync* passent
 * par ici : un seul `_status` dans tout le repo (vérifié par grep au split — doit rendre 1 occurrence).
 */
export function setStatus(patch: Partial<SyncStatus>): void {
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

// ── Avis ponctuels (pour un toast) ───────────────────────────────────────────

/**
 * [PURGE-TOAST-UX] (décision Marc 2026-09-05 : OUI, un toast) Un AVIS est un ÉVÉNEMENT, pas un état :
 * « 3 artefacts retirés du payload Drive » se dit une fois, il ne se relit pas dans un statut. D'où un
 * canal distinct de `SyncStatus` — abonnement générique côté UI (`useAppBootEffects` → toast), émission
 * côté service (`syncPull`) sans qu'un module sync* importe jamais un composant. Un avis émis sans
 * abonné est PERDU (il n'y a pas de file) : l'abonnement se pose au boot, avant `runBootSync`.
 */
export interface SyncNotice {
    kind: 'purge-pull';
    /** Phrase prête à afficher, en français, SANS montant (rien à masquer). */
    texte: string;
    /** Nombre d'artefacts retirés — pour un consommateur qui voudrait autre chose qu'un toast. */
    removed: number;
}

const _noticeListeners = new Set<(n: SyncNotice) => void>();

/** @internal — émission réservée aux modules sync*. */
export function emitSyncNotice(notice: SyncNotice): void {
    _noticeListeners.forEach((cb) => cb(notice));
}

export function subscribeSyncNotice(cb: (n: SyncNotice) => void): () => void {
    _noticeListeners.add(cb);
    return () => _noticeListeners.delete(cb);
}

/** Réservé aux TESTS (même raison que `_resetSyncStatusForTests` : état de module). */
export function _resetSyncNoticeForTests(): void {
    _noticeListeners.clear();
}
