/**
 * [CHIFFREMENT-PHASE1] Mémorisation de la passphrase de sync PAR APPAREIL (plan §3).
 *
 * Avis de pole-securite (28/09, condition BLOQUANTE avant tout code sur ce module) : un appareil
 * DÉVERROUILLÉ ne doit PAS donner un accès immédiat à la phrase mémorisée — l'objectif est de
 * couvrir le vol réaliste (téléphone laissé déverrouillé SANS SURVEILLANCE), pas « le voleur
 * déverrouille le téléphone » (hors de portée de ce module). Mécanisme :
 *
 * 1. Clé AES-256-GCM NON EXTRACTIBLE générée par le navigateur, persistée dans IndexedDB (même
 *    patron que `services/secureKeyStore.ts`, déjà audité pour la clé Anthropic).
 * 2. La PHRASE (pas les données) est chiffrée avec cette clé ; le blob vit dans `localStorage`
 *    (jamais utile seul, sans la clé IDB non extractible).
 * 3. **Verrou biométrique/WebAuthn à CHAQUE usage** (pas seulement à la mémorisation) :
 *    `navigator.credentials.get()` avec un authentificateur de PLATEFORME (Face ID / Touch ID /
 *    Windows Hello — jamais une clé de sécurité externe) et `userVerification: "required"`.
 * 4. ÉCHEC FERMÉ PARTOUT : authentificateur de plateforme absent/refusé, IndexedDB indisponible,
 *    blob absent/altéré → `null`/`'unavailable'`, JAMAIS un repli plus faible. L'appelant redemande
 *    alors la phrase complète (comportement déjà prévu, inchangé).
 *
 * Limite ASSUMÉE et documentée à l'écran de création (§4 du plan) : un appareil volé, DÉJÀ
 * déverrouillé, DONT l'authentificateur de plateforme du voleur passe (cas limite) reste un accès
 * possible — c'est le principe même de « mémorisation ». La révocation n'est PAS à distance (la clé
 * ne quitte jamais l'appareil) : l'outil de Marc est de CHANGER LA PHRASE depuis un autre appareil,
 * ce qui coupe tous les appareils mémorisés d'un coup (rotation = révocation).
 *
 * Filet non bloquant (recommandation pole-securite, PAS une protection contre le vol le jour même) :
 * expiration par inactivité (~30 jours) sur la mémorisation elle-même.
 */

const DB_NAME = 'financeai-passphrase-device';
const DB_VERSION = 1;
const STORE_NAME = 'crypto-keys';
const DEVICE_KEY_ID = 'passphraseDeviceKey';
const IV_BYTES = 12;
const AES_KEY_BITS = 256;

/** Clés localStorage — propriété UNIQUE de ce module (pas de 2e écrivain, donc pas dans le registre
 *  `utils/storageKeys.ts`, réservé aux clés écrites à plusieurs endroits). */
const LS_BLOB_KEY = 'financeai_passphrase_device_blob';
const LS_CREDENTIAL_KEY = 'financeai_passphrase_device_credential';
const LS_LAST_USED_KEY = 'financeai_passphrase_device_last_used';

/** Filet non bloquant (§3) : au-delà, la mémorisation est traitée comme absente (hygiène, pas une
 *  protection contre un vol le jour même — le voleur l'utiliserait bien avant l'échéance). */
const EXPIRATION_INACTIVITE_MS = 30 * 24 * 60 * 60 * 1000;

const RP_NAME = 'FinanceAI (local)';

const getSubtle = (): SubtleCrypto | null => {
    const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
    return c?.subtle ?? null;
};

const isStorageSupported = (): boolean =>
    typeof indexedDB !== 'undefined' &&
    getSubtle() !== null &&
    typeof localStorage !== 'undefined';

const webAuthnSupported = (): boolean =>
    typeof navigator !== 'undefined' &&
    typeof navigator.credentials !== 'undefined' &&
    typeof (globalThis as { PublicKeyCredential?: unknown }).PublicKeyCredential !== 'undefined';

