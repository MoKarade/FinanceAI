import { describe, it, expect } from 'vitest';
import { jourDuQuebec, runPasseMarche } from '../../../mcp/marche/runMarche';
import { fichierVide, type FichierMarche } from '../../../mcp/marche/fichierMarche';

const CIBLE = { isin: 'XX0000000002', symboleEodhd: 'ABC.US', devise: 'USD' as const };
const avecCible = (rev: number): FichierMarche => ({ ...fichierVide('2026-10-01T00:00:00.000Z'), rev, cibles: [CIBLE] });
import type { StoreMarche } from '../../../mcp/marche/storeMarche';
import type { LecteursMarche } from '../../../services/marche/passeMagasin';

const MAINT = new Date('2026-10-28T20:00:00.000Z'); // mercredi

function faussStore(initial: FichierMarche | null) {
    const etat = { ecrit: [] as Array<{ f: FichierMarche; rev: number | null }> };
    const store: StoreMarche = {
        lire: async () => initial,
        ecrire: async (f, rev) => { etat.ecrit.push({ f, rev }); return { ...f, rev: (rev ?? 0) + 1 }; },
    };
    return { store, etat };
}

function lecteurs(): LecteursMarche & { appels: string[] } {
    const appels: string[] = [];
    return {
        appels,
        lireClotures: async (s) => { appels.push(`eod:${s}`); return { statut: 'ok', points: [['2026-10-27', 100.5]], ecartes: 0 }; },
        lireTaux: async (d) => { appels.push(`bdc:${d}`); return { statut: 'ok', points: [['2026-10-27', 1.4]], ecartes: 0 }; },
    };
}

describe('[MARCHE-RUN] runPasseMarche', () => {
    it('le jour est celui du Québec, pas celui d\'UTC (minuit UTC = la veille à Québec)', () => {
        expect(jourDuQuebec(new Date('2026-10-29T02:00:00.000Z'))).toBe('2026-10-28');
        expect(jourDuQuebec(new Date('2026-10-28T20:00:00.000Z'))).toBe('2026-10-28');
    });

    it('fichier absent : démarre vide ; sans cible il n\'y a rien à lire ni à écrire (le référentiel vient de #23)', async () => {
        const { store, etat } = faussStore(null);
        const l = lecteurs();
        const r = await runPasseMarche(store, l, { maintenant: MAINT, essaiABlanc: false });
        expect(r).toMatchObject({ ecrit: false, cibles: 0 });
        expect(l.appels).toEqual([]);
        expect(etat.ecrit).toEqual([]);
    });

    it('avec une cible : lit les clôtures ET les taux, et l\'écriture exige le rev LU', async () => {
        const { store, etat } = faussStore(avecCible(7));
        const l = lecteurs();
        const r = await runPasseMarche(store, l, { maintenant: MAINT, essaiABlanc: false });
        expect(r.ecrit).toBe(true);
        expect(etat.ecrit[0].rev).toBe(7);
        expect(l.appels).toContain('eod:ABC.US');
        expect(l.appels).toContain('bdc:USD');
        expect(etat.ecrit[0].f.magasin.taux.USD?.length).toBeGreaterThan(0);
        expect(etat.ecrit[0].f.magasin.clotures['XX0000000002'].points.length).toBeGreaterThan(0);
    });

    it('ESSAI À BLANC : aucun appel réseau, aucune écriture', async () => {
        const { store, etat } = faussStore(avecCible(1));
        const l = lecteurs();
        const r = await runPasseMarche(store, l, { maintenant: MAINT, essaiABlanc: true });
        expect(r.ecrit).toBe(false);
        expect(l.appels).toEqual([]);
        expect(etat.ecrit).toEqual([]);
        expect(r.rapport.essaiABlanc).toBe(true);
    });

    it('rien n\'a changé : pas d\'écriture (le fichier n\'avance pas pour rien)', async () => {
        const { store, etat } = faussStore(avecCible(1));
        const muet: LecteursMarche = {
            lireClotures: async () => ({ statut: 'ok', points: [], ecartes: 0 }),
            lireTaux: async () => ({ statut: 'ok', points: [], ecartes: 0 }),
        };
        const r = await runPasseMarche(store, muet, { maintenant: MAINT, essaiABlanc: false });
        expect(r.ecrit).toBe(false);
        expect(etat.ecrit).toEqual([]);
    });

    it('un conflit d\'écriture remonte à l\'appelant (la route le traduit en 200 conflict)', async () => {
        const store: StoreMarche = { lire: async () => avecCible(1), ecrire: async () => { throw new Error('conflit'); } };
        await expect(runPasseMarche(store, lecteurs(), { maintenant: MAINT, essaiABlanc: false })).rejects.toThrow('conflit');
    });
});
