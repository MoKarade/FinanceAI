// services/passphraseCreate.ts
//
// [CHIFFREMENT-PHASE1] Logique PURE + orchestration du flux de création d'une passphrase (plan §4).
// Séparé du composant React (`components/settings/PassphraseCreate.tsx`) pour rester testable sans
// DOM : validation de la force (C2), état du bouton « Activer » (case hors-ligne obligatoire), et
// l'activation elle-même (passphrase de sync + mémorisation par appareil optionnelle).

import { MIN_PASSPHRASE_LENGTH, setSyncPassphrase } from './sync/syncPassphrase';
import { rememberPassphraseOnDevice } from './deviceKeyStore';

export { MIN_PASSPHRASE_LENGTH };

export type ValidationPassphrase = { ok: true } | { ok: false; reason: 'too-short' | 'mismatch' };

/** Valide une NOUVELLE passphrase (création, pas déverrouillage) : longueur d'abord (la raison la
 *  plus actionnable), puis correspondance avec la ressaisie. */
export function validateNewPassphrase(passphrase: string, confirmation: string): ValidationPassphrase {
    if (typeof passphrase !== 'string' || passphrase.length < MIN_PASSPHRASE_LENGTH) {
        return { ok: false, reason: 'too-short' };
    }
    if (passphrase !== confirmation) {
        return { ok: false, reason: 'mismatch' };
    }
    return { ok: true };
}

export interface EtatCreationPassphrase {
    passphrase: string;
    confirmation: string;
    /** Case « J'ai conservé une copie hors ligne » — OBLIGATOIRE (C2), aucune exception. */
    copieHorsLigneConfirmee: boolean;
}

/** Le bouton « Activer le chiffrement » est-il actif ? Phrases valides ET case cochée — les DEUX,
 *  jamais l'un sans l'autre (C2 : « le bouton reste désactivé tant qu'elle n'est pas cochée »). */
export function peutActiver(etat: EtatCreationPassphrase): boolean {
    return validateNewPassphrase(etat.passphrase, etat.confirmation).ok && etat.copieHorsLigneConfirmee;
}

export interface ResultatActivation {
    /** true si la mémorisation par appareil a réussi (WebAuthn dispo + acceptée). La passphrase de
     *  sync est TOUJOURS active à ce stade, que la mémorisation ait réussi ou non. */
    remembered: boolean;
}

/**
 * Active le chiffrement : rend la passphrase active pour la sync (prochain push → `enc:true`), puis,
 * si demandé, tente de la mémoriser sur cet appareil (verrou WebAuthn requis, §3). Un échec de
 * mémorisation N'ANNULE PAS l'activation — la passphrase reste active, l'utilisateur la ressaisira
 * simplement à la prochaine session sur cet appareil (comportement déjà existant, inchangé).
 */
export async function activerChiffrement(passphrase: string, opts: { remember: boolean }): Promise<ResultatActivation> {
    await setSyncPassphrase(passphrase);
    if (!opts.remember) return { remembered: false };
    const verdict = await rememberPassphraseOnDevice(passphrase);
    return { remembered: verdict === 'remembered' };
}
