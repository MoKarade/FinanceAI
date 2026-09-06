/**
 * Persistance CHIFFRÉE AU REPOS des clés API, déverrouillée par la session.
 *
 * Contexte
 * --------
 * L'audit C5 (2026-05-21) avait retiré les clés API du localStorage en clair
 * (exfiltrables via XSS / extension malveillante) et les avait rendues
 * « mémoire uniquement ». Effet de bord non voulu : les clés disparaissaient à
 * CHAQUE rechargement → Marc devait les re-saisir, et Finnhub ne se
 * chargeait jamais tout seul (clé vide au boot).
 *
 * Choix (2026-05-25)
 * ------------------
 * On persiste à nouveau, mais chiffré. La clé AES-256-GCM est générée par le
 * navigateur en mode NON-EXTRACTIBLE et stockée dans IndexedDB ; le blob
 * chiffré (iv ‖ ciphertext, base64) vit dans localStorage. Un dump de
 * localStorage seul (backup, synchro, copier-coller depuis les devtools) est
 * donc inexploitable : il manque la clé, et celle-ci ne peut pas être
 * ré-exportée en octets bruts (`extractable: false`).
 *
 * Accès à l'app : gate Google in-app (remplace Cloudflare Access, RETIRÉ 2026-06-16).
 * La clé AES est PAR APPAREIL (IndexedDB local, non-extractible) → même si l'app est
 * publiquement accessible, le blob chiffré d'un device n'est déchiffrable que SUR ce
 * device. « Se connecter avec Google » = charger l'app = déchiffrer auto. Zéro re-saisie.
 *
 * Limite ASSUMÉE (honnête)
 * ------------------------
 * Ce chiffrement protège AU REPOS, pas contre un XSS *actif* dans la page : un
 * attaquant exécutant du code dans l'origine peut demander au navigateur de
 * déchiffrer avec la clé non-extractible (il l'utilise sans en lire les
 * octets). La défense contre ça reste la CSP stricte, pas le chiffrement local
 * (Cloudflare Access RETIRÉ 2026-06-16 ; le gate Google in-app n'est PAS un mur dur —
 * trappe `?nogate` — donc ne compte PAS comme barrière anti-XSS).
 *
 * Crypto
 * ------
 * - AES-256-GCM (chiffrement + authentification anti-tampering natif)
 * - IV 12 octets aléatoire par écriture
 * - Clé non-extractible persistée dans IndexedDB (structured-clone)
 */

import { logError } from './errorLogger';
import { STORAGE_KEYS } from '../utils/storageKeys';

export interface PersistedApiKeys {
    anthropic: string;
    finnhub: string;
    /** [FINTABLE-7] Jeton Fintable (lecture seule). Optionnel : absent = sync in-app inactive.
     *  ⚠️ Déclaré ICI dès l'introduction du champ (finding security-privacy, PR #535) — pas au
     *  moment où l'UI l'écrira : un champ absent de ce type pousse la surface suivante à le
     *  sauvegarder par un AUTRE chemin, non chiffré. Le coffre est la seule voie. */
    fintable?: string;
}

const DB_NAME = 'financeai-secure';
const DB_VERSION = 1;
const STORE_NAME = 'crypto-keys';
const DEVICE_KEY_ID = 'apiKeysDeviceKey';
const LS_BLOB_KEY = STORAGE_KEYS.apiKeysEncrypted;
const IV_BYTES = 12;
const AES_KEY_BITS = 256;

const getSubtle = (): SubtleCrypto | null => {
    const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
    return c?.subtle ?? null;
};

/**
 * Le coffre exige Web Crypto + IndexedDB + localStorage. Tous présents en
 * contexte sécurisé (HTTPS ou localhost). Sinon on dégrade proprement vers
 * « mémoire uniquement » (les clés restent valides pour la session).
 */
const isSecureKeyStoreSupported = (): boolean =>
    typeof indexedDB !== 'undefined' &&
    getSubtle() !== null &&
    typeof localStorage !== 'undefined';

