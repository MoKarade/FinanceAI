/**
 * Sauvegarde chiffree de l'AppState (Phase 1)
 *
 * Pourquoi : tout l'etat utilisateur vit dans localStorage. Un clear
 * navigateur, une corruption, une migration ratee = perte totale. Cette
 * couche permet d'exporter un fichier chiffre que Marc peut stocker ou
 * il veut (Drive, USB, Gist prive) sans risque de fuite : sans la
 * passphrase, le contenu reste opaque meme pour Google.
 *
 * Crypto :
 * - PBKDF2-HMAC-SHA256, 600_000 iterations (recommandation OWASP 2023)
 * - AES-256-GCM (chiffrement + authentification, anti-tampering natif)
 * - Salt 16 octets aleatoire par sauvegarde
 * - IV 12 octets aleatoire par sauvegarde
 *
 * Format binaire (avant base64) :
 * +---------+--------+------+----------------+
 * | magic 4 | ver 1  | salt 16 | iv 12 | ciphertext  |
 * +---------+--------+---------+-------+-------------+
 *   "FAI1"   0x01    random     random   AES-GCM out
 *
 * Le "magic" + version permet de detecter un fichier non-compatible
 * avant de demander la passphrase a l'utilisateur (UX).
 */

const MAGIC = new TextEncoder().encode('FAI1'); // 4 octets
const FORMAT_VERSION = 0x01;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const PBKDF2_ITERATIONS = 600_000;
const AES_KEY_BITS = 256;

export class CloudBackupError extends Error {
    constructor(message: string, public readonly code: 'INVALID_FORMAT' | 'WRONG_PASSPHRASE' | 'CRYPTO_UNAVAILABLE' | 'INTERNAL') {
        super(message);
        this.name = 'CloudBackupError';
    }
}

const getCrypto = (): SubtleCrypto => {
    const c = (typeof globalThis !== 'undefined' ? globalThis.crypto : undefined);
    if (!c?.subtle) {
        throw new CloudBackupError(
            "L'API Web Crypto n'est pas disponible dans cet environnement. La sauvegarde chiffree necessite un navigateur recent en HTTPS.",
            'CRYPTO_UNAVAILABLE'
        );
    }
    return c.subtle;
};

const randomBytes = (length: number): Uint8Array => {
    const out = new Uint8Array(length);
    crypto.getRandomValues(out);
    return out;
};

const deriveKey = async (passphrase: string, salt: Uint8Array): Promise<CryptoKey> => {
    const subtle = getCrypto();
    const passwordBytes = new TextEncoder().encode(passphrase);
    const baseKey = await subtle.importKey(
        'raw',
        passwordBytes,
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );
    return subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt,
            iterations: PBKDF2_ITERATIONS,
            hash: 'SHA-256',
        },
        baseKey,
        { name: 'AES-GCM', length: AES_KEY_BITS },
        false,
        ['encrypt', 'decrypt']
    );
};

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

const concatBytes = (...parts: Uint8Array[]): Uint8Array => {
    const total = parts.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const p of parts) { out.set(p, offset); offset += p.length; }
    return out;
};

const HEADER_LENGTH = MAGIC.length + 1 + SALT_BYTES + IV_BYTES;

const checkPassphrase = (passphrase: string): void => {
    // Min 12 caractères pour résister au brute-force hors-ligne (audit fiscal 2026-05).
    // PBKDF2 600k itérations + 8 chars = bruteforcable en semaines sur GPU moderne.
    if (typeof passphrase !== 'string' || passphrase.length < 12) {
        throw new CloudBackupError(
            'Passphrase requise (minimum 12 caracteres). Choisis quelque chose que tu retiendras : sans elle, la sauvegarde est irrecuperable.',
            'INTERNAL'
        );
    }
};

/**
 * Chiffre un payload (typiquement l'AppState complet) et retourne une
 * chaine base64 portable. Exporté (avec decryptBackup) pour tester le cœur
 * crypto directement : round-trip, mauvaise passphrase, tampering, format.
 */
