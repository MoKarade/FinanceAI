// mcp/state/writeAppState.ts
//
// Lot 2 — écriture SÛRE de l'AppState dans le fichier local (mode stdio).
// Garde « écriture directe + sauvegarde » (décision Marc) : avant toute écriture,
// on copie l'état courant dans une sauvegarde HORODATÉE (annulable), puis on écrit
// de façon ATOMIQUE (fichier temporaire + rename) pour ne jamais laisser un JSON
// tronqué. L'enveloppe { payload } (format blob Drive) est préservée si présente.
//
// Le loader Drive (couche fluide) réutilisera la même logique de fusion ; seul le
// transport (fichier vs blob chiffré) changera.

import { promises as fs } from 'node:fs';
import { dirname, basename, join } from 'node:path';
import type { AppState } from '../../types';

export interface SaveResult {
    /** Chemin de la sauvegarde de l'état PRÉCÉDENT (null si le fichier n'existait pas). */
    backupPath: string | null;
}

/** Suffixe des sauvegardes : <fichier>.<ISO>.bak (l'ISO trie chronologiquement). */
const BAK_SUFFIX = '.bak';

/** Retire un BOM éventuel (Notepad peut en ajouter à l'enregistrement). */
function stripBom(s: string): string {
    return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
}

/**
 * Écrit `next` dans `filePath` après avoir sauvegardé l'état courant.
 * - sauvegarde horodatée de l'ancien contenu (si présent), puis purge au-delà de `keepBackups`
 * - écriture atomique (temp + rename)
 * - préserve l'enveloppe { payload } si le fichier en avait une
 */
export async function saveAppStateToFile(
    filePath: string,
    next: AppState,
    opts?: { keepBackups?: number },
): Promise<SaveResult> {
    const keep = opts?.keepBackups ?? 5;

    // 1) Lire l'état courant (pour sauvegarde + détection d'enveloppe).
    let currentRaw: string | null = null;
    try {
        currentRaw = await fs.readFile(filePath, 'utf8');
    } catch {
        currentRaw = null; // premier write : pas de sauvegarde à faire
    }

    // 2) Sauvegarde horodatée de l'ancien contenu, puis purge.
    let backupPath: string | null = null;
    if (currentRaw != null) {
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        backupPath = join(dirname(filePath), `${basename(filePath)}.${ts}${BAK_SUFFIX}`);
        await fs.writeFile(backupPath, currentRaw, 'utf8');
        await pruneBackups(filePath, keep);
    }

    // 3) Préserver l'enveloppe { payload } si elle existait.
    let out: unknown = next;
    if (currentRaw != null) {
        try {
            const parsed = JSON.parse(stripBom(currentRaw));
            if (parsed && typeof parsed === 'object' && 'payload' in (parsed as Record<string, unknown>)) {
                out = { ...(parsed as Record<string, unknown>), payload: next, updatedAt: Date.now() };
            }
        } catch {
            /* fichier courant illisible → on écrit l'état nu (la sauvegarde garde l'ancien) */
        }
    }

    // 4) Écriture ATOMIQUE : fichier temporaire puis rename (même dossier = atomique).
    const tmp = `${filePath}.tmp-${process.pid}`;
    await fs.writeFile(tmp, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
    await fs.rename(tmp, filePath);

    return { backupPath };
}

/** Garde les `keep` sauvegardes les plus récentes de `filePath`, supprime le reste. */
async function pruneBackups(filePath: string, keep: number): Promise<void> {
    const dir = dirname(filePath);
    const prefix = `${basename(filePath)}.`;
    let entries: string[] = [];
    try {
        entries = await fs.readdir(dir);
    } catch {
        return;
    }
    const baks = entries
        .filter((n) => n.startsWith(prefix) && n.endsWith(BAK_SUFFIX))
        .sort(); // horodatage ISO → ordre chronologique croissant
    const excess = baks.slice(0, Math.max(0, baks.length - keep));
    await Promise.all(excess.map((f) => fs.unlink(join(dir, f)).catch(() => undefined)));
}
