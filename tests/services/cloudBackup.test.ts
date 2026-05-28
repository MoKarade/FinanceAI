/**
 * @vitest-environment jsdom
 *
 * Lot 2 — cloudBackup.ts n'avait AUCUN test (crypto + perte de données = risque
 * maximal). On verrouille : round-trip fidèle, salt/IV aléatoires, entête de
 * format, et surtout les codes d'erreur distincts (mauvais format vs mauvaise
 * passphrase / fichier corrompu) — c'est le contrat UX de la restauration.
 *
 * Le cœur crypto est testé directement (encrypt/decrypt exportés) ; les wrappers
 * downloadBackup/readBackupFile ne sont que de la glue DOM autour de ce cœur.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { webcrypto } from 'node:crypto';
import {
    encryptBackup,
    decryptBackup,
    defaultBackupFilename,
} from '../../services/cloudBackup';

beforeAll(() => {
    // jsdom ne fournit pas SubtleCrypto ; on injecte celui de Node (PBKDF2 + AES-GCM).
    if (!globalThis.crypto?.subtle) {
        (globalThis as { crypto?: Crypto }).crypto = webcrypto as unknown as Crypto;
    }
});

const PASS = 'passphrase-de-test-12+'; // ≥ 12 caractères (exigence checkPassphrase)
const PAYLOAD = {
    version: 7,
    state: {
        transactions: [{ id: 1, payee: 'Loyer', amount: -1850 }],
        users: [{ salary: 92000 }],
        initialBalances: { liquid: 5000 },
    },
};

describe('cloudBackup — round-trip & intégrité crypto', () => {
    it('decrypt(encrypt(x)) restitue fidèlement x', async () => {
        const enc = await encryptBackup(PAYLOAD, PASS);
        expect(await decryptBackup(enc, PASS)).toEqual(PAYLOAD);
    });

    it('chiffre différemment à chaque appel (salt + IV aléatoires) mais déchiffre pareil', async () => {
        const a = await encryptBackup(PAYLOAD, PASS);
        const b = await encryptBackup(PAYLOAD, PASS);
        expect(a).not.toBe(b);
        expect(await decryptBackup(a, PASS)).toEqual(await decryptBackup(b, PASS));
    });

    it('le binaire commence par l\'entête magique "FAI1" + version 0x01', async () => {
        const bytes = Buffer.from(await encryptBackup(PAYLOAD, PASS), 'base64');
        expect(bytes.subarray(0, 4).toString('latin1')).toBe('FAI1');
        expect(bytes[4]).toBe(0x01);
    });

    it('le payload n\'apparaît pas en clair dans le chiffré', async () => {
        const enc = await encryptBackup(PAYLOAD, PASS);
        expect(enc).not.toContain('Loyer');
        expect(enc).not.toContain('92000');
    });
});

describe('cloudBackup — codes d\'erreur distincts', () => {
    it('passphrase incorrecte → WRONG_PASSPHRASE', async () => {
        const enc = await encryptBackup(PAYLOAD, PASS);
        await expect(decryptBackup(enc, 'mauvaise-passphrase-xyz')).rejects.toMatchObject({
            name: 'CloudBackupError',
            code: 'WRONG_PASSPHRASE',
        });
    });

    it('ciphertext altéré → WRONG_PASSPHRASE (AES-GCM non malléable)', async () => {
        const bytes = Buffer.from(await encryptBackup(PAYLOAD, PASS), 'base64');
        bytes[bytes.length - 1] ^= 0xff; // flip dans le tag GCM
        await expect(decryptBackup(bytes.toString('base64'), PASS)).rejects.toMatchObject({
            code: 'WRONG_PASSPHRASE',
        });
    });

    it('entête magique cassée → INVALID_FORMAT (avant toute crypto)', async () => {
        const bytes = Buffer.from(await encryptBackup(PAYLOAD, PASS), 'base64');
        bytes[0] = 0x00; // casse "FAI1"
        await expect(decryptBackup(bytes.toString('base64'), PASS)).rejects.toMatchObject({
            code: 'INVALID_FORMAT',
        });
    });

    it('version de format inconnue → INVALID_FORMAT', async () => {
        const bytes = Buffer.from(await encryptBackup(PAYLOAD, PASS), 'base64');
        bytes[4] = 0x02; // version != 0x01
        await expect(decryptBackup(bytes.toString('base64'), PASS)).rejects.toMatchObject({
            code: 'INVALID_FORMAT',
        });
    });

    it('fichier trop court → INVALID_FORMAT', async () => {
        const tooShort = Buffer.from('FAI1').toString('base64');
        await expect(decryptBackup(tooShort, PASS)).rejects.toMatchObject({ code: 'INVALID_FORMAT' });
    });

    it('base64 illisible → INVALID_FORMAT', async () => {
        await expect(decryptBackup('!!! pas du base64 !!!', PASS)).rejects.toMatchObject({
            code: 'INVALID_FORMAT',
        });
    });

    it('passphrase trop courte (<12) refusée au chiffrement ET au déchiffrement', async () => {
        await expect(encryptBackup(PAYLOAD, 'court')).rejects.toMatchObject({ code: 'INTERNAL' });
        const enc = await encryptBackup(PAYLOAD, PASS);
        await expect(decryptBackup(enc, 'court')).rejects.toMatchObject({ code: 'INTERNAL' });
    });
});

describe('cloudBackup — defaultBackupFilename', () => {
    it('produit un nom sans « : » (illégal sous Windows) et suffixé .bak', () => {
        const name = defaultBackupFilename(new Date('2026-05-13T20:30:00.000Z'));
        expect(name.startsWith('financeai-')).toBe(true);
        expect(name.endsWith('.bak')).toBe(true);
        expect(name).not.toContain(':');
        // Comportement réel actuel : les millisecondes restent (« -000 ») car le
        // premier replace mange déjà le « . » → le second replace est inopérant.
        // Cosmétique, pinné ici pour détecter tout changement involontaire.
        expect(name).toBe('financeai-2026-05-13T20-30-00-000Z.bak');
    });
});
