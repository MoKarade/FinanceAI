// services/storagePersistence.ts
//
// [STORAGE-PERSIST-REQUEST] Persistance du stockage navigateur (`navigator.storage.persist()`).
// Le coffre chiffré repose sur IndexedDB (clé AES) + localStorage (blob `financeai-storage`) : sans
// persistance ACCORDÉE, le navigateur classe ce stockage « best-effort » et peut l'évincer sous
// pression disque — perte des clés API ET de la courbe verrouillée. L'app ne le demandait JAMAIS
// (0 occurrence dans le dépôt avant ce lot). On le demande UNE fois au boot, best-effort, et on
// expose l'état pour que ce soit DIAGNOSTICABLE (Réglages › Système & diagnostics).
//
// Ce que ce module ne fait PAS : décider à la place du navigateur (Chrome accorde selon
// l'engagement / l'installation PWA ; Firefox demande à l'utilisateur ; Safari ignore). Un refus est
// un ÉTAT à montrer, pas une erreur à journaliser en boucle.

export type EtatPersistance = 'accordee' | 'refusee' | 'non-supportee' | 'inconnue';

let _etat: EtatPersistance = 'inconnue';
let _demande: Promise<EtatPersistance> | null = null;

type StorageLike = { persist?: () => Promise<boolean>; persisted?: () => Promise<boolean> };

function storageDuNavigateur(): StorageLike | null {
    if (typeof navigator === 'undefined') return null;
    const s = (navigator as unknown as { storage?: StorageLike }).storage;
    return s && typeof s === 'object' ? s : null;
}

/**
 * Demande la persistance UNE fois par session (promesse mémoïsée) et mémorise la réponse.
 * Jamais de throw : un navigateur sans l'API rend `non-supportee`, une exception rend `inconnue`.
 */
export function requestPersistentStorage(): Promise<EtatPersistance> {
    if (_demande) return _demande;
    _demande = (async () => {
        const s = storageDuNavigateur();
        if (!s || typeof s.persist !== 'function') { _etat = 'non-supportee'; return _etat; }
        try {
            _etat = (await s.persist()) ? 'accordee' : 'refusee';
        } catch {
            _etat = 'inconnue';
        }
        return _etat;
    })();
    return _demande;
}

/** Dernier état connu (synchrone) — `inconnue` tant que la demande n'a pas répondu. */
export function getStoragePersistence(): EtatPersistance {
    return _etat;
}

/**
 * Relit l'état RÉEL auprès du navigateur (`persisted()`), sans redemander : c'est la lecture qu'affiche
 * le diagnostic, indépendante de ce que la demande du boot a rendu (une persistance accordée plus tôt,
 * ou révoquée depuis, se voit ici).
 */
export async function queryStoragePersisted(): Promise<EtatPersistance> {
    const s = storageDuNavigateur();
    if (!s || typeof s.persisted !== 'function') return 'non-supportee';
    try {
        return (await s.persisted()) ? 'accordee' : 'refusee';
    } catch {
        return 'inconnue';
    }
}

/** Libellé de diagnostic — une phrase qui dit ce que l'état IMPLIQUE, pas seulement son nom. */
export function libellePersistance(etat: EtatPersistance): string {
    switch (etat) {
        case 'accordee': return 'STORAGE: persistance du stockage ACCORDÉE — IndexedDB/localStorage ne seront pas évincés sous pression disque';
        case 'refusee': return 'STORAGE: persistance du stockage REFUSÉE par le navigateur — stockage « best-effort », évictable sous pression disque (installer l\'app en PWA ou l\'utiliser régulièrement aide Chrome à l\'accorder)';
        case 'non-supportee': return 'STORAGE: navigator.storage.persist non supporté par ce navigateur — stockage « best-effort »';
        default: return 'STORAGE: état de persistance inconnu (demande en cours ou refusée par une exception)';
    }
}

/** Tests uniquement : remet le module à son état initial (la promesse mémoïsée survit sinon d'un cas à l'autre). */
export function _resetStoragePersistenceForTests(): void {
    _etat = 'inconnue';
    _demande = null;
}
