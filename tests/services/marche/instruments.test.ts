// tests/services/marche/instruments.test.ts
//
// [PTF-L1C3-INSTRUMENTS] Résolution de l'ISIN et du symbole EODHD d'un titre détenu.
// Données SYNTHÉTIQUES : ISIN au préfixe non attribué `ZZ`, symboles inventés. Aucun réseau.
import { describe, it, expect } from 'vitest';
import { resoudreInstruments } from '../../../services/marche/instruments';

const ISIN_A = 'ZZ0000000010';
const ISIN_B = 'ZZ0000000020';

type Candidat = { code: string; echange: string; isin: string | null; devise: string | null };
const cand = (code: string, echange: string, isin: string | null, devise: string | null): Candidat =>
    ({ code, echange, isin, devise });

const resoudre = (symbole: string, devise: 'USD' | 'CAD' | 'EUR', candidats?: Candidat[]) =>
    resoudreInstruments([{ symbole, devise }], new Map(candidats ? [[symbole, candidats]] : []))[0];

describe('resoudreInstruments', () => {
    it('trouvé : un seul candidat de même code, même devise, ISIN valide', () => {
        expect(resoudre('AAAA', 'USD', [cand('AAAA', 'US', ISIN_A, 'USD')]))
            .toEqual({ statut: 'resolu', isin: ISIN_A, symboleEodhd: 'AAAA.US', devise: 'USD' });
    });

    it('ignore la casse du code, de la place et de la devise, et rend un symbole en majuscules', () => {
        expect(resoudre('aaaa', 'USD', [cand('aaaa', 'us', ISIN_A, 'usd')]))
            .toEqual({ statut: 'resolu', isin: ISIN_A, symboleEodhd: 'AAAA.US', devise: 'USD' });
    });

    it('doublons exacts d’un même candidat : toujours un seul titre', () => {
        const c = cand('AAAA', 'US', ISIN_A, 'USD');
        expect(resoudre('AAAA', 'USD', [c, { ...c }]).statut).toBe('resolu');
    });

    it('introuvable : aucune recherche, liste vide, ou seulement des titres d’un autre code', () => {
        expect(resoudre('AAAA', 'USD')).toEqual({ statut: 'refuse', raison: 'introuvable' });
        expect(resoudre('AAAA', 'USD', [])).toEqual({ statut: 'refuse', raison: 'introuvable' });
        expect(resoudre('AAAA', 'USD', [cand('AAAB', 'US', ISIN_A, 'USD')]))
            .toEqual({ statut: 'refuse', raison: 'introuvable' });
    });

    it('un candidat voisin d’un autre code ne crée pas d’ambiguïté', () => {
        expect(resoudre('AAAA', 'USD', [cand('AAAA', 'US', ISIN_A, 'USD'), cand('AAAB', 'US', ISIN_B, 'USD')]).statut)
            .toBe('resolu');
    });

    it('ambigu : deux ISIN distincts pour le même symbole de cotation', () => {
        expect(resoudre('AAAA', 'USD', [cand('AAAA', 'US', ISIN_A, 'USD'), cand('AAAA', 'US', ISIN_B, 'USD')]))
            .toEqual({ statut: 'refuse', raison: 'ambigu' });
    });

    it('ambigu : un même ISIN sur deux places, sans suffixe pour départager', () => {
        expect(resoudre('AAAA', 'USD', [cand('AAAA', 'US', ISIN_A, 'USD'), cand('AAAA', 'NEO', ISIN_A, 'USD')]))
            .toEqual({ statut: 'refuse', raison: 'ambigu' });
    });

    it('le suffixe du symbole détenu départage quand il désigne exactement une place', () => {
        expect(resoudre('AAAA.TO', 'CAD', [cand('AAAA', 'US', ISIN_A, 'CAD'), cand('AAAA', 'TO', ISIN_A, 'CAD')]))
            .toEqual({ statut: 'resolu', isin: ISIN_A, symboleEodhd: 'AAAA.TO', devise: 'CAD' });
    });

    it('un suffixe qui ne correspond à aucune place ne force rien : ambigu s’il y en a plusieurs', () => {
        expect(resoudre('AAAA.XX', 'CAD', [cand('AAAA', 'US', ISIN_A, 'CAD'), cand('AAAA', 'TO', ISIN_A, 'CAD')]))
            .toEqual({ statut: 'refuse', raison: 'ambigu' });
    });

    it('un suffixe sans correspondance mais une seule place possible : résolu', () => {
        expect(resoudre('AAAA.XX', 'EUR', [cand('AAAA', 'PA', ISIN_A, 'EUR')]).statut).toBe('resolu');
    });

    it('devise douteuse : la devise de la source diffère de celle de l’état', () => {
        expect(resoudre('AAAA', 'CAD', [cand('AAAA', 'US', ISIN_A, 'USD')]))
            .toEqual({ statut: 'refuse', raison: 'devise-douteuse' });
    });

    it('devise douteuse : la source ne donne pas la devise (jamais comblée)', () => {
        expect(resoudre('AAAA', 'USD', [cand('AAAA', 'US', ISIN_A, null)]))
            .toEqual({ statut: 'refuse', raison: 'devise-douteuse' });
    });

    it('seule la place de même devise compte : l’autre place en devise différente n’ajoute pas d’ambiguïté', () => {
        expect(resoudre('AAAA', 'CAD', [cand('AAAA', 'US', ISIN_A, 'USD'), cand('AAAA', 'TO', ISIN_A, 'CAD')]))
            .toEqual({ statut: 'resolu', isin: ISIN_A, symboleEodhd: 'AAAA.TO', devise: 'CAD' });
    });

    it('ISIN absent ou mal formé : refus, jamais deviné', () => {
        expect(resoudre('AAAA', 'USD', [cand('AAAA', 'US', null, 'USD')]))
            .toEqual({ statut: 'refuse', raison: 'isin-absent' });
        expect(resoudre('AAAA', 'USD', [cand('AAAA', 'US', 'pas-un-isin', 'USD')]))
            .toEqual({ statut: 'refuse', raison: 'isin-absent' });
    });

    it('une place sans ISIN à côté d’une place avec ISIN : ambigu (rien ne dit qu’elles sont le même titre)', () => {
        expect(resoudre('AAAA', 'USD', [cand('AAAA', 'US', ISIN_A, 'USD'), cand('AAAA', 'NEO', null, 'USD')]))
            .toEqual({ statut: 'refuse', raison: 'ambigu' });
    });

    it('un code ou une place mal formés sont écartés (jamais un symbole inventé)', () => {
        expect(resoudre('AAAA', 'USD', [cand('AAAA', 'U S', ISIN_A, 'USD')]))
            .toEqual({ statut: 'refuse', raison: 'introuvable' });
    });

    it('résout plusieurs titres dans l’ordre donné, chacun avec sa propre recherche', () => {
        const recherches = new Map<string, Candidat[]>([
            ['AAAA', [cand('AAAA', 'US', ISIN_A, 'USD')]],
            ['BBBB', [cand('BBBB', 'PA', ISIN_B, 'EUR')]],
        ]);
        const res = resoudreInstruments(
            [{ symbole: 'BBBB', devise: 'EUR' }, { symbole: 'CCCC', devise: 'CAD' }, { symbole: 'AAAA', devise: 'USD' }],
            recherches,
        );
        expect(res.map((r) => r.statut)).toEqual(['resolu', 'refuse', 'resolu']);
        expect(res[0]).toMatchObject({ isin: ISIN_B, symboleEodhd: 'BBBB.PA' });
        expect(res[1]).toEqual({ statut: 'refuse', raison: 'introuvable' });
        expect(res[2]).toMatchObject({ isin: ISIN_A, symboleEodhd: 'AAAA.US' });
    });

    it('ne modifie pas ses entrées', () => {
        const candidats = [cand('AAAA', 'US', ISIN_A, 'USD'), cand('AAAA', 'US', ISIN_A, 'USD')];
        const avant = JSON.stringify(candidats);
        resoudre('AAAA', 'USD', candidats);
        expect(JSON.stringify(candidats)).toBe(avant);
    });
});
