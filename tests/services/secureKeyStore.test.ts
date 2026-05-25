import { describe, it, expect, beforeAll } from 'vitest';
import { webcrypto } from 'node:crypto';
import { encryptJson, decryptJson, type PersistedApiKeys } from '../../services/secureKeyStore';

// Le cœur crypto est testé en injectant une CryptoKey (la glue IndexedDB n'est
// pas dispo en jsdom et n'a pas de logique métier). jsdom n'expose pas toujours
// Web Crypto → on garantit globalThis.crypto avec celui de Node.
beforeAll(() => {
    if (!globalThis.crypto?.subtle) {
        (globalThis as { crypto?: Crypto }).crypto = webcrypto as unknown as Crypto;
    }
});

const makeKey = (): Promise<CryptoKey> =>
    globalThis.crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    ) as Promise<CryptoKey>;

const SAMPLE: PersistedApiKeys = {
    eraContext: 'era_live_abc123',
    anthropic: 'sk-ant-secret-xyz',
    finnhub: 'fh_test_456',
};

describe('secureKeyStore — cœur crypto', () => {
    it('chiffre puis déchiffre : round-trip fidèle', async () => {
        const key = await makeKey();
        const blob = await encryptJson(key, SAMPLE);
        const decoded = await decryptJson<PersistedApiKeys>(key, blob);
        expect(decoded).toEqual(SAMPLE);
    });

    it('le blob ne contient pas les clés en clair', async () => {
        const key = await makeKey();
        const blob = await encryptJson(key, SAMPLE);
        expect(blob).not.toContain('era_live_abc123');
        expect(blob).not.toContain('sk-ant-secret-xyz');
        expect(blob).not.toContain('fh_test_456');
    });

    it('IV aléatoire : deux chiffrements de la même valeur diffèrent', async () => {
        const key = await makeKey();
        const a = await encryptJson(key, SAMPLE);
        const b = await encryptJson(key, SAMPLE);
        expect(a).not.toBe(b);
        // mais les deux déchiffrent vers la même valeur
        expect(await decryptJson(key, a)).toEqual(SAMPLE);
        expect(await decryptJson(key, b)).toEqual(SAMPLE);
    });

    it('rejette un ciphertext altéré (AES-GCM authentifie)', async () => {
        const key = await makeKey();
        const blob = await encryptJson(key, SAMPLE);
        const bytes = Buffer.from(blob, 'base64');
        bytes[bytes.length - 1] ^= 0xff; // flip dans le tag GCM
        const tampered = bytes.toString('base64');
        await expect(decryptJson(key, tampered)).rejects.toThrow();
    });

    it('rejette le déchiffrement avec une autre clé', async () => {
        const keyA = await makeKey();
        const keyB = await makeKey();
        const blob = await encryptJson(keyA, SAMPLE);
        await expect(decryptJson(keyB, blob)).rejects.toThrow();
    });

    it('rejette un blob trop court', async () => {
        const key = await makeKey();
        await expect(decryptJson(key, 'AAAA')).rejects.toThrow();
    });

    it('round-trip de clés vides (cas par défaut)', async () => {
        const key = await makeKey();
        const empty: PersistedApiKeys = { eraContext: '', anthropic: '', finnhub: '' };
        const blob = await encryptJson(key, empty);
        expect(await decryptJson<PersistedApiKeys>(key, blob)).toEqual(empty);
    });
});
