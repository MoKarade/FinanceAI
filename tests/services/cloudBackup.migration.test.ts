// tests/services/cloudBackup.migration.test.ts
//
// [CHIFFREMENT-PHASE1] Migration sans perte (plan §5.5) : nettoyage des anciennes sauvegardes Drive
// EN CLAIR (`financeai-sync.json.<ISO>.bak.json`). JAMAIS automatique — compte D'ABORD (pour que
// l'écran demande confirmation avec le NOMBRE exact), ne supprime QUE sur un second appel explicite,
// et ne touche JAMAIS un backup déjà chiffré (`enc:true`) : la suppression ne cible que le risque
// réel (texte en clair), pas l'historique chiffré (inoffensif s'il fuit).
import { describe, it, expect, vi } from 'vitest';
import { countPlaintextBackups, deletePlaintextBackups } from '../../services/googleDrive/backupCleanup';
import type { FetchLike } from '../../services/googleDrive/driveAppData';

const jsonRes = (body: unknown, ok = true, status = 200): Response =>
    ({ ok, status, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response);

const TOKEN = 'jeton-de-test';

/** Fabrique un fetch : 1 appel liste (retourne `fichiers`), puis 1 appel de lecture par fichier
 *  (retourne `contenus[nom]`), dans l'ordre de la liste. Les DELETE renvoient 204 (succès). */
function fabriquerFetch(fichiers: Array<{ id: string; name: string }>, contenus: Record<string, unknown>): { fetchFn: FetchLike; deletions: string[] } {
    const deletions: string[] = [];
    const fetchFn: FetchLike = (async (input: string, init?: RequestInit) => {
        if (init?.method === 'DELETE') {
            const id = String(input).split('/').pop()?.split('?')[0] ?? '';
            deletions.push(id);
            return { ok: true, status: 204, json: async () => ({}), text: async () => '' } as unknown as Response;
        }
        if (String(input).includes('/files?')) {
            return jsonRes({ files: fichiers.map((f) => ({ id: f.id, name: f.name, modifiedTime: 'x' })) });
        }
        // Lecture du contenu : l'id est le dernier segment avant `?alt=media`.
        const id = String(input).split('/').pop()?.split('?')[0] ?? '';
        const nom = fichiers.find((f) => f.id === id)?.name ?? '';
        return jsonRes(contenus[nom] ?? {});
    }) as FetchLike;
    return { fetchFn, deletions };
}

const SYNC_BAK = (iso: string): string => `financeai-sync.json.${iso}.bak.json`;

describe('[CHIFFREMENT-PHASE1] countPlaintextBackups — compte AVANT toute suppression', () => {
    it('aucun backup : 0', async () => {
        const { fetchFn } = fabriquerFetch([], {});
        expect(await countPlaintextBackups(TOKEN, fetchFn)).toBe(0);
    });

    it('3 backups en clair, 2 déjà chiffrés : compte seulement les 3 en clair', async () => {
        const fichiers = [
            { id: '1', name: SYNC_BAK('2026-01-01') },
            { id: '2', name: SYNC_BAK('2026-01-02') },
            { id: '3', name: SYNC_BAK('2026-01-03') },
            { id: '4', name: SYNC_BAK('2026-02-01') },
            { id: '5', name: SYNC_BAK('2026-02-02') },
        ];
        const contenus: Record<string, unknown> = {
            [SYNC_BAK('2026-01-01')]: { enc: false, payload: {} },
            [SYNC_BAK('2026-01-02')]: {}, // enc absent = traité comme en clair
            [SYNC_BAK('2026-01-03')]: { enc: false, payload: {} },
            [SYNC_BAK('2026-02-01')]: { enc: true, payload: 'chiffré...' },
            [SYNC_BAK('2026-02-02')]: { enc: true, payload: 'chiffré...' },
        };
        const { fetchFn } = fabriquerFetch(fichiers, contenus);
        expect(await countPlaintextBackups(TOKEN, fetchFn)).toBe(3);
    });

    it('un fichier NON-backup (ex. le sync principal) est IGNORÉ par le filtre de nom', async () => {
        const fichiers = [
            { id: '1', name: 'financeai-sync.json' }, // pas un .bak.json
            { id: '2', name: SYNC_BAK('2026-01-01') },
        ];
        const contenus = { [SYNC_BAK('2026-01-01')]: { enc: false } };
        const { fetchFn } = fabriquerFetch(fichiers, contenus);
        expect(await countPlaintextBackups(TOKEN, fetchFn)).toBe(1);
    });

    it('un backup ILLISIBLE (erreur réseau) : PAS compté comme en clair (prudence — jamais supprimer sur une supposition)', async () => {
        const fichiers = [{ id: '1', name: SYNC_BAK('2026-01-01') }];
        const fetchFn: FetchLike = (async (input: string) => {
            if (String(input).includes('/files?')) return jsonRes({ files: fichiers });
            return jsonRes({ error: 'boom' }, false, 500);
        }) as FetchLike;
        expect(await countPlaintextBackups(TOKEN, fetchFn)).toBe(0);
    });
});

describe('[CHIFFREMENT-PHASE1] deletePlaintextBackups — SEULEMENT sur confirmation explicite (appel dédié)', () => {
    it('supprime uniquement les backups EN CLAIR, jamais les chiffrés', async () => {
        const fichiers = [
            { id: '1', name: SYNC_BAK('2026-01-01') },
            { id: '2', name: SYNC_BAK('2026-02-01') },
        ];
        const contenus = {
            [SYNC_BAK('2026-01-01')]: { enc: false },
            [SYNC_BAK('2026-02-01')]: { enc: true },
        };
        const { fetchFn, deletions } = fabriquerFetch(fichiers, contenus);
        const supprimes = await deletePlaintextBackups(TOKEN, fetchFn);
        expect(supprimes).toBe(1);
        expect(deletions).toEqual(['1']);
    });

    it('backup illisible : ni compté ni supprimé (même prudence que countPlaintextBackups)', async () => {
        const fichiers = [{ id: '1', name: SYNC_BAK('2026-01-01') }];
        const fetchFn: FetchLike = (async (input: string) => {
            if (String(input).includes('/files?')) return jsonRes({ files: fichiers });
            return jsonRes({ error: 'boom' }, false, 500);
        }) as FetchLike;
        const espionDelete = vi.fn();
        const fetchAvecEspion: FetchLike = (async (input: string, init?: RequestInit) => {
            if (init?.method === 'DELETE') espionDelete();
            return fetchFn(input, init);
        }) as FetchLike;
        expect(await deletePlaintextBackups(TOKEN, fetchAvecEspion)).toBe(0);
        expect(espionDelete).not.toHaveBeenCalled();
    });

    it('aucun backup en clair : 0 suppressions, aucun appel DELETE émis', async () => {
        const fichiers = [{ id: '1', name: SYNC_BAK('2026-01-01') }];
        const contenus = { [SYNC_BAK('2026-01-01')]: { enc: true } };
        const { fetchFn, deletions } = fabriquerFetch(fichiers, contenus);
        expect(await deletePlaintextBackups(TOKEN, fetchFn)).toBe(0);
        expect(deletions).toEqual([]);
    });
});
