// tests/services/marche/magasinMarche.test.ts
//
// [PTF-L1C1-MAGASIN-FORMAT] Format, validation, fusion et lecture à une date du magasin de marché.
// Données SYNTHÉTIQUES (ISIN au préfixe non attribué `ZZ`, cours et taux inventés).
import { describe, it, expect } from 'vitest';
import {
    clotureAu, fusionnerClotures, fusionnerTaux, lireMagasin, magasinVide, tauxAu,
    type MagasinMarche, type PointCloture, type PointTaux,
} from '../../../services/marche/magasinMarche';

const ISIN = 'ZZ0000000001';
const base = (): MagasinMarche => ({
    ...magasinVide('2026-01-31T21:00:00.000Z'),
    clotures: { [ISIN]: { devise: 'USD', points: [['2026-01-05', 100.5, 'eodhd'], ['2026-01-06', 101.25, 'eodhd']] } },
    taux: { USD: [['2026-01-05', 1.35], ['2026-01-06', 1.36]] },
    fractionnements: [{ isin: ISIN, date: '2026-01-07', de: 1, a: 10, source: 'eodhd' }],
    dividendes: [{ isin: ISIN, dateEx: '2026-01-06', montant: 0.25, devise: 'USD', source: 'eodhd' }],
});

describe('[PTF-L1C1] validation : refus, jamais réparation', () => {
    it('un magasin bien formé passe, un magasin vide aussi', () => {
        expect(lireMagasin(base()).ok).toBe(true);
        expect(lireMagasin(JSON.parse(JSON.stringify(magasinVide('2026-01-31T21:00:00.000Z')))).ok).toBe(true);
    });

    it('une version FUTURE est refusée (la lire comme une v1 perdrait ce qu’elle ajoute)', () => {
        const r = lireMagasin({ ...base(), version: 2 });
        expect(r).toEqual({ ok: false, erreurs: [expect.stringContaining('version 2')] });
    });

    it.each([
        ['cours non fini', (m: MagasinMarche) => { (m.clotures[ISIN].points as unknown[])[0] = ['2026-01-05', Number.NaN, 'eodhd']; }],
        ['cours négatif', (m: MagasinMarche) => { (m.clotures[ISIN].points as unknown[])[0] = ['2026-01-05', -1, 'eodhd']; }],
        ['cours en texte', (m: MagasinMarche) => { (m.clotures[ISIN].points as unknown[])[0] = ['2026-01-05', '100.5', 'eodhd']; }],
        ['date impossible', (m: MagasinMarche) => { (m.clotures[ISIN].points as unknown[])[0] = ['2026-02-31', 100, 'eodhd']; }],
        ['source inconnue', (m: MagasinMarche) => { (m.clotures[ISIN].points as unknown[])[0] = ['2026-01-05', 100, 'bourse'] ; }],
        ['dates non triées', (m: MagasinMarche) => { m.clotures[ISIN].points.reverse(); }],
        ['date en double', (m: MagasinMarche) => { m.clotures[ISIN].points[1] = ['2026-01-05', 101, 'eodhd']; }],
        ['clé qui n’est pas un ISIN', (m: MagasinMarche) => { m.clotures.ABC = m.clotures[ISIN]; }],
        ['devise inconnue', (m: MagasinMarche) => { (m.clotures[ISIN] as { devise: string }).devise = 'GBX'; }],
        ['taux non positif', (m: MagasinMarche) => { m.taux.USD = [['2026-01-05', 0]]; }],
        ['taux d’une devise inconnue', (m: MagasinMarche) => { (m.taux as Record<string, PointTaux[]>).JPY = []; }],
        ['fractionnement à zéro', (m: MagasinMarche) => { m.fractionnements[0].de = 0; }],
        ['dividende non fini', (m: MagasinMarche) => { m.dividendes[0].montant = Number.POSITIVE_INFINITY; }],
    ])('refuse : %s', (_nom, casser) => {
        const m = base();
        casser(m);
        const r = lireMagasin(m);
        expect(r.ok).toBe(false);
    });

    it('les messages de refus ne citent aucun cours ni taux (journal public, conditions EODHD)', () => {
        const m = base();
        (m.clotures[ISIN].points as unknown[])[0] = ['2026-01-05', -98765.4321, 'eodhd'];
        m.taux.USD = [['2026-01-06', 1.36], ['2026-01-05', 1.35]];
        const r = lireMagasin(m);
        if (r.ok) throw new Error('attendu : refus');
        const tout = r.erreurs.join(' | ');
        expect(r.erreurs.length).toBeGreaterThanOrEqual(2);
        for (const valeur of ['98765', '4321', '1.36', '1.35', '1,36']) expect(tout).not.toContain(valeur);
    });
});

