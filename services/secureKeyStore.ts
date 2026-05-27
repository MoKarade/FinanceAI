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
 * L'application entière est déjà derrière Cloudflare Access (Google OAuth +
 * MFA) : « se connecter avec Google » = pouvoir charger l'app = déchiffrer
 * automatiquement. Zéro re-saisie.
 *
 * Limite ASSUMÉE (honnête)
 * ------------------------
 * Ce chiffrement protège AU REPOS, pas contre un XSS *actif* dans la page : un
 * attaquant exécutant du code dans l'origine peut demander au navigateur de
 * déchiffrer avec la clé non-extractible (il l'utilise sans en lire les
 * octets). La défense contre ça reste la CSP stricte + Cloudflare Access, pas
 * le chiffrement local.
 *
 * Crypto
 * ------
 * - AES-256-GCM (chiffrement + authentification anti-tampering natif)
 * - IV 12 octets aléatoire par écriture
 * - Clé non-extractible persistée dans IndexedDB (structured-clone)
 */

export interface PersistedApiKeys {
    anthropic: string;
    finnhub: string;
}

const DB_NAME = 'financeai-secure';
const DB_VERSION = 1;
const STORE_NAME = 'crypto-keys';
const DEVICE_KEY_ID = 'apiKeysDeviceKey';
const LS_BLOB_KEY = 'app_api_keys_enc';
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
 */
const getOrCreateDeviceKey = async (): Promise<CryptoKey> => {
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
 * Chiffre et persiste les clés API. Génère la clé de device au premier appel.
 * Lève si le coffre est indisponible (l'appelant décide quoi afficher).
 */
export const saveApiKeys = async (keys: PersistedApiKeys): Promise<void> => {
    if (!isSecureKeyStoreSupported()) {
        throw new Error('Coffre chiffré indisponible (Web Crypto / IndexedDB absent)');
    }
    const key = await getOrCreateDeviceKey();
    const blob = await encryptJson(key, keys);
    localStorage.setItem(LS_BLOB_KEY, blob);
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