/** Authentificateur de PLATEFORME dispo (Face ID/Touch ID/Windows Hello) ? Jamais une clé externe :
 *  c'est `isUserVerifyingPlatformAuthenticatorAvailable`, pas une simple présence de WebAuthn. */
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
    if (!webAuthnSupported()) return false;
    try {
        const PKC = (globalThis as { PublicKeyCredential?: { isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean> } }).PublicKeyCredential;
        if (typeof PKC?.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') return false;
        return await PKC.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
        return false;
    }
}

// --- base64 <-> bytes (duplication volontaire, découplage — même choix que secureKeyStore.ts) ---

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

// --- Cœur crypto (AES-GCM, IV aléatoire par écriture) ---

const encryptString = async (key: CryptoKey, value: string): Promise<string> => {
    const subtle = getSubtle();
    if (!subtle) throw new Error('Web Crypto indisponible');
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const plaintext = new TextEncoder().encode(value);
    const ciphertext = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
    const out = new Uint8Array(iv.length + ciphertext.length);
    out.set(iv, 0);
    out.set(ciphertext, iv.length);
    return toBase64(out);
};

const decryptString = async (key: CryptoKey, b64: string): Promise<string> => {
    const subtle = getSubtle();
    if (!subtle) throw new Error('Web Crypto indisponible');
    const raw = fromBase64(b64);
    if (raw.length <= IV_BYTES) throw new Error('Blob chiffré trop court');
    const iv = raw.slice(0, IV_BYTES);
    const ciphertext = raw.slice(IV_BYTES);
    const plaintext = await subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(plaintext);
};

// --- Glue IndexedDB (clé non extractible) ---

const openDb = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
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

const idbDelete = (db: IDBDatabase, key: string): Promise<void> =>
    new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('Suppression IndexedDB échouée'));
    });

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
            ['encrypt', 'decrypt'],
        );
        await idbPut(db, DEVICE_KEY_ID, key);
        return key;
    } finally {
        db.close();
    }
};

// --- WebAuthn : création (mémorisation) + vérification (chaque usage) ---

/** Crée un credential lié à un authentificateur de PLATEFORME. `null` si refusé/indisponible —
 *  jamais d'exception qui remonte à l'appelant (échec fermé géré ici). */
async function creerCredentialPlateforme(): Promise<ArrayBuffer | null> {
    if (!webAuthnSupported()) return null;
    try {
        const challenge = globalThis.crypto.getRandomValues(new Uint8Array(32));
        const userId = globalThis.crypto.getRandomValues(new Uint8Array(16));
        const cred = (await navigator.credentials.create({
            publicKey: {
                rp: { name: RP_NAME },
                user: { id: userId, name: 'financeai-local', displayName: 'FinanceAI (cet appareil)' },
                challenge,
                pubKeyCredParams: [
                    { type: 'public-key', alg: -7 }, // ES256
                    { type: 'public-key', alg: -257 }, // RS256 (compat plus large)
                ],
                authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
                timeout: 60_000,
                attestation: 'none',
            },
        } as CredentialCreationOptions)) as PublicKeyCredential | null;
        return cred?.rawId ?? null;
    } catch {
        return null;
    }
}

/** Exige un succès `navigator.credentials.get()` sur le credential mémorisé, authentificateur de
 *  PLATEFORME, `userVerification: "required"`. `false` sur TOUT refus/erreur/indisponibilité. */
async function verifierPresenceUtilisateur(credentialId: ArrayBufferLike): Promise<boolean> {
    if (!webAuthnSupported()) return false;
    try {
        const challenge = globalThis.crypto.getRandomValues(new Uint8Array(32));
        const assertion = await navigator.credentials.get({
            publicKey: {
                challenge,
                allowCredentials: [{ id: credentialId, type: 'public-key', transports: ['internal'] }],
                userVerification: 'required',
                timeout: 60_000,
            },
        } as CredentialRequestOptions);
        return assertion != null;
    } catch {
        return false;
    }
}

// --- API publique ---

export type RememberResult = 'remembered' | 'unavailable';

