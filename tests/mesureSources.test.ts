// tests/mesureSources.test.ts
//
// [PTF-L05B-MESURE-SOURCES] La mesure des sources tourne dans la CI, où rien ne la regarde s'exécuter :
// ses verdicts doivent être justes AVANT le premier lancement. Deux propriétés comptent autant que
// les calculs :
//   - rien de ce qui est imprimé ne contient un prix ou un symbole (journal PUBLIC) ;
//   - une ligne de Londres en pence ne passe jamais pour « conforme ».
// Tous les chiffres ci-dessous sont SYNTHÉTIQUES.
import { describe, it, expect } from 'vitest';
import {
    dateDePlace, serieYahoo, serieEodhd, ecartAuxAncres, natureAvantFractionnement, verdictDevise, formaterVerdict, lireAncres,
} from '../scripts/lib/mesureSources.mjs';

describe('[PTF-L05B-MESURE-SOURCES] logique pure de la mesure', () => {
    it('date de place : le décalage de la bourse déplace le jour, pas seulement l’heure', () => {
        // 2026-01-30 00:30 UTC = 2026-01-29 19:30 à New York (−5 h).
        const ts = Date.parse('2026-01-30T00:30:00Z') / 1000;
        expect(dateDePlace(ts, -5 * 3600)).toBe('2026-01-29');
        expect(dateDePlace(ts, 0)).toBe('2026-01-30');
    });

    it('série Yahoo : ignore les clôtures nulles, lit la devise et compte les événements', () => {
        const ts1 = Date.parse('2026-03-02T14:30:00Z') / 1000;
        const ts2 = Date.parse('2026-03-03T14:30:00Z') / 1000;
        const s = serieYahoo({ chart: { result: [{
            meta: { currency: 'USD', gmtoffset: -18000 },
            timestamp: [ts1, ts2],
            indicators: { quote: [{ close: [100, null] }] },
            events: { dividends: { a: {} }, splits: {} },
        }] } });
        expect(s).toEqual({ devise: 'USD', serie: { '2026-03-02': 100 }, dividendes: 1, fractionnements: 0 });
        expect(serieYahoo({ chart: { result: [] } })).toBeNull();
    });

    it('série EODHD : lit le champ `close` (brut), jamais `adjusted_close`', () => {
        expect(serieEodhd([{ date: '2026-03-02', close: 50, adjusted_close: 49 }]))
            .toEqual({ serie: { '2026-03-02': 50 } });
        expect(serieEodhd({ error: 'x' })).toBeNull();
    });

    it('écart aux ancres : maximum, dates couvertes, et exclusion des dates jugées à part', () => {
        const serie = { '2026-01-30': 101, '2026-03-31': 99.5 };
        const ancres = { '2026-01-30': 100, '2026-03-31': 100, '2026-06-30': 100 };
        const e = ecartAuxAncres(serie, ancres);
        expect(e.couvertes).toBe(2);
        expect(e.attendues).toBe(3);
        expect(e.max).toBeCloseTo(1, 6);
        const sansJanvier = ecartAuxAncres(serie, ancres, (d) => d < '2026-02-01');
        expect(sansJanvier.max).toBeCloseTo(0.5, 6);
        expect(sansJanvier.attendues).toBe(2);
    });

    it('fractionnement : distingue brut, ajusté, et « ni l’un ni l’autre »', () => {
        expect(natureAvantFractionnement(1000.5, 1000, 10)).toBe('brut');
        expect(natureAvantFractionnement(100.1, 1000, 10)).toBe('ajusté des fractionnements');
        expect(natureAvantFractionnement(500, 1000, 10)).toBe('ni brut ni ajusté');
        expect(natureAvantFractionnement(undefined, 1000, 10)).toBe('indéterminée');
    });

    it('devise : les pence ne sont JAMAIS « conformes », même pour une ligne attendue en GBP', () => {
        expect(verdictDevise('USD', 'USD')).toBe('conforme');
        expect(verdictDevise('GBp', 'USD')).toMatch(/PENCE/);
        expect(verdictDevise('GBX', 'GBP')).toMatch(/PENCE/);
        expect(verdictDevise('EUR', 'USD')).toMatch(/DIFFÉRENTE/);
        expect(verdictDevise(null, 'USD')).toBe('non renvoyée');
    });

    it('le verdict imprimé ne contient ni le symbole ni aucun prix de la série', () => {
        const ligne = formaterVerdict(3, 'Yahoo', {
            statut: 'ok',
            devise: 'conforme',
            ecart: { max: 0.05, couvertes: 3, attendues: 3 },
            fractionnement: 'ajusté des fractionnements',
            ancreNonIndependante: true,
        });
        expect(ligne).toBe(
            'L3 · Yahoo : disponible · devise conforme · écart max aux ancres 0,05 % (3/3 dates)'
            + ' · avant fractionnement : ajusté des fractionnements · ancre = prix du courtier (non indépendante)',
        );
        // Aucune suite de 3 chiffres ou plus : ni prix, ni année, ni quantité ne sortent par là.
        expect(ligne).not.toMatch(/\d{3,}/);
        expect(formaterVerdict(1, 'EODHD', { statut: 'refusée (HTTP 403)' })).toBe('L1 · EODHD : refusée (HTTP 403)');
    });

    it('secret mal formé : échec bruyant, et le message ne recopie jamais son contenu', () => {
        expect(() => lireAncres('pas du json SECRET-XYZ')).toThrow(/pas du JSON valide/);
        expect(() => lireAncres('pas du json SECRET-XYZ')).not.toThrow(/SECRET-XYZ/);
        expect(() => lireAncres('{"lignes":[]}')).toThrow(/vide/);
        expect(() => lireAncres('{"lignes":[{"yahoo":"X"}]}')).toThrow(/L1 incomplète/);
        expect(lireAncres('{"lignes":[{"yahoo":"X","devise":"USD","ancres":{}}]}').lignes).toHaveLength(1);
    });
});
