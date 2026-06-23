import { describe, it, expect, afterEach, vi } from 'vitest';
import { encryptApiKeys, decryptApiKeys } from '../../services/sync/keyCipher';

describe('keyCipher — chiffrement des clés API dérivé du sub Google', () => {
    const keys = { anthropic: 'sk-ant-secret-123', finnhub: 'fh-secret-456' };
    const sub = '110000000000000000001';

    it('round-trip : déchiffrer avec le MÊME sub redonne les clés (et le blob n est pas en clair)', async () => {
        const blob = await encryptApiKeys(keys, sub);
        expect(blob).not.toContain('sk-ant-secret-123');
        expect(blob).not.toContain('fh-secret-456');
        const out = await decryptApiKeys(blob, sub);
        expect(out).toEqual(keys);
    });

    it('IV aléatoire : deux chiffrements du même contenu produisent des blobs différents', async () => {
        const a = await encryptApiKeys(keys, sub);
        const b = await encryptApiKeys(keys, sub);
        expect(a).not.toBe(b);
        // …mais les deux déchiffrent correctement
        expect(await decryptApiKeys(b, sub)).toEqual(keys);
    });

    it('MAUVAIS sub → échec (clé dérivée différente, ne déchiffre pas)', async () => {
        const blob = await encryptApiKeys(keys, sub);
        await expect(decryptApiKeys(blob, '999999999999999999999')).rejects.toBeTruthy();
    });

    it('blob ALTÉRÉ → échec (AES-GCM authentifié)', async () => {
        const blob = await encryptApiKeys(keys, sub);
        const flip = blob[10] === 'A' ? 'B' : 'A';
        const tampered = blob.slice(0, 10) + flip + blob.slice(11);
        await expect(decryptApiKeys(tampered, sub)).rejects.toBeTruthy();
    });

    it('sub manquant → lève (on ne chiffre pas avec une clé vide)', async () => {
        await expect(encryptApiKeys(keys, '')).rejects.toThrow();
    });

    it('[SEC-PBKDF2-DRIVE] rétro-compat : un blob LEGACY (100k itérations) se déchiffre encore', async () => {
        // Recrée à la main un "ancien" blob Drive (100 000 itérations, le paramètre d'avant 2026-06-23),
        // puis vérifie que decryptApiKeys (qui chiffre désormais à 600k) le lit via son fallback legacy.
        const { encryptJson } = await import('../../services/secureKeyStore');
        const encUtf8 = new TextEncoder();
        const base = await crypto.subtle.importKey('raw', encUtf8.encode(sub), 'PBKDF2', false, ['deriveKey']);
        const legacyKey = await crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt: encUtf8.encode('financeai:sync:apiKeys:v1'), iterations: 100_000, hash: 'SHA-256' },
            base,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt'],
        );
        const legacyBlob = await encryptJson(legacyKey, keys);
        expect(await decryptApiKeys(legacyBlob, sub)).toEqual(keys);
    });
});

describe('keyCipher — Web Crypto indisponible (navigateur dégradé / contexte non sécurisé)', () => {
    afterEach(() => {
        vi.unstubAllGlobals(); // restaure globalThis.crypto pour les autres tests/fichiers
    });

    it('encryptApiKeys lève « Web Crypto indisponible » si crypto.subtle est absent', async () => {
        // sub NON vide pour dépasser le garde « sub manquant » et atteindre deriveKeyFromSub → getSubtle().
        vi.stubGlobal('crypto', {} as Crypto); // crypto présent mais sans .subtle
        await expect(encryptApiKeys({ anthropic: 'a', finnhub: 'b' }, 'sub-x')).rejects.toThrow(
            /Web Crypto indisponible/,
        );
    });

    it('decryptApiKeys lève « Web Crypto indisponible » si crypto.subtle est absent', async () => {
        vi.stubGlobal('crypto', {} as Crypto);
        await expect(decryptApiKeys('blob-base64-quelconque', 'sub-x')).rejects.toThrow(
            /Web Crypto indisponible/,
        );
    });
});
