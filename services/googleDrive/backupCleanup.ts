// services/googleDrive/backupCleanup.ts
//
// [CHIFFREMENT-PHASE1] Nettoyage des anciennes sauvegardes Drive EN CLAIR (plan §5.5). Ces fichiers
// `financeai-sync.json.<ISO>.bak.json` sont écrits par le connecteur MCP AVANT chaque écriture
// (`[MCP-PAYSLIP-BACKUP]`) — ceux d'AVANT l'activation d'une passphrase restent en clair pour
// toujours dans appDataFolder tant que personne ne les nettoie.
//
// JAMAIS automatique, JAMAIS silencieux : `countPlaintextBackups` (affiche le NOMBRE, demande
// confirmation) et `deletePlaintextBackups` (le geste réel) sont deux appels SÉPARÉS — l'appelant
// (l'UI) décide quand passer du premier au second, après un clic explicite de Marc.
//
// Prudence : un backup ILLISIBLE (réseau, JSON invalide) n'est NI compté NI supprimé — on ne
// supprime jamais sur une supposition. Un backup DÉJÀ chiffré (`enc:true`) n'est jamais touché : le
// risque visé est le texte en clair, pas l'historique chiffré (inoffensif s'il fuit).

import { listAppDataFiles, readAppDataFile, deleteAppDataFile, SYNC_FILE_NAME, type FetchLike } from './driveAppData';

const BACKUP_SUFFIX = '.bak.json';

interface BackupRef {
    id: string;
    name: string;
}

interface EnveloppePartielle {
    enc?: unknown;
}

async function listerBackupsSync(token: string, fetchFn?: FetchLike): Promise<BackupRef[]> {
    const fichiers = await listAppDataFiles(token, BACKUP_SUFFIX, fetchFn);
    return fichiers.filter((f) => f.name.startsWith(`${SYNC_FILE_NAME}.`) && f.name.endsWith(BACKUP_SUFFIX));
}

/** `true` seulement si le contenu a pu être lu ET n'est PAS marqué chiffré. Toute erreur de lecture
 *  renvoie `false` (prudence : jamais compté/supprimé sur une supposition). */
async function estEnClairEtLisible(token: string, ref: BackupRef, fetchFn?: FetchLike): Promise<boolean> {
    try {
        const contenu = await readAppDataFile<EnveloppePartielle>(token, ref.id, fetchFn);
        return contenu?.enc !== true;
    } catch {
        return false;
    }
}

/** Compte les backups EN CLAIR (à afficher AVANT de demander confirmation — plan §5.5). */
export async function countPlaintextBackups(token: string, fetchFn?: FetchLike): Promise<number> {
    const backups = await listerBackupsSync(token, fetchFn);
    const flags = await Promise.all(backups.map((b) => estEnClairEtLisible(token, b, fetchFn)));
    return flags.filter(Boolean).length;
}

/** Supprime les backups EN CLAIR. À appeler UNIQUEMENT après confirmation explicite de Marc (un
 *  clic dédié dans Réglages, jamais automatique). Renvoie le nombre effectivement supprimé. */
export async function deletePlaintextBackups(token: string, fetchFn?: FetchLike): Promise<number> {
    const backups = await listerBackupsSync(token, fetchFn);
    let supprimes = 0;
    for (const backup of backups) {
        if (await estEnClairEtLisible(token, backup, fetchFn)) {
            await deleteAppDataFile(token, backup.id, fetchFn);
            supprimes += 1;
        }
    }
    return supprimes;
}