/**
 * Mémorise `passphrase` sur cet appareil. Échoue proprement (`'unavailable'`, RIEN de mémorisé) si
 * IndexedDB/Web Crypto sont absents, OU si aucun authentificateur de plateforme n'est disponible, OU
 * si sa création est refusée — jamais de repli plus faible (§3, condition bloquante pole-securite).
 */
export async function rememberPassphraseOnDevice(passphrase: string, opts?: { now?: () => number }): Promise<RememberResult> {
    const now = opts?.now ?? (() => Date.now());
    if (!isStorageSupported()) return 'unavailable';
    const plateformeOk = await isPlatformAuthenticatorAvailable();
    if (!plateformeOk) return 'unavailable';
    const rawId = await creerCredentialPlateforme();
    if (!rawId) return 'unavailable';
    try {
        const key = await getOrCreateDeviceKey();
        const blob = await encryptString(key, passphrase);
        localStorage.setItem(LS_BLOB_KEY, blob);
        localStorage.setItem(LS_CREDENTIAL_KEY, toBase64(new Uint8Array(rawId)));
        localStorage.setItem(LS_LAST_USED_KEY, String(now()));
        return 'remembered';
    } catch {
        return 'unavailable';
    }
}

/** Un appareil est-il « souvenu » (blob + credential présents) ? N'exige PAS le verrou WebAuthn :
 *  c'est un état d'affichage (Réglages), pas un déchiffrement. */
export async function isDeviceRemembered(): Promise<boolean> {
    return Boolean(localStorage.getItem(LS_BLOB_KEY) && localStorage.getItem(LS_CREDENTIAL_KEY));
}

/**
 * Tente de déverrouiller la phrase mémorisée : verrou WebAuthn (authentificateur de plateforme,
 * `userVerification: "required"`) PUIS déchiffrement local. `null` sur TOUT échec (rien de
 * mémorisé, verrou refusé, IndexedDB/blob indisponible ou altéré) — jamais une exception, jamais un
 * repli plus faible ; l'appelant redemande alors la phrase complète.
 */
export async function tryUnlockRememberedPassphrase(opts?: { now?: () => number }): Promise<string | null> {
    const now = opts?.now ?? (() => Date.now());
    try {
        if (!isStorageSupported()) return null;
        const blob = localStorage.getItem(LS_BLOB_KEY);
        const credB64 = localStorage.getItem(LS_CREDENTIAL_KEY);
        if (!blob || !credB64) return null;
        const lastUsed = Number(localStorage.getItem(LS_LAST_USED_KEY) ?? '0');
        if (!lastUsed || now() - lastUsed > EXPIRATION_INACTIVITE_MS) return null; // filet hygiène, non bloquant
        const rawId = fromBase64(credB64).buffer;
        const verifie = await verifierPresenceUtilisateur(rawId);
        if (!verifie) return null; // ÉCHEC FERMÉ : jamais déchiffrer sans le verrou
        const db = await openDb();
        let key: CryptoKey | undefined;
        try {
            key = await idbGet<CryptoKey>(db, DEVICE_KEY_ID);
        } finally {
            db.close();
        }
        if (!key) return null;
        const passphrase = await decryptString(key, blob);
        localStorage.setItem(LS_LAST_USED_KEY, String(now()));
        return passphrase;
    } catch {
        return null;
    }
}

/** « Oublier cet appareil » (Réglages) : supprime le blob local ET la clé IDB. Pas de révocation À
 *  DISTANCE possible par construction — l'outil de Marc en cas de vol est de CHANGER LA PHRASE
 *  depuis un autre appareil (coupe tous les appareils mémorisés d'un coup). */
export async function forgetDevice(): Promise<void> {
    localStorage.removeItem(LS_BLOB_KEY);
    localStorage.removeItem(LS_CREDENTIAL_KEY);
    localStorage.removeItem(LS_LAST_USED_KEY);
    if (!isStorageSupported()) return;
    try {
        const db = await openDb();
        try {
            await idbDelete(db, DEVICE_KEY_ID);
        } finally {
            db.close();
        }
    } catch {
        // Best-effort : le blob localStorage est déjà retiré (suffisant : sans lui, la clé IDB seule
        // ne déchiffre rien d'utile).
    }
}
