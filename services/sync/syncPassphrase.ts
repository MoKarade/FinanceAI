// services/sync/syncPassphrase.ts
// [ARCH-SYNC-SPLIT] Passphrase optionnelle de sync (D-3, chiffrement zéro-knowledge). Sans état
// module-level propre (délègue à passphraseStore). Orchestre un re-pull (syncPull) quand un blob chiffré
// attendait le secret, et un re-push en clair (syncPush) au retrait. Importé par : PassphraseGate,
// BackupPanel (MIN_PASSPHRASE_LENGTH), GoogleDriveSyncCard (removeSyncPassphrase).

import { isGoogleAuthConfigured } from '../googleDrive/gisAuth';
import { setPassphrase, clearPassphrase } from './passphraseStore';
import { setStatus, getSyncStatus } from './syncStatusStore';
import { pullNow } from './syncPull';
import { pushNow } from './syncPush';

/** Longueur minimale de passphrase — DOIT rester alignée sur `checkPassphrase` de cloudBackup. */
export const MIN_PASSPHRASE_LENGTH = 12;

type SetPassphraseResult = 'too-short' | 'set' | 'set-and-pulled';

/**
 * Active/définit la passphrase optionnelle de sync (D-3). Validée ici (≥12 caractères) pour un retour
 * immédiat à l'UI, en cohérence avec `encryptBackup`. Effets :
 *  - stocke le secret en SESSION (mémoire + sessionStorage), jamais en localStorage ni dans Drive ;
 *  - si un pull attendait la passphrase (`needsPassphrase`), RE-PULLE aussitôt pour déchiffrer ;
 *  - sinon, ne touche pas à Drive : le PROCHAIN push ré-écrira le blob en `enc:true` (cycle de migration).
 *
 * NE déclenche PAS de push automatique : laisser l'utilisateur (ou l'auto-push debouncé) pousser évite
 * de ré-écrire Drive juste pour avoir tapé une passphrase, et garde le contrôle côté utilisateur.
 */
export async function setSyncPassphrase(passphrase: string): Promise<SetPassphraseResult> {
    if (typeof passphrase !== 'string' || passphrase.length < MIN_PASSPHRASE_LENGTH) {
        return 'too-short';
    }
    const wasWaiting = getSyncStatus().needsPassphrase;
    setPassphrase(passphrase);
    setStatus({ passphraseActive: true, error: null });
    if (wasWaiting) {
        // Un blob chiffré attendait : on re-pull pour le déchiffrer maintenant qu'on a le secret.
        // pullNow remet `needsPassphrase:false` en cas de succès, ou le laisse vrai + message clair
        // si la passphrase est fausse (données locales intactes dans tous les cas).
        await pullNow();
        return 'set-and-pulled';
    }
    return 'set';
}

/**
 * Efface la passphrase de session → le prochain push REVIENT au format EN CLAIR (`enc:false`).
 * Les données LOCALES ne sont pas touchées. Si un blob chiffré était en attente, le drapeau
 * `needsPassphrase` est levé (sans passphrase, on ne peut plus le lire — état cohérent pour l'UI).
 */
export function clearSyncPassphrase(): void {
    clearPassphrase();
    setStatus({ passphraseActive: false });
}

type RemovePassphraseResult = 'removed' | 'removed-and-republished';

/**
 * RETIRE la passphrase ET re-publie aussitôt le coffre EN CLAIR (`enc:false`) si on est connecté et
 * déverrouillé. Sinon, effacer seulement le secret local laisserait le blob Drive `enc:true` → la
 * passphrase « reviendrait » sur un autre appareil (re-prompt). Marc : « pas de passphrase, juste mon
 * compte Google » → on rend le Drive non chiffré immédiatement. `pushNow` garde l'anti-vide/anti-test.
 */
export async function removeSyncPassphrase(): Promise<RemovePassphraseResult> {
    clearSyncPassphrase();
    const s = getSyncStatus();
    if (s.connected && !s.needsPassphrase && isGoogleAuthConfigured()) {
        await pushNow(); // ré-écrit le blob en clair (le secret est déjà purgé → enc:false)
        return 'removed-and-republished';
    }
    return 'removed';
}
