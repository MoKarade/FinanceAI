// tests/services/attachmentDriveStore.test.ts
//
// [B2-CHAT-HISTORY] Octets des pièces jointes en fichiers Drive appdata SÉPARÉS : push best-effort
// (dédup, sans jeton = no-op, échec ré-essayable), fetch au cache-miss (raté mémorisé — pas de
// re-fetch en boucle), delete par conversation. Tout injecté — zéro réseau réel.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    pushAttachmentsToDrive, fetchAttachmentsFromDrive, deleteAttachmentsFromDrive,
    deleteAllChatAttachmentsFromDrive, _resetAttachmentDriveStoreForTests,
} from '../../services/aiChat/attachmentDriveStore';
import type { AiAttachmentPayload } from '../../services/aiChat/attachments';

const P: AiAttachmentPayload[] = [{ name: 'r.pdf', kind: 'pdf', mimeType: 'application/pdf', size: 3, data: 'UERG' }];
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => _resetAttachmentDriveStoreForTests());

describe('pushAttachmentsToDrive', () => {
    it('crée UN fichier par message (nom stable), dédupliqué sur ré-appel', async () => {
        const create = vi.fn(async () => 'file-id');
        pushAttachmentsToDrive('aimsg_1', P, { token: 'tk', create });
        pushAttachmentsToDrive('aimsg_1', P, { token: 'tk', create }); // même message re-poussé (historique reconstruit)
        await flush();
        expect(create).toHaveBeenCalledTimes(1);
        const [, name, body] = create.mock.calls[0] as unknown as [string, string, { payloads: unknown[] }];
        expect(name).toBe('financeai-chat-attach-aimsg_1.json');
        expect(body.payloads).toEqual(P);
    });

    it('sans jeton Drive → no-op silencieux (le chat marche sans Drive)', async () => {
        const create = vi.fn(async () => 'x');
        pushAttachmentsToDrive('aimsg_2', P, { token: null, create });
        await flush();
        expect(create).not.toHaveBeenCalled();
    });

    it('échec d\'upload → ré-essayable au prochain envoi (pas de dédup sur un raté)', async () => {
        const create = vi.fn()
            .mockRejectedValueOnce(new Error('503'))
            .mockResolvedValueOnce('file-id');
        pushAttachmentsToDrive('aimsg_3', P, { token: 'tk', create });
        await flush();
        pushAttachmentsToDrive('aimsg_3', P, { token: 'tk', create });
        await flush();
        expect(create).toHaveBeenCalledTimes(2);
    });
});

describe('fetchAttachmentsFromDrive', () => {
    it('fichier trouvé → payloads rendus (et le message marqué déjà poussé)', async () => {
        const list = vi.fn(async () => [{ id: 'fid', name: 'financeai-chat-attach-aimsg_4.json', modifiedTime: '' }]);
        const read = vi.fn(async () => ({ version: 1, messageId: 'aimsg_4', payloads: P }));
        expect(await fetchAttachmentsFromDrive('aimsg_4', { token: 'tk', list, read })).toEqual(P);
    });

    it('fichier ABSENT → null + raté mémorisé À TTL : pas de re-listing immédiat, RE-TENTÉ après le TTL', async () => {
        // TTL et non « à vie » (finding panel) : l'autre appareil peut pousser le fichier quelques
        // secondes APRÈS le premier raté (course de sync) — un mémo permanent rendait le contenu
        // introuvable pour toute la session.
        let clock = 1_000_000;
        const now = () => clock;
        const list = vi.fn(async () => []);
        expect(await fetchAttachmentsFromDrive('aimsg_5', { token: 'tk', list, now })).toBeNull();
        expect(await fetchAttachmentsFromDrive('aimsg_5', { token: 'tk', list, now })).toBeNull();
        expect(list).toHaveBeenCalledTimes(1); // pas de latence répétée à chaque tour
        clock += 61_000; // après le TTL : le push de l'autre appareil a maintenant abouti
        const found = vi.fn(async () => [{ id: 'fid', name: 'financeai-chat-attach-aimsg_5.json', modifiedTime: '' }]);
        const read = vi.fn(async () => ({ version: 1, messageId: 'aimsg_5', payloads: P }));
        expect(await fetchAttachmentsFromDrive('aimsg_5', { token: 'tk', list: found, read, now })).toEqual(P);
    });

    it('contenu invalide ou échec réseau → null honnête, jamais de throw', async () => {
        const list = vi.fn(async () => [{ id: 'fid', name: 'financeai-chat-attach-aimsg_6.json', modifiedTime: '' }]);
        expect(await fetchAttachmentsFromDrive('aimsg_6', { token: 'tk', list, read: async () => ({ mauvais: true }) })).toBeNull();
        expect(await fetchAttachmentsFromDrive('aimsg_7', {
            token: 'tk', list: async () => { throw new Error('réseau'); },
        })).toBeNull();
    });

    it('sans jeton → null immédiat (jamais de popup déclenchée par le chat)', async () => {
        const list = vi.fn();
        expect(await fetchAttachmentsFromDrive('aimsg_8', { token: null, list })).toBeNull();
        expect(list).not.toHaveBeenCalled();
    });
});

