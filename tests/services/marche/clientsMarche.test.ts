// tests/services/marche/clientsMarche.test.ts
//
// [PTF-L1C1-CLIENTS-PURS] Lecture des réponses EODHD et Banque du Canada, sans réseau.
// Réponses EODHD SYNTHÉTIQUES (forme du champ `close` mesurée au Lot 0.5b) ; la forme Valet est
// vérifiée sur la réponse RÉELLE enregistrée (`tests/fixtures/bdcFxRatesDaily.json`, taux publics).
import { describe, it, expect } from 'vitest';
import {
    lireReponseEodhd, lireSerieDateeBdc, urlCloturesEodhd, urlSerieBdc,
} from '../../../services/marche/clientsMarche';
import reponseBdcReelle from '../../fixtures/bdcFxRatesDaily.json';

const ligne = (date: string, close: unknown, ajuste = 1) =>
    ({ date, open: 1, high: 1, low: 1, close, adjusted_close: ajuste, volume: 10 });

describe('[PTF-L1C1] EODHD', () => {
    it('lit le champ close (BRUT), jamais adjusted_close', () => {
        const r = lireReponseEodhd([ligne('2026-01-05', 250, 25), ligne('2026-01-06', 260, 26)]);
        expect(r).toEqual({ statut: 'ok', points: [['2026-01-05', 250], ['2026-01-06', 260]], ecartes: 0 });
    });

    it('écarte et COMPTE les lignes illisibles et les dates en doublon (les deux : laquelle croire ?)', () => {
        const r = lireReponseEodhd([
            ligne('2026-01-07', 3), ligne('2026-01-05', 1),
            ligne('2026-01-06', null), ligne('2026-01-06', '2'), ligne('06/01/2026', 2), ligne('2026-01-08', 0),
            ligne('2026-01-09', 5), ligne('2026-01-09', 6),
        ]);
        expect(r).toEqual({ statut: 'ok', points: [['2026-01-05', 1], ['2026-01-07', 3]], ecartes: 6 });
    });

    it('une réponse qui n’est pas un tableau est une ERREUR décrite par sa forme, sans son contenu', () => {
        const r = lireReponseEodhd({ error: 'Ticker not found 98765' });
        expect(r).toEqual({ statut: 'erreur', forme: 'un objet à 1 clé(s)' });
        expect(lireReponseEodhd('Unauthenticated')).toMatchObject({ statut: 'erreur' });
        expect(JSON.stringify(lireReponseEodhd('Unauthenticated 98765'))).not.toContain('98765');
        // Un tableau vide n'est PAS une erreur : fenêtre sans séance (fin de semaine, jour férié).
        expect(lireReponseEodhd([])).toEqual({ statut: 'ok', points: [], ecartes: 0 });
    });

    it('URL : clôtures quotidiennes, bornes incluses, symbole et clé encodés ; entrée invalide → lève', () => {
        const u = new URL(urlCloturesEodhd('ABC.US', '2026-01-01', '2026-01-31', 'cle+secrete'));
        expect(u.origin + u.pathname).toBe('https://eodhd.com/api/eod/ABC.US');
        expect(Object.fromEntries(u.searchParams)).toEqual({
            fmt: 'json', period: 'd', from: '2026-01-01', to: '2026-01-31', api_token: 'cle+secrete',
        });
        expect(() => urlCloturesEodhd('ABC/../x', '2026-01-01', '2026-01-31', 'k')).toThrow();
        expect(() => urlCloturesEodhd('ABC.US', '2026-02-01', '2026-01-31', 'k')).toThrow();
        expect(() => urlCloturesEodhd('ABC.US', '2026-01-01', '2026-01-31', ' ')).toThrow();
    });

    it('le message d’une URL refusée ne contient pas la clé', () => {
        try {
            urlCloturesEodhd('ABC.US', 'hier', '2026-01-31', 'CLE-TRES-SECRETE');
            throw new Error('attendu : levée');
        } catch (e) {
            expect(String(e)).not.toContain('CLE-TRES-SECRETE');
        }
    });
});

describe('[PTF-L1C1] Banque du Canada (série datée)', () => {
    it('sur la réponse RÉELLE d’un groupe, ne lit que la série demandée — jamais la cohorte morte', () => {
        // observations[0] y est { d: 2019-12-31, FXVNDCAD } : une série arrêtée, sans USD ni EUR.
        expect(Object.keys(reponseBdcReelle.observations[0])).not.toContain('FXUSDCAD');
        const usd = lireSerieDateeBdc(reponseBdcReelle, 'USD');
        const eur = lireSerieDateeBdc(reponseBdcReelle, 'EUR');
        if (usd.statut !== 'ok' || eur.statut !== 'ok') throw new Error('attendu : lecture ok');
        expect(usd.points.map((p) => p[0])).toEqual(['2026-09-16']);
        expect(eur.points.map((p) => p[0])).toEqual(['2026-09-16']);
        expect(usd.points[0][1]).toBeGreaterThan(1);
        expect(usd.ecartes + eur.ecartes).toBe(0);
    });

    it('série datée : triée, jour non publié ignoré sans être compté, valeur illisible comptée', () => {
        const r = lireSerieDateeBdc({
            observations: [
                { d: '2026-01-06', FXUSDCAD: { v: '1.3600' } },
                { d: '2026-01-05', FXUSDCAD: { v: '1.3500' } },
                { d: '2026-01-07', FXEURCAD: { v: '1.5' } },
                { d: '2026-01-08', FXUSDCAD: { v: 'n/a' } },
                { d: '2026-01-09', FXUSDCAD: { v: '-1' } },
                { d: 'demain', FXUSDCAD: { v: '1.37' } },
                { d: '2026-01-12', FXUSDCAD: { v: '' } },
            ],
        }, 'USD');
        expect(r).toEqual({ statut: 'ok', points: [['2026-01-05', 1.35], ['2026-01-06', 1.36]], ecartes: 3 });
    });

    it('réponse sans observations → erreur ; URL de la SÉRIE, jamais du groupe', () => {
        expect(lireSerieDateeBdc({ message: 'Series not found' }, 'USD')).toEqual({ statut: 'erreur', forme: 'un objet à 1 clé(s)' });
        const u = urlSerieBdc('EUR', '2025-06-01', '2026-01-31');
        expect(u).toBe('https://www.bankofcanada.ca/valet/observations/FXEURCAD/json?start_date=2025-06-01&end_date=2026-01-31');
        expect(u).not.toContain('FX_RATES_DAILY');
        expect(() => urlSerieBdc('USD', '2026-02-01', '2026-01-31')).toThrow();
    });
});
