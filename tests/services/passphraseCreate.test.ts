// tests/services/passphraseCreate.test.ts
//
// [CHIFFREMENT-PHASE1] Flux de création d'une passphrase (plan §4, C2) : force minimale (réutilise
// MIN_PASSPHRASE_LENGTH, alignée sur checkPassphrase de cloudBackup.ts), confirmation par ressaisie,
// case « copie hors ligne » OBLIGATOIRE avant que le bouton Activer soit actif.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/sync/syncPassphrase', () => ({
    MIN_PASSPHRASE_LENGTH: 12,
    setSyncPassphrase: vi.fn(async () => 'set' as const),
}));
vi.mock('../../services/deviceKeyStore', () => ({
    rememberPassphraseOnDevice: vi.fn(async () => 'remembered' as const),
}));

import { validateNewPassphrase, peutActiver, activerChiffrement } from '../../services/passphraseCreate';
import { setSyncPassphrase } from '../../services/sync/syncPassphrase';
import { rememberPassphraseOnDevice } from '../../services/deviceKeyStore';

const LONGUE = 'une-phrase-largement-suffisante';

describe('[CHIFFREMENT-PHASE1] validateNewPassphrase — force minimale + confirmation', () => {
    it('phrase trop courte : reason "too-short"', () => {
        expect(validateNewPassphrase('court', 'court')).toEqual({ ok: false, reason: 'too-short' });
    });

    it('phrase assez longue mais confirmation différente : reason "mismatch"', () => {
        expect(validateNewPassphrase(LONGUE, LONGUE + 'x')).toEqual({ ok: false, reason: 'mismatch' });
    });

    it('phrase assez longue ET confirmation identique : ok', () => {
        expect(validateNewPassphrase(LONGUE, LONGUE)).toEqual({ ok: true });
    });

    it('priorité : une phrase trop courte est "too-short" même si la confirmation correspond (pas "mismatch" trivial)', () => {
        expect(validateNewPassphrase('court', 'court')).toEqual({ ok: false, reason: 'too-short' });
    });
});

describe('[CHIFFREMENT-PHASE1] peutActiver — la case hors-ligne est OBLIGATOIRE (C2)', () => {
    it('phrases valides mais case NON cochée : bouton inactif', () => {
        expect(peutActiver({ passphrase: LONGUE, confirmation: LONGUE, copieHorsLigneConfirmee: false })).toBe(false);
    });

    it('case cochée mais phrases invalides : bouton inactif', () => {
        expect(peutActiver({ passphrase: 'court', confirmation: 'court', copieHorsLigneConfirmee: true })).toBe(false);
    });

    it('case cochée ET phrases valides et identiques : bouton actif', () => {
        expect(peutActiver({ passphrase: LONGUE, confirmation: LONGUE, copieHorsLigneConfirmee: true })).toBe(true);
    });
});

describe('[CHIFFREMENT-PHASE1] activerChiffrement — orchestration', () => {
    beforeEach(() => vi.clearAllMocks());

    it('active la passphrase de sync ; remember=false → ne tente PAS la mémorisation par appareil', async () => {
        const res = await activerChiffrement(LONGUE, { remember: false });
        expect(setSyncPassphrase).toHaveBeenCalledWith(LONGUE);
        expect(rememberPassphraseOnDevice).not.toHaveBeenCalled();
        expect(res).toEqual({ remembered: false });
    });

    it('remember=true → tente aussi la mémorisation par appareil, renvoie son verdict', async () => {
        const res = await activerChiffrement(LONGUE, { remember: true });
        expect(setSyncPassphrase).toHaveBeenCalledWith(LONGUE);
        expect(rememberPassphraseOnDevice).toHaveBeenCalledWith(LONGUE);
        expect(res).toEqual({ remembered: true });
    });

    it('remember=true mais la mémorisation échoue (WebAuthn indisponible) : remembered=false, la passphrase reste active quand même', async () => {
        vi.mocked(rememberPassphraseOnDevice).mockResolvedValueOnce('unavailable');
        const res = await activerChiffrement(LONGUE, { remember: true });
        expect(setSyncPassphrase).toHaveBeenCalledWith(LONGUE);
        expect(res).toEqual({ remembered: false });
    });
});
