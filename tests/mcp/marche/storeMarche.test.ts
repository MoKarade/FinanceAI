import { describe, it, expect } from 'vitest';
import { creerStoreMarcheDrive, FichierMarcheIllisibleError, NOM_FICHIER_MARCHE } from '../../../mcp/marche/storeMarche';
import { fichierVide } from '../../../mcp/marche/fichierMarche';
import { StateConflictError } from '../../../mcp/state/stateErrors';
import type { FetchLike } from '../../../services/googleDrive/driveAppData';

/** Mini Drive en mémoire : juste ce que `driveAppData` appelle (recherche par nom, lecture, création, mise à jour). */
function faussDrive(initial?: unknown) {
    const fichiers = new Map<string, unknown>();
    if (initial !== undefined) fichiers.set('f1', initial);
    const appels = { creations: 0, miseAJour: 0 };
    const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
    const fetchFn: FetchLike = async (url, init) => {
        const methode = init?.method ?? 'GET';
        if (url.includes('/drive/v3/files?') && methode === 'GET') {
            const q = new URL(url).searchParams.get('q') ?? '';
            return json({ files: q.includes(NOM_FICHIER_MARCHE) && fichiers.size > 0 ? [{ id: 'f1', modifiedTime: 't' }] : [] });
        }
        if (url.includes('alt=media')) return json(fichiers.get('f1'));
        if (methode === 'POST') {
            const corps = String(init?.body);
            const contenu = corps.split('Content-Type: application/json\r\n\r\n')[1]?.split('\r\n--')[0] ?? 'null';
            fichiers.set('f1', JSON.parse(contenu));
            appels.creations++;
            return json({ id: 'f1' });
        }
        if (methode === 'PATCH') { fichiers.set('f1', JSON.parse(String(init?.body))); appels.miseAJour++; return json({}); }
        return json({}, 404);
    };
    return { fetchFn, fichiers, appels };
}

const jeton = async () => 'jeton';
const MAINT = '2026-10-28T20:00:00.000Z';

describe('[MARCHE-STORE] store Drive du magasin de marché', () => {
    it('fichier absent : lire() rend null (première passe), pas une erreur', async () => {
        const d = faussDrive();
        expect(await creerStoreMarcheDrive(jeton, d.fetchFn).lire()).toBeNull();
    });

    it('première écriture : crée le fichier avec rev 1 ; la suivante exige ce rev et rend rev 2', async () => {
        const d = faussDrive();
        const store = creerStoreMarcheDrive(jeton, d.fetchFn);
        const premier = await store.ecrire(fichierVide(MAINT), null);
        expect(premier.rev).toBe(1);
        expect(d.appels.creations).toBe(1);
        const lu = await store.lire();
        expect(lu?.rev).toBe(1);
        const second = await store.ecrire({ ...lu!, magasin: { ...lu!.magasin, majLe: '2026-10-29T20:00:00.000Z' } }, 1);
        expect(second.rev).toBe(2);
        expect(d.appels.miseAJour).toBe(1);
    });

    it('CONFLIT : le fichier a avancé depuis la lecture → StateConflictError, rien d\'écrasé', async () => {
        const d = faussDrive({ ...fichierVide(MAINT), rev: 5 });
        const store = creerStoreMarcheDrive(jeton, d.fetchFn);
        await expect(store.ecrire(fichierVide(MAINT), 4)).rejects.toBeInstanceOf(StateConflictError);
        expect(d.appels.miseAJour).toBe(0);
        expect((d.fichiers.get('f1') as { rev: number }).rev).toBe(5);
    });

    it('CONFLIT : on croyait le fichier absent, il existe déjà → refus', async () => {
        const d = faussDrive({ ...fichierVide(MAINT), rev: 1 });
        await expect(creerStoreMarcheDrive(jeton, d.fetchFn).ecrire(fichierVide(MAINT), null)).rejects.toBeInstanceOf(StateConflictError);
        expect(d.appels.creations).toBe(0);
    });

    it('fichier illisible : erreur nommée (panne réelle), jamais un « vide » qui effacerait le magasin', async () => {
        const d = faussDrive({ version: 99 });
        const journal: string[] = [];
        const orig = console.error; console.error = (...a: unknown[]) => { journal.push(a.join(' ')); };
        try {
            await expect(creerStoreMarcheDrive(jeton, d.fetchFn).lire()).rejects.toBeInstanceOf(FichierMarcheIllisibleError);
        } finally { console.error = orig; }
        expect(journal.join(' ')).toMatch(/illisible/);
    });
});
