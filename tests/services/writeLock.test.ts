// tests/services/writeLock.test.ts
//
// [VERROU-ECRITURE] Étape 2 — app web : SEUL endroit qui peut créer/prolonger/fermer le verrou
// d'écriture MCP (financeai-write-lock.json, appDataFolder). activerEcriture/desactiverEcriture/
// lireEtatEcriture — même patron Drive que financeai-sync.json, aucun nouveau scope OAuth.
import { describe, it, expect, vi } from 'vitest';
import { activerEcriture, desactiverEcriture, lireEtatEcriture, WRITE_LOCK_FILE_NAME } from '../../services/googleDrive/writeLock';
import type { FetchLike } from '../../services/googleDrive/driveAppData';

const jsonRes = (body: unknown, ok = true, status = 200): Response =>
    ({ ok, status, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response);

const TOKEN = 'jeton-de-test';

describe('[VERROU-ECRITURE] lireEtatEcriture', () => {
    it('aucun fichier de verrou : deverrouilleJusqua = null (verrouillé par défaut)', async () => {
        const fetchFn: FetchLike = (async () => jsonRes({ files: [] })) as FetchLike;
        const etat = await lireEtatEcriture(TOKEN, fetchFn);
        expect(etat.deverrouilleJusqua).toBeNull();
    });

    it('fichier présent : renvoie la date telle quelle', async () => {
        let appel = 0;
        const jusqua = '2026-09-28T12:00:00.000Z';
        const fetchFn: FetchLike = (async () => {
            appel += 1;
            if (appel === 1) return jsonRes({ files: [{ id: 'f1', name: WRITE_LOCK_FILE_NAME, modifiedTime: 'x' }] });
            return jsonRes({ deverrouilleJusqua: jusqua, version: 1 });
        }) as FetchLike;
        const etat = await lireEtatEcriture(TOKEN, fetchFn);
        expect(etat.deverrouilleJusqua).toBe(jusqua);
    });

    it('lecture en échec : deverrouilleJusqua = null, pas d\'exception qui sort', async () => {
        let appel = 0;
        const fetchFn: FetchLike = (async () => {
            appel += 1;
            if (appel === 1) return jsonRes({ files: [{ id: 'f1', name: WRITE_LOCK_FILE_NAME, modifiedTime: 'x' }] });
            return jsonRes({ error: 'boom' }, false, 500);
        }) as FetchLike;
        const etat = await lireEtatEcriture(TOKEN, fetchFn);
        expect(etat.deverrouilleJusqua).toBeNull();
    });
});

describe('[VERROU-ECRITURE] activerEcriture', () => {
    it('aucun fichier existant : le CRÉE avec une échéance dans le futur (minutes demandées)', async () => {
        const now = 1_000_000;
        const creation = vi.fn();
        const fetchFn: FetchLike = (async (input: string, init?: RequestInit) => {
            if (!String(input).includes('/upload/')) return jsonRes({ files: [] }); // recherche : absent
            creation(String(init?.body));
            return jsonRes({ id: 'nouveau' });
        }) as FetchLike;
        await activerEcriture(15, TOKEN, fetchFn, { now: () => now });
        expect(creation).toHaveBeenCalledTimes(1);
        const corps = creation.mock.calls[0][0] as string;
        expect(corps).toContain(WRITE_LOCK_FILE_NAME);
        const attendu = new Date(now + 15 * 60_000).toISOString();
        expect(corps).toContain(attendu);
    });

    it('fichier existant : le MET À JOUR (PATCH), ne crée pas de doublon', async () => {
        const now = 1_000_000;
        let methodeUtilisee = '';
        const fetchFn: FetchLike = (async (input: string, init?: RequestInit) => {
            if (String(input).includes('/files?')) return jsonRes({ files: [{ id: 'f1', name: WRITE_LOCK_FILE_NAME, modifiedTime: 'x' }] });
            methodeUtilisee = init?.method ?? '';
            return jsonRes({});
        }) as FetchLike;
        await activerEcriture(30, TOKEN, fetchFn, { now: () => now });
        expect(methodeUtilisee).toBe('PATCH');
    });
});

describe('[VERROU-ECRITURE] desactiverEcriture', () => {
    it('fichier existant : écrit une échéance DANS LE PASSÉ (fermé immédiatement)', async () => {
        let corpsEnvoye = '';
        const fetchFn: FetchLike = (async (input: string, init?: RequestInit) => {
            if (String(input).includes('/files?')) return jsonRes({ files: [{ id: 'f1', name: WRITE_LOCK_FILE_NAME, modifiedTime: 'x' }] });
            corpsEnvoye = String(init?.body);
            return jsonRes({});
        }) as FetchLike;
        await desactiverEcriture(TOKEN, fetchFn, { now: () => 1_000_000 });
        const payload = JSON.parse(corpsEnvoye) as { deverrouilleJusqua: string };
        expect(Date.parse(payload.deverrouilleJusqua)).toBeLessThan(1_000_000);
    });

    it('aucun fichier : rien à fermer, ne crée rien (déjà verrouillé par défaut)', async () => {
        const creation = vi.fn();
        const fetchFn: FetchLike = (async (input: string) => {
            if (String(input).includes('/files?')) return jsonRes({ files: [] });
            creation();
            return jsonRes({});
        }) as FetchLike;
        await desactiverEcriture(TOKEN, fetchFn);
        expect(creation).not.toHaveBeenCalled();
    });
});

describe('[VERROU-ECRITURE] round-trip activer → lireEtatEcriture voit la même échéance', () => {
    it('activer(15) puis lire (fichier maintenant présent) : la date lue correspond exactement', async () => {
        const now = 2_000_000;
        const attendu = new Date(now + 15 * 60_000).toISOString();
        const creation = vi.fn();
        const fetchCreation: FetchLike = (async (input: string) => {
            if (!String(input).includes('/upload/')) return jsonRes({ files: [] });
            creation();
            return jsonRes({ id: 'f1' });
        }) as FetchLike;
        await activerEcriture(15, TOKEN, fetchCreation, { now: () => now });
        expect(creation).toHaveBeenCalledTimes(1);
        // Relecture indépendante : simule le fichier maintenant présent avec l'échéance calculée.
        const fetchLecture: FetchLike = (async (input: string) => {
            if (String(input).includes('/files?')) return jsonRes({ files: [{ id: 'f1', name: WRITE_LOCK_FILE_NAME, modifiedTime: 'x' }] });
            return jsonRes({ deverrouilleJusqua: attendu, version: 1 });
        }) as FetchLike;
        const etat = await lireEtatEcriture(TOKEN, fetchLecture);
        expect(etat.deverrouilleJusqua).toBe(attendu);
    });
});