// --- base64 <-> bytes (identique à cloudBackup, gardé local pour découplage) ---

const toBase64 = (bytes: Uint8Array): string => {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
};

const fromBase64 = (b64: string): Uint8Array => {
    const binary = atob(b64.trim());
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
};

// --- Cœur crypto (exporté pour test : on injecte la CryptoKey) ---

/**
 * Chiffre `value` (sérialisé en JSON) avec `key`. Retourne base64(iv ‖ ct).
 */
export const encryptJson = async (key: CryptoKey, value: unknown): Promise<string> => {
    const subtle = getSubtle();
    if (!subtle) throw new Error('Web Crypto indisponible');
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const plaintext = new TextEncoder().encode(JSON.stringify(value));
    const ciphertext = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
    const out = new Uint8Array(iv.length + ciphertext.length);
    out.set(iv, 0);
    out.set(ciphertext, iv.length);
    return toBase64(out);
};

/**
 * Inverse de `encryptJson`. Lève si le blob est altéré ou la clé incorrecte
 * (AES-GCM authentifie : on ne distingue pas les deux, c'est voulu).
 */
export const decryptJson = async <T = unknown>(key: CryptoKey, b64: string): Promise<T> => {
    const subtle = getSubtle();
    if (!subtle) throw new Error('Web Crypto indisponible');
    const raw = fromBase64(b64);
    if (raw.length <= IV_BYTES) throw new Error('Blob chiffré trop court');
    const iv = raw.slice(0, IV_BYTES);
    const ciphertext = raw.slice(IV_BYTES);
    const plaintext = await subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
};

// --- Glue IndexedDB (clé de device persistée, non-extractible) ---

const openDb = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('Ouverture IndexedDB échouée'));
    });

const idbGet = <T>(db: IDBDatabase, key: string): Promise<T | undefined> =>
    new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => resolve(req.result as T | undefined);
        req.onerror = () => reject(req.error ?? new Error('Lecture IndexedDB échouée'));
    });

const idbPut = (db: IDBDatabase, key: string, value: unknown): Promise<void> =>
    new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('Écriture IndexedDB échouée'));
    });

/**
 * Récupère la clé de device existante, ou en génère une nouvelle
 * (non-extractible) et la persiste. Une seule clé par navigateur/profil.
 *
 * Exportée car partagée : sert aussi au chiffrement au repos des backups
 * locaux (`services/backupAuto.ts`) et de la courbe de projection verrouillée
 * (`services/lockedProjectionStore.ts`). Même modèle de menace (protège un dump
 * passif d'IndexedDB/localStorage, pas un XSS actif). Réutilisation sûre —
 * `encryptJson` tire un IV aléatoire à chaque appel, donc aucune réutilisation
 * de nonce GCM même si la clé chiffre plusieurs payloads.
 */
export const getOrCreateDeviceKey = async (): Promise<CryptoKey> => {
    const subtle = getSubtle();
    if (!subtle) throw new Error('Web Crypto indisponible');
    const db = await openDb();
    try {
        const existing = await idbGet<CryptoKey>(db, DEVICE_KEY_ID);
        if (existing) return existing;
        const key = await subtle.generateKey(
            { name: 'AES-GCM', length: AES_KEY_BITS },
            false, // non-extractible : impossible de relire les octets bruts
            ['encrypt', 'decrypt']
        );
        await idbPut(db, DEVICE_KEY_ID, key);
        return key;
    } finally {
        db.close();
    }
};

// --- API publique (orchestration) ---