describe('deleteAttachmentsFromDrive', () => {
    it('supprime les fichiers des messages donnés (un listing, N suppressions ciblées)', async () => {
        const list = vi.fn(async () => [
            { id: 'f1', name: 'financeai-chat-attach-aimsg_9.json', modifiedTime: '' },
            { id: 'f2', name: 'financeai-chat-attach-aimsg_AUTRE.json', modifiedTime: '' },
        ]);
        const remove = vi.fn(async () => undefined);
        await deleteAttachmentsFromDrive(['aimsg_9'], { token: 'tk', list, remove });
        expect(remove).toHaveBeenCalledTimes(1);
        expect(remove).toHaveBeenCalledWith('tk', 'f1');
    });

    it('sans jeton ou liste vide → no-op sans throw', async () => {
        await expect(deleteAttachmentsFromDrive([], { token: 'tk' })).resolves.toBeUndefined();
        await expect(deleteAttachmentsFromDrive(['x'], { token: null })).resolves.toBeUndefined();
    });

    it('échec de suppression PAR FICHIER : jamais avalé en silence (compte tracé), pas de throw', async () => {
        const list = vi.fn(async () => [{ id: 'f1', name: 'financeai-chat-attach-aimsg_10.json', modifiedTime: '' }]);
        const remove = vi.fn(async () => { throw new Error('403'); });
        await expect(deleteAttachmentsFromDrive(['aimsg_10'], { token: 'tk', list, remove })).resolves.toBeUndefined();
        expect(remove).toHaveBeenCalledTimes(1); // tenté, échec tracé via logError (orphelin signalé)
    });
});

describe('deleteAllChatAttachmentsFromDrive (droit à l\'effacement, Loi 25)', () => {
    it('supprime TOUS les fichiers chat-attach (le wipe « Supprimer mes données » les inclut désormais)', async () => {
        const list = vi.fn(async () => [
            { id: 'f1', name: 'financeai-chat-attach-aimsg_a.json', modifiedTime: '' },
            { id: 'f2', name: 'financeai-chat-attach-aimsg_b.json', modifiedTime: '' },
        ]);
        const remove = vi.fn(async () => undefined);
        await deleteAllChatAttachmentsFromDrive('tk', { list, remove });
        expect(remove).toHaveBeenCalledTimes(2);
    });

    it('échec de LISTING → throw (l\'appelant doit savoir que le wipe n\'a pas pu se faire)', async () => {
        await expect(deleteAllChatAttachmentsFromDrive('tk', {
            list: async () => { throw new Error('réseau'); },
        })).rejects.toThrow();
    });
});
