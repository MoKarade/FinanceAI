// tests/mcp/verrouEcriture.test.ts
//
// [VERROU-ECRITURE] Étape 2 — le store de LECTURE du verrou côté MCP (`creerVerificateurVerrou`).
// Ce module ne sait QUE lire `financeai-write-lock.json` dans appDataFolder ; il n'expose AUCUNE
// fonction de création/prolongation (§4 du plan : seule l'app web écrit ce fichier). Échec fermé
// partout : réseau, fichier absent, JSON invalide, champ manquant/invalide = verrou considéré fermé.
import { describe, it, expect, vi } from 'vitest';
import { creerVerificateurVerrou, WRITE_LOCK_FILE_NAME } from '../../mcp/drive/writeLockStore';
import type { FetchLike } from '../../services/googleDrive/driveAppData';

const jsonRes = (body: unknown, ok = true, status = 200): Response =>
    ({ ok, status, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response);

/** Fabrique un fetch minimal : la 1ère requête liste (recherche du fichier), la 2e lit son contenu. */
function fabriquerFetch(opts: { fichierExiste: boolean; contenu?: unknown; statusListe?: number; statusLecture?: number }): FetchLike {
    const { fichierExiste, contenu, statusListe = 200, statusLecture = 200 } = opts;
    let appel = 0;
    return (async (_input: string, _init?: RequestInit) => {
        appel += 1;
        if (appel === 1) {
            if (statusListe !== 200) return jsonRes({ error: 'boom' }, false, statusListe);
            return jsonRes({ files: fichierExiste ? [{ id: 'file-1', name: WRITE_LOCK_FILE_NAME, modifiedTime: '2026-09-28T00:00:00Z' }] : [] });
        }
        if (statusLecture !== 200) return jsonRes({ error: 'boom' }, false, statusLecture);
        return jsonRes(contenu);
    }) as FetchLike;
}

const getToken = async (): Promise<string> => 'jeton-de-test';

describe('[VERROU-ECRITURE] creerVerificateurVerrou — lecture seule, échec fermé', () => {
    it('aucun fichier de verrou dans appDataFolder : fermé', async () => {
        const verifier = creerVerificateurVerrou(getToken, fabriquerFetch({ fichierExiste: false }));
        expect(await verifier()).toBe(false);
    });

    it('fichier présent, deverrouilleJusqua dans le futur : ouvert', async () => {
        const now = () => 1_000_000;
        const futur = new Date(now() + 60_000).toISOString();
        const verifier = creerVerificateurVerrou(
            getToken,
            fabriquerFetch({ fichierExiste: true, contenu: { deverrouilleJusqua: futur, version: 1 } }),
            { now },
        );
        expect(await verifier()).toBe(true);
    });

    it('fichier présent, deverrouilleJusqua dans le passé (expiré) : fermé', async () => {
        const now = () => 1_000_000;
        const passe = new Date(now() - 1).toISOString();
        const verifier = creerVerificateurVerrou(
            getToken,
            fabriquerFetch({ fichierExiste: true, contenu: { deverrouilleJusqua: passe, version: 1 } }),
            { now },
        );
        expect(await verifier()).toBe(false);
    });

    it('deverrouilleJusqua exactement à now : fermé (borne stricte, pas ">=")', async () => {
        const now = () => 1_000_000;
        const pile = new Date(now()).toISOString();
        const verifier = creerVerificateurVerrou(
            getToken,
            fabriquerFetch({ fichierExiste: true, contenu: { deverrouilleJusqua: pile, version: 1 } }),
            { now },
        );
        expect(await verifier()).toBe(false);
    });

    it('champ deverrouilleJusqua absent : fermé', async () => {
        const verifier = creerVerificateurVerrou(getToken, fabriquerFetch({ fichierExiste: true, contenu: { version: 1 } }));
        expect(await verifier()).toBe(false);
    });

    it('champ deverrouilleJusqua invalide (pas une date) : fermé', async () => {
        const verifier = creerVerificateurVerrou(
            getToken,
            fabriquerFetch({ fichierExiste: true, contenu: { deverrouilleJusqua: 'pas-une-date', version: 1 } }),
        );
        expect(await verifier()).toBe(false);
    });

    it('contenu qui n\'est pas un objet (ex. un tableau) : fermé, pas d\'exception', async () => {
        const verifier = creerVerificateurVerrou(getToken, fabriquerFetch({ fichierExiste: true, contenu: [1, 2, 3] }));
        expect(await verifier()).toBe(false);
    });

    it('erreur réseau/HTTP à la recherche du fichier : fermé, pas d\'exception', async () => {
        const verifier = creerVerificateurVerrou(getToken, fabriquerFetch({ fichierExiste: false, statusListe: 500 }));
        expect(await verifier()).toBe(false);
    });

    it('erreur réseau/HTTP à la lecture du contenu : fermé, pas d\'exception', async () => {
        const verifier = creerVerificateurVerrou(getToken, fabriquerFetch({ fichierExiste: true, statusLecture: 500 }));
        expect(await verifier()).toBe(false);
    });

    it('le jeton d\'accès (getToken) échoue : fermé, pas d\'exception', async () => {
        const verifier = creerVerificateurVerrou(async () => {
            throw new Error('token indisponible');
        }, fabriquerFetch({ fichierExiste: false }));
        expect(await verifier()).toBe(false);
    });

    it('cache court (≤ 10 s) : un 2e appel dans la fenêtre ne refait PAS d\'appel réseau', async () => {
        let t = 1_000_000;
        const now = () => t;
        const futur = new Date(t + 60_000).toISOString();
        const fetchEspion = vi.fn(fabriquerFetch({ fichierExiste: true, contenu: { deverrouilleJusqua: futur, version: 1 } }));
        const verifier = creerVerificateurVerrou(getToken, fetchEspion, { now, ttlMs: 10_000 });
        expect(await verifier()).toBe(true);
        const appelsApres1er = fetchEspion.mock.calls.length;
        t += 5_000; // dans la fenêtre de cache
        expect(await verifier()).toBe(true);
        expect(fetchEspion.mock.calls.length).toBe(appelsApres1er); // aucun nouvel appel réseau
    });

    it('cache expiré (> ttl) : un nouvel appel réseau relit Drive, et voit un verrou refermé entre-temps', async () => {
        let t = 1_000_000;
        const now = () => t;
        const fetchDynamique: FetchLike = (async (_input: string) => {
            // 1er cycle (2 appels) : ouvert jusqu'à t+2000 ; 2e cycle : fichier absent (fermé).
            if (t < 1_002_000) {
                return jsonRes({ files: [{ id: 'f', name: WRITE_LOCK_FILE_NAME, modifiedTime: 'x' }] });
            }
            return jsonRes({ files: [] });
        }) as unknown as FetchLike;
        // Fetch composite : liste puis lecture, mais on bascule le contenu selon `t`.
        let appel = 0;
        const fetchFn: FetchLike = (async (input: string, init?: RequestInit) => {
            appel += 1;
            if (appel % 2 === 1) return fetchDynamique(input, init);
            return jsonRes({ deverrouilleJusqua: new Date(1_002_500).toISOString(), version: 1 });
        }) as FetchLike;
        const verifier = creerVerificateurVerrou(getToken, fetchFn, { now, ttlMs: 1_000 });
        expect(await verifier()).toBe(true); // t=1_000_000, ouvert jusqu'à 1_002_500
        t = 1_003_000; // cache expiré (> 1s) ET verrou expiré (fichier absent au 2e cycle simulé)
        expect(await verifier()).toBe(false);
    });

    it('aucune fonction de création/prolongation exportée par ce module (lecture seule)', async () => {
        const mod = await import('../../mcp/drive/writeLockStore');
        const exports = Object.keys(mod);
        expect(exports).toContain('creerVerificateurVerrou');
        expect(exports).toContain('WRITE_LOCK_FILE_NAME');
        // Aucun export ne doit permettre d'ÉCRIRE le verrou depuis le MCP (§4 du plan). Filtre sur des
        // noms de FONCTION plausibles (camelCase minuscule au départ), pas sur la constante de nom de fichier.
        const suspects = exports.filter((n) => /^[a-z]/.test(n) && /activer|desactiver|unlock|ecrire|write|set|create/i.test(n));
        expect(suspects, `export suspect côté MCP (écriture possible) : ${suspects.join(', ')}`).toEqual([]);
    });
});