describe('[PTF-L1C1] fusion : idempotente, et la source décide du statut', () => {
    const existants: PointCloture[] = [['2026-01-05', 100, 'eodhd'], ['2026-01-06', 90, 'yahoo']];

    it('ajout, promotion secours → officielle, secours ignoré sur une officielle', () => {
        const r = fusionnerClotures(existants, [
            ['2026-01-07', 102, 'eodhd'],
            ['2026-01-06', 101, 'eodhd'],
            ['2026-01-05', 55, 'yahoo'],
        ]);
        expect(r.points).toEqual([['2026-01-05', 100, 'eodhd'], ['2026-01-06', 101, 'eodhd'], ['2026-01-07', 102, 'eodhd']]);
        expect({ a: r.ajouts, r: r.revisions, p: r.promotions, i: r.ignores }).toEqual({ a: 1, r: 0, p: 1, i: 1 });
    });

    it('même source, valeur corrigée → révision comptée ; même point → rien', () => {
        const r = fusionnerClotures(existants, [['2026-01-05', 100.5, 'eodhd'], ['2026-01-06', 90, 'yahoo']]);
        expect(r.points[0]).toEqual(['2026-01-05', 100.5, 'eodhd']);
        expect({ a: r.ajouts, r: r.revisions, p: r.promotions, i: r.ignores }).toEqual({ a: 0, r: 1, p: 0, i: 0 });
    });

    it('rejouer la même lecture ne change rien et ne compte rien (rattrapage à fenêtres qui se recouvrent)', () => {
        const recus: PointCloture[] = [['2026-01-07', 102, 'eodhd'], ['2026-01-06', 101, 'eodhd']];
        const une = fusionnerClotures(existants, recus);
        const deux = fusionnerClotures(une.points, recus);
        expect(deux.points).toEqual(une.points);
        expect(deux.ajouts + deux.revisions + deux.promotions + deux.ignores).toBe(0);
    });

    it('le résultat est trié même si les points reçus ne le sont pas, et l’entrée n’est pas mutée', () => {
        const copie = JSON.stringify(existants);
        const r = fusionnerClotures(existants, [['2026-01-09', 1, 'eodhd'], ['2026-01-02', 1, 'eodhd']]);
        expect(r.points.map((p) => p[0])).toEqual(['2026-01-02', '2026-01-05', '2026-01-06', '2026-01-09']);
        expect(JSON.stringify(existants)).toBe(copie);
        // Et ce qui sort de la fusion passe la validation : la tâche serveur peut l'écrire tel quel.
        const m = { ...base(), clotures: { [ISIN]: { devise: 'USD' as const, points: r.points } } };
        expect(lireMagasin(m).ok).toBe(true);
    });

    it('taux : ajout et révision, idempotent', () => {
        const r = fusionnerTaux([['2026-01-05', 1.35]], [['2026-01-05', 1.3501], ['2026-01-06', 1.36]]);
        expect(r.points).toEqual([['2026-01-05', 1.3501], ['2026-01-06', 1.36]]);
        expect([r.ajouts, r.revisions]).toEqual([1, 1]);
        const bis = fusionnerTaux(r.points, [['2026-01-05', 1.3501], ['2026-01-06', 1.36]]);
        expect([bis.ajouts, bis.revisions]).toEqual([0, 0]);
    });
});

describe('[PTF-L1C1] lecture à une date : le report se CALCULE, il ne s’écrit pas', () => {
    const serie = { devise: 'USD' as const, points: [['2026-01-02', 10, 'eodhd'], ['2026-01-05', 11, 'yahoo']] as PointCloture[] };

    it('jour de séance → officielle / secours selon la source ; lendemain → reportée avec son âge', () => {
        expect(clotureAu(serie, '2026-01-02', 5)).toEqual({ statut: 'officielle', valeur: 10, dateSource: '2026-01-02', ageJours: 0, source: 'eodhd' });
        expect(clotureAu(serie, '2026-01-05', 5)).toMatchObject({ statut: 'secours', valeur: 11 });
        // Samedi : dernier cours connu, vendredi, reporté d'un jour.
        expect(clotureAu(serie, '2026-01-03', 5)).toEqual({ statut: 'reportee', valeur: 10, dateSource: '2026-01-02', ageJours: 1, statutSource: 'officielle' });
    });

    it('au-delà de l’âge maximal → périmée, sans valeur ; avant la série → absente', () => {
        expect(clotureAu(serie, '2026-01-12', 5)).toEqual({ statut: 'perimee', dateSource: '2026-01-05', ageJours: 7 });
        // Frontière : âge = seuil → encore servi.
        expect(clotureAu(serie, '2026-01-10', 5)).toMatchObject({ statut: 'reportee', ageJours: 5 });
        expect(clotureAu(serie, '2026-01-01', 5)).toEqual({ statut: 'absente' });
        expect(clotureAu(undefined, '2026-01-05', 5)).toEqual({ statut: 'absente' });
    });

    it('la recherche trouve le bon point sur une longue série (dichotomie contre recherche linéaire)', () => {
        const points: PointCloture[] = [];
        for (let j = 0; j < 400; j += 3) {
            const d = new Date(Date.UTC(2025, 0, 1 + j)).toISOString().slice(0, 10);
            points.push([d, j + 1, 'eodhd']);
        }
        const longue = { devise: 'CAD' as const, points };
        for (let j = 0; j < 410; j += 7) {
            const date = new Date(Date.UTC(2025, 0, 1 + j)).toISOString().slice(0, 10);
            const attendu = [...points].reverse().find((p) => p[0] <= date);
            const lu = clotureAu(longue, date, 10);
            expect('valeur' in lu ? lu.valeur : undefined).toBe(attendu?.[1]);
        }
    });

    it('taux : CAD vaut 1 sans lecture ; USD suit les mêmes règles', () => {
        const m = base();
        expect(tauxAu(m, 'CAD', '2026-01-05', 5)).toEqual({ statut: 'identite', valeur: 1 });
        expect(tauxAu(m, 'USD', '2026-01-06', 5)).toMatchObject({ statut: 'officielle', valeur: 1.36 });
        expect(tauxAu(m, 'USD', '2026-01-08', 5)).toMatchObject({ statut: 'reportee', valeur: 1.36, ageJours: 2 });
        expect(tauxAu(m, 'EUR', '2026-01-08', 5)).toEqual({ statut: 'absente' });
    });

    it('une date illisible est une erreur de l’appelant, pas une absence', () => {
        expect(() => clotureAu(serie, '05/01/2026', 5)).toThrow();
        expect(() => tauxAu(base(), 'USD', '2026-13-01', 5)).toThrow();
    });
});