/**
 * Champs du coffre qui sont **DEVICE-LOCAL** : ils n'existent que sur cet appareil et ne voyagent
 * JAMAIS par le Drive (décision `[FINTABLE-7]`, cf. `services/sync/syncSnapshot.ts`).
 *
 * ⚠️ [FINTABLE-TOKEN-WIPE] C'est le champ le plus fragile du coffre, et pour une raison
 * contre-intuitive : puisqu'il ne PART jamais vers Drive, il n'est jamais dans ce qui en REVIENT.
 * Or `syncPull` réécrivait le coffre avec le payload Drive — qui, par construction, ne contient
 * que `{anthropic, finnhub}`. Chaque synchro effaçait donc le jeton Fintable. Symptôme trompeur :
 * le store en MÉMOIRE fusionne (`{...prev, ...keys}`), donc le jeton continuait de fonctionner
 * dans l'onglet ouvert et ne « disparaissait » qu'au rechargement suivant — aucun lien de cause
 * à effet visible pour l'utilisateur.
 *
 * La préservation vit ICI, dans l'écriture elle-même, et non chez les appelants : le coffre est la
 * seule voie d'écriture, c'est donc le seul endroit qu'aucun appelant futur ne peut oublier.
 */
const DEVICE_LOCAL_KEY_FIELDS = ['fintable'] as const;

/**
 * Chiffre et persiste les clés API. Génère la clé de device au premier appel.
 * Lève si le coffre est indisponible (l'appelant décide quoi afficher).
 *
 * **Contrat des champs device-local** (`DEVICE_LOCAL_KEY_FIELDS`) :
 *  - champ ABSENT de `keys` (`undefined`) → la valeur déjà au coffre est PRÉSERVÉE ;
 *  - champ PRÉSENT, même vide (`''`) → la valeur passée gagne (permet un effacement explicite).
 * La distinction `undefined` vs `''` est le cœur du correctif : « je ne parle pas de ce champ »
 * n'est pas « efface ce champ ». Un `Object.assign` naïf confond les deux.
 */
/**
 * File d'attente des ÉCRITURES du coffre.
 *
 * ⚠️ [STORAGE-KEY-WRITE-RACE, finding panel PR #612] Préserver les champs device-local impose de
 * LIRE avant d'ÉCRIRE. L'écrasement en bloc d'avant était atomique (un seul `setItem`, aucune
 * lecture) : le correctif échangeait donc un bug DÉTERMINISTE contre une course. Elle n'a rien de
 * théorique — mesurée par le panel sur le scénario réel : Marc colle son jeton pendant qu'un pull
 * Drive est en vol (le polling tire toutes les 60 s ET au retour de focus d'onglet ; or coller un
 * jeton implique justement un alt-tab). Trois issues observées : jeton neuf remplacé par l'ancien,
 * champ carrément absent, et — le plus grave — un jeton EFFACÉ volontairement RESSUSCITÉ.
 *
 * On sérialise donc toutes les écritures sur une seule chaîne de promesses. C'est possible
 * précisément parce que le correctif a fait de `saveApiKeys` le point d'écriture UNIQUE. La chaîne
 * ne propage jamais un rejet à l'appel suivant (un échec ne doit pas bloquer le coffre à vie), mais
 * chaque appelant reçoit bien SON erreur.
 */
let vaultWriteChain: Promise<unknown> = Promise.resolve();

/**
 * Chiffre et persiste les clés API. Génère la clé de device au premier appel.
 * Lève si le coffre est indisponible (l'appelant décide quoi afficher).
 *
 * **Contrat des champs device-local** (`DEVICE_LOCAL_KEY_FIELDS`) :
 *  - champ ABSENT de `keys` (`undefined`) → la valeur déjà au coffre est PRÉSERVÉE ;
 *  - champ PRÉSENT, même vide (`''`) → la valeur passée gagne (permet un effacement explicite).
 * La distinction `undefined` vs `''` est le cœur du correctif : « je ne parle pas de ce champ »
 * n'est pas « efface ce champ ». Un `Object.assign` naïf confond les deux.
 *
 * Les appels concurrents sont SÉRIALISÉS (cf. `vaultWriteChain`) : le lire-puis-écrire est ainsi
 * atomique vis-à-vis des autres écritures du coffre.
 */