export const encryptBackup = async (payload: unknown, passphrase: string): Promise<string> => {
    checkPassphrase(passphrase);
    const subtle = getCrypto();

    const json = JSON.stringify(payload);
    const plaintext = new TextEncoder().encode(json);

    const salt = randomBytes(SALT_BYTES);
    const iv = randomBytes(IV_BYTES);
    const key = await deriveKey(passphrase, salt);

    const ciphertext = new Uint8Array(
        await subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
    );

    const header = new Uint8Array(HEADER_LENGTH);
    header.set(MAGIC, 0);
    header[MAGIC.length] = FORMAT_VERSION;
    header.set(salt, MAGIC.length + 1);
    header.set(iv, MAGIC.length + 1 + SALT_BYTES);

    return toBase64(concatBytes(header, ciphertext));
};

/**
 * Inverse de encryptBackup. Verifie le format avant de tenter le
 * dechiffrement (pour separer une mauvaise passphrase d'un fichier
 * corrompu / version incompatible).
 */
export const decryptBackup = async <T = unknown>(encoded: string, passphrase: string): Promise<T> => {
    checkPassphrase(passphrase);
    const subtle = getCrypto();

    let raw: Uint8Array;
    try {
        raw = fromBase64(encoded);
    } catch {
        throw new CloudBackupError('Le fichier de sauvegarde est illisible (base64 invalide).', 'INVALID_FORMAT');
    }

    if (raw.length < HEADER_LENGTH + 16) {
        throw new CloudBackupError('Le fichier est trop court pour etre une sauvegarde valide.', 'INVALID_FORMAT');
    }

    for (let i = 0; i < MAGIC.length; i++) {
        if (raw[i] !== MAGIC[i]) {
            throw new CloudBackupError('Format inconnu (entete "FAI1" manquante).', 'INVALID_FORMAT');
        }
    }

    const version = raw[MAGIC.length];
    if (version !== FORMAT_VERSION) {
        throw new CloudBackupError(`Version de format ${version} non supportee (attendu : ${FORMAT_VERSION}).`, 'INVALID_FORMAT');
    }

    const salt = raw.slice(MAGIC.length + 1, MAGIC.length + 1 + SALT_BYTES);
    const iv = raw.slice(MAGIC.length + 1 + SALT_BYTES, HEADER_LENGTH);
    const ciphertext = raw.slice(HEADER_LENGTH);

    const key = await deriveKey(passphrase, salt);

    let plaintextBuf: ArrayBuffer;
    try {
        plaintextBuf = await subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    } catch {
        // AES-GCM echoue de la meme maniere pour passphrase fausse et
        // ciphertext altere -- impossible de distinguer sans casser GCM.
        throw new CloudBackupError(
            'Dechiffrement impossible : passphrase incorrecte ou fichier corrompu.',
            'WRONG_PASSPHRASE'
        );
    }

    const text = new TextDecoder().decode(plaintextBuf);
    try {
        return JSON.parse(text) as T;
    } catch {
        throw new CloudBackupError('Contenu dechiffre invalide (JSON malforme).', 'INTERNAL');
    }
};

/**
 * Declenche le telechargement d'un fichier .financeai.bak chiffre.
 * A appeler depuis un handler onClick (necessite document/Blob).
 */
export const downloadBackup = async (
    payload: unknown,
    passphrase: string,
    filename?: string
): Promise<void> => {
    if (typeof document === 'undefined') {
        throw new CloudBackupError('downloadBackup necessite un environnement navigateur.', 'CRYPTO_UNAVAILABLE');
    }
    const encoded = await encryptBackup(payload, passphrase);
    const blob = new Blob([encoded], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const name = filename || defaultBackupFilename();

    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Liberer l'URL apres un tick pour eviter une fuite memoire si le
    // download est annule.
    setTimeout(() => URL.revokeObjectURL(url), 0);
};

/**
 * Lit un fichier .financeai.bak depuis un input[type=file] et le
 * dechiffre. A appeler depuis un handler onChange.
 */
export const readBackupFile = async <T = unknown>(file: File, passphrase: string): Promise<T> => {
    const text = await file.text();
    return decryptBackup<T>(text, passphrase);
};

/**
 * Nom de fichier par defaut : financeai-2026-05-13T20-30-00Z.bak
 * (UTC, sans « : » illégal sous Windows ni millisecondes).
 */
export const defaultBackupFilename = (now: Date = new Date()): string => {
    // Retirer les millisecondes (« .\d+Z » → « Z ») AVANT de neutraliser « : »/« . »,
    // sinon le « . » des ms est déjà remplacé et le strip ne matche plus (code mort).
    const iso = now.toISOString().replace(/\.\d+Z$/, 'Z').replace(/[:.]/g, '-');
    return `financeai-${iso}.bak`;
};
