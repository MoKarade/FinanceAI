// services/sync/keyCipher.ts
// Chiffrement des CLÉS API incluses dans l'enveloppe Drive (C1, sécurité 2026-05-29).
//
// La clé de chiffrement est DÉRIVÉE de l'identifiant Google stable de l'utilisateur (`sub`) via
// PBKDF2 → déterministe, donc le MÊME compte Google redonne la même clé sur TOUS ses appareils
// (cross-device, sans passphrase, choix Marc « crypte mais pas de passphrase »).
//
// HONNÊTETÉ SÉCURITÉ : `sub` n'est PAS un secret (il est dans le jeton OAuth). Ce chiffrement sort
// donc les clés du CLAIR (plus de lecture à l'œil nu dans le fichier Drive, plus de fuite par un
// canal qui exposerait le contenu sans l'identité) MAIS ne protège PAS contre un attaquant qui a
// déjà accès au compte Google (il peut redériver la clé). Le zéro-connaissance exigerait une
// passphrase (déclinée). Voir docs/GOOGLE_DRIVE_SYNC_DESIGN.md.

import { encryptJson, decryptJson } from '../secureKeyStore';

interface ApiKeysPlain {
    anthropic: string;
    finnhub: string;
}

// Sel FIXE et public : PBKDF2 n'exige pas un sel secret, seulement CONSTANT, pour que la dérivation
// soit reproductible sur tous les appareils du même compte. (Un sel par-utilisateur empêcherait le
// cross-device puisqu'il faudrait le transmettre — or on n'a que le `sub`.)
const SALT = new TextEncoder().encode('financeai:sync:apiKeys:v1');
// [SEC-PBKDF2-DRIVE, audit 2026-06-23] Aligné sur les backups locaux (600k). L'ancien 100k reste
// supporté au DÉCHIFFREMENT pour les blobs Drive écrits avant cette date (rétro-compatibilité).
const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_ITERATIONS_LEGACY = 100_000;

function getSubtle(): SubtleCrypto | null {
    const c = (globalThis as { crypto?: Crypto }).crypto;
    return c?.subtle ?? null;
}

/** Dérive une clé AES-GCM 256 bits à partir du `sub` Google (déterministe, cross-device). */
async function deriveKeyFromSub(sub: string, iterations: number): Promise<CryptoKey> {
    const subtle = getSubtle();
    if (!subtle) throw new Error('Web Crypto indisponible');
    const base = await subtle.importKey('raw', new TextEncoder().encode(sub), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey(
        { name: 'PBKDF2', salt: SALT, iterations, hash: 'SHA-256' },
        base,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    );
}

/** Chiffre les clés API avec la clé dérivée du `sub` (600k itérations). Renvoie un blob base64 (iv + ciphertext). */
export async function encryptApiKeys(keys: ApiKeysPlain, sub: string): Promise<string> {
    if (!sub) throw new Error('sub manquant');
    const key = await deriveKeyFromSub(sub, PBKDF2_ITERATIONS);
    return encryptJson(key, keys);
}

/**
 * Déchiffre un blob de clés API. Essaie le paramètre COURANT (600k) puis le LEGACY (100k) — AES-GCM
 * authentifie, donc une mauvaise clé lève ; on retombe sur le legacy avant d'abandonner (rétro-compat
 * des anciens blobs Drive). Lève si AUCUN ne déchiffre (sub erroné, blob altéré). L'appelant traite
 * l'échec comme « clés non restaurées ».
 */
export async function decryptApiKeys(blob: string, sub: string): Promise<ApiKeysPlain> {
    if (!sub) throw new Error('sub manquant');
    if (!getSubtle()) throw new Error('Web Crypto indisponible'); // échec d'INFRA, pas à retenter en legacy
    for (const iterations of [PBKDF2_ITERATIONS, PBKDF2_ITERATIONS_LEGACY]) {
        try {
            const key = await deriveKeyFromSub(sub, iterations);
            const out = await decryptJson<Partial<ApiKeysPlain>>(key, blob);
            return { anthropic: out?.anthropic ?? '', finnhub: out?.finnhub ?? '' };
        } catch {
            // Mauvais paramètre d'itérations (blob legacy) → on tente le suivant. NON avalé : si les
            // DEUX échouent, on lève ci-dessous (pas de silence).
        }
    }
    throw new Error('Déchiffrement des clés API échoué (sub erroné, blob altéré ou format inconnu)');
}