export const saveApiKeys = async (keys: PersistedApiKeys): Promise<void> => {
    if (!isSecureKeyStoreSupported()) {
        throw new Error('Coffre chiffré indisponible (Web Crypto / IndexedDB absent)');
    }
    const run = async (): Promise<void> => {
        const key = await getOrCreateDeviceKey();
        const merged: PersistedApiKeys = { ...keys };
        // Lecture best-effort de l'existant : un coffre illisible (clé tournée, blob altéré) ne doit
        // PAS empêcher d'écrire les nouvelles clés — on écrit alors `keys` tel quel.
        const existing = await loadApiKeysDetailed().catch(() => null);
        if (existing?.status === 'ok') {
            for (const field of DEVICE_LOCAL_KEY_FIELDS) {
                if (merged[field] === undefined && existing.keys[field] !== undefined) {
                    merged[field] = existing.keys[field];
                }
            }
        } else if (existing?.status === 'decrypt_failed') {
            // [KEYSTORE-DECRYPT-FAILED-SILENCIEUX] Classe REPLI-SILENCIEUX-LEGITIME-VS-CORRUPTION :
            // `empty` est le cas NORMAL (premier usage — rien à préserver, silence légitime), mais
            // `decrypt_failed` signifie que le coffre EXISTE et n'a pas pu être lu (clé de device
            // tournée, blob altéré). L'écriture continue — refuser bloquerait l'utilisateur hors de
            // ses propres clés — mais les champs device-local NON réécrits ici sont alors perdus
            // sans que personne ne l'apprenne. On le trace.
            logError({
                source: 'storage',
                severity: 'warning',
                message: 'Coffre de clés illisible à la sauvegarde : les champs device-local existants n’ont pas pu être préservés',
                context: { preservableFields: DEVICE_LOCAL_KEY_FIELDS, providedFields: Object.keys(keys) },
            });
        }
        const blob = await encryptJson(key, merged);
        localStorage.setItem(LS_BLOB_KEY, blob);
    };
    // `catch` sur la chaîne (pas sur la promesse rendue) : un échec ne doit pas empoisonner les
    // écritures suivantes, mais l'appelant courant DOIT voir son erreur.
    const result = vaultWriteChain.then(run, run);
    vaultWriteChain = result.catch(() => undefined);
    return result;
};

/**
 * Résultat discriminé de `loadApiKeysDetailed`.
 *  - 'ok'            : clés déchiffrées avec succès
 *  - 'empty'         : rien stocké (1er lancement ou coffre vidé proprement)
 *  - 'decrypt_failed': blob présent mais clé IDB absente / blob altéré
 *                      → l'UI doit informer l'utilisateur de re-saisir ses clés
 */
export type LoadApiKeysResult =
    | { status: 'ok'; keys: PersistedApiKeys }
    | { status: 'empty' }
    | { status: 'decrypt_failed' };

/**
 * Variante discriminée de `loadApiKeys` : permet à l'UI de distinguer
 * « rien stocké » de « déchiffrement impossible » et d'afficher un toast
 * d'avertissement dans le second cas.
 */
export const loadApiKeysDetailed = async (): Promise<LoadApiKeysResult> => {
    if (!isSecureKeyStoreSupported()) return { status: 'empty' };
    const blob = localStorage.getItem(LS_BLOB_KEY);
    if (!blob) return { status: 'empty' };
    try {
        const db = await openDb();
        let key: CryptoKey | undefined;
        try {
            key = await idbGet<CryptoKey>(db, DEVICE_KEY_ID);
        } finally {
            db.close();
        }
        // Blob présent mais clé IDB absente → indéchiffrable (ex: IndexedDB vidé).
        if (!key) return { status: 'decrypt_failed' };
        const keys = await decryptJson<PersistedApiKeys>(key, blob);
        return { status: 'ok', keys };
    } catch {
        return { status: 'decrypt_failed' }; // blob altéré / clé tournée
    }
};


