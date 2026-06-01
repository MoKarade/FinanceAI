import { describe, it, expect } from 'vitest';
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
});
