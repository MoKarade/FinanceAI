import { describe, it, expect } from 'vitest';
import { fichierVide, lireFichierMarche } from '../../../mcp/marche/fichierMarche';

const MAINT = '2026-10-28T20:00:00.000Z';
const ISIN_TEST = 'XX0000000002';

const valide = () => ({ ...fichierVide(MAINT), rev: 3, cibles: [{ isin: ISIN_TEST, symboleEodhd: 'ABC.US', devise: 'USD' }] });

describe('[MARCHE-FICHIER] lireFichierMarche', () => {
    it('rend EXACTEMENT ce qui a été écrit (aller-retour), rev compris', () => {
        const lu = lireFichierMarche(JSON.parse(JSON.stringify(valide())));
        expect(lu).toEqual({ ok: true, fichier: valide() });
    });

    it('un fichier vide créé par la route est lisible, sans cible', () => {
        const lu = lireFichierMarche(JSON.parse(JSON.stringify(fichierVide(MAINT))));
        expect(lu.ok).toBe(true);
        if (lu.ok) expect(lu.fichier.cibles).toEqual([]);
    });

    it.each([
        ['pas un objet', null],
        ['version inconnue', { ...valide(), version: 2 }],
        ['rev négatif', { ...valide(), rev: -1 }],
        ['rev fractionnaire', { ...valide(), rev: 1.5 }],
        ['cibles absentes', { ...valide(), cibles: undefined }],
        ['ISIN mal formé', { ...valide(), cibles: [{ isin: 'abc', symboleEodhd: 'ABC.US', devise: 'USD' }] }],
        ['symbole EODHD mal formé', { ...valide(), cibles: [{ isin: ISIN_TEST, symboleEodhd: 'AB C/../x', devise: 'USD' }] }],
        ['devise inconnue', { ...valide(), cibles: [{ isin: ISIN_TEST, symboleEodhd: 'ABC.US', devise: 'GBP' }] }],
        ['magasin mal formé', { ...valide(), magasin: { version: 1 } }],
    ])('refuse en entier : %s', (_nom, json) => {
        const lu = lireFichierMarche(json);
        expect(lu.ok).toBe(false);
        if (!lu.ok) expect(lu.erreurs.length).toBeGreaterThan(0);
    });

    it('les erreurs de cibles ne nomment ni l\'ISIN ni le symbole fautifs', () => {
        const lu = lireFichierMarche({ ...valide(), cibles: [{ isin: 'SECRET-ISIN', symboleEodhd: 'SECRET/SYM', devise: 'USD' }] });
        expect(lu.ok).toBe(false);
        if (!lu.ok) expect(lu.erreurs.join(' ')).not.toMatch(/SECRET/);
    });
});
