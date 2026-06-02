// services/sync/passphraseStore.ts
// Stockage de LA passphrase optionnelle de sync zéro-knowledge (décision D-3 de Marc, 2026-06).
//
// PRINCIPE SÉCURITÉ — c'est LE secret zéro-knowledge :
//   - JAMAIS persistée dans localStorage (qui survit à la fermeture du navigateur) ;
//   - JAMAIS envoyée à Drive (sinon le chiffrement ne servirait à rien) ;
//   - vit en MÉMOIRE (variable de module) + miroir `sessionStorage` UNIQUEMENT.
//
// Pourquoi `sessionStorage` et pas seulement la mémoire : `sessionStorage` est effacé à la
// fermeture de l'ONGLET, mais survit à un reload de page (le filet ultime `window.location.reload()`
// d'`applyPulledPayload`, un F5 manuel). Sans lui, un simple reload obligerait l'utilisateur à
// ressaisir sa passphrase à chaque fois → friction telle qu'il la désactiverait. Le miroir mémoire
// sert d'autorité (sessionStorage peut être indisponible : navigation privée stricte, quota), la
// lecture retombe dessus si `sessionStorage` est vide.
//
// LIMITE HONNÊTE : `sessionStorage` est lisible par tout JS de l'origine pendant la session (XSS).
// Ce n'est pas un coffre matériel ; c'est le compromis standard « secret de session » côté client.
// Le gain zéro-knowledge est vis-à-vis de Drive/Google (le secret n'y va jamais), pas vis-à-vis
// d'un attaquant qui exécute déjà du code dans l'onglet.

// Clé de session. `:v1` pour pouvoir invalider le format plus tard sans collision.
const SESSION_KEY = 'financeai:sync:passphrase:v1';

// Autorité en mémoire. `undefined` = jamais initialisé ce tick ; on retombe alors sur sessionStorage.
let _inMemory: string | null | undefined;

function safeSessionGet(): string | null {
    try {
        return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(SESSION_KEY) : null;
    } catch {
        return null;
    }
}

function safeSessionSet(value: string): void {
    try {
        if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(SESSION_KEY, value);
    } catch {
        /* sessionStorage indispo (mode privé strict / quota) — la mémoire reste l'autorité */
    }
}

function safeSessionRemove(): void {
    try {
        if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(SESSION_KEY);
    } catch {
        /* idem — best-effort */
    }
}

/**
 * Renvoie la passphrase active de cette session, ou `null` si aucune n'est définie.
 * Mémoire d'abord (autorité), puis `sessionStorage` (survit à un reload de page).
 */
export function getPassphrase(): string | null {
    if (_inMemory !== undefined) return _inMemory;
    // Premier accès du tick : réhydrate depuis sessionStorage (cas d'un reload de page).
    const fromSession = safeSessionGet();
    _inMemory = fromSession;
    return fromSession;
}

/** Vrai si une passphrase est active pour cette session (chemin chiffré activé). */
export function hasPassphrase(): boolean {
    return getPassphrase() !== null;
}

/**
 * Définit la passphrase de session (mémoire + miroir sessionStorage). Ne valide PAS la longueur ici :
 * la validation (≥12 caractères) reste le contrat de `encryptBackup`/`checkPassphrase` au moment du
 * chiffrement — source unique de vérité. L'UI peut valider en amont pour le retour immédiat.
 */
export function setPassphrase(passphrase: string): void {
    _inMemory = passphrase;
    safeSessionSet(passphrase);
}

/**
 * Efface la passphrase de session (mémoire + sessionStorage). Après ça, le prochain push revient au
 * chemin EN CLAIR (`enc:false`) — cf cycle de migration dans syncOrchestrator/docs.
 */
export function clearPassphrase(): void {
    _inMemory = null;
    safeSessionRemove();
}
