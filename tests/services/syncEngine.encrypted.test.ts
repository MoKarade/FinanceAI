import { describe, it, expect } from 'vitest';
import { buildEnvelope, buildEncryptedEnvelope } from '../../services/sync/syncEngine';
import { SYNC_SCHEMA_VERSION } from '../../services/sync/syncTypes';

// Tests de la VARIANTE chiffrée (`enc:true`) de l'enveloppe + preuve d'anti-régression du chemin clair.
// buildEncryptedEnvelope reste PURE (le ciphertext est calculé en amont) → testable sans crypto.

describe('buildEncryptedEnvelope — enveloppe zéro-knowledge (enc:true)', () => {
    it('met enc:true, range le ciphertext dans encPayload, payload=null, AUCUN clair ni apiKeysEnc', () => {
        const env = buildEncryptedEnvelope('FAI1-CIPHERTEXT-B64', 'dev-9', '2.1.0', 4242);
        expect(env).toEqual({
            schemaVersion: SYNC_SCHEMA_VERSION,
            updatedAt: 4242,
            deviceId: 'dev-9',
            appVersion: '2.1.0',
            enc: true,
            payload: null,
            encPayload: 'FAI1-CIPHERTEXT-B64',
        });
        // Les clés API ne voyagent PAS en clair/keyCipher quand on chiffre : elles sont DANS encPayload.
        expect(env.apiKeysEnc).toBeUndefined();
        expect(env.apiKeys).toBeUndefined();
    });
});

/**
 * ANTI-RÉGRESSION (principe directeur) : sans passphrase, l'enveloppe produite par buildEnvelope doit
 * rester STRICTEMENT identique à aujourd'hui — même forme, enc:false, pas de champ encPayload parasite.
 * (Le test exhaustif de buildEnvelope vit dans syncEngine.test.ts ; ici on re-verrouille spécifiquement
 * la non-contamination par l'ajout du chemin chiffré.)
 */
describe('buildEnvelope — non contaminé par le chemin chiffré (zéro régression)', () => {
    it('reste enc:false, sans encPayload', () => {
        const env = buildEnvelope({ k: 'v' }, 'dev-1', '1.0', 100);
        expect(env.enc).toBe(false);
        expect('encPayload' in env).toBe(false);
        expect(env.payload).toEqual({ k: 'v' });
    });

    it('avec apiKeysEnc : chemin clair inchangé (clés via keyCipher, pas encPayload)', () => {
        const env = buildEnvelope({ k: 'v' }, 'dev-1', '1.0', 100, 'KEYS_ENC');
        expect(env.enc).toBe(false);
        expect(env.apiKeysEnc).toBe('KEYS_ENC');
        expect('encPayload' in env).toBe(false);
    });
});
