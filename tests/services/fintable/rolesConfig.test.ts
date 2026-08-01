// tests/services/fintable/rolesConfig.test.ts
//
// [TEST-GAP-ROLESCONFIG] `parseRolesJson` route chaque compte Fintable vers son panier
// (cash / debt / investment+taxRegime / ignore) : une faute de parse silencieuse enverrait un
// solde RÉEL dans le mauvais panier fiscal (fausse l'impôt de toute la projection). Aucun test
// n'exerçait ce parseur partagé CLI + serveur.

import { describe, it, expect } from 'vitest';
import { parseRolesJson } from '../../../services/fintable/rolesConfig';
import { FINTABLE_TAX_REGIMES } from '../../../services/fintable/mapSnapshot';

describe('[TEST-GAP-ROLESCONFIG] parseRolesJson', () => {
    it('parse un objet de rôles valide (les 4 kinds, taxRegime optionnel)', () => {
        const roles = parseRolesJson(JSON.stringify({
            acc1: { kind: 'cash' },
            acc2: { kind: 'debt', debtName: 'Visa' },
            acc3: { kind: 'investment' },
            acc4: { kind: 'investment', taxRegime: 'CELI' },
            acc5: { kind: 'ignore' },
        }));
        expect(roles).toEqual({
            acc1: { kind: 'cash' },
            acc2: { kind: 'debt', debtName: 'Visa' },
            acc3: { kind: 'investment' },
            acc4: { kind: 'investment', taxRegime: 'CELI' },
            acc5: { kind: 'ignore' },
        });
    });

    it('chaque régime fiscal CANONIQUE passe (liste importée, pas re-codée)', () => {
        for (const regime of FINTABLE_TAX_REGIMES) {
            const roles = parseRolesJson(JSON.stringify({ a: { kind: 'investment', taxRegime: regime } }));
            expect(roles.a).toEqual({ kind: 'investment', taxRegime: regime });
        }
        expect(FINTABLE_TAX_REGIMES.length).toBeGreaterThan(2); // non-vacuité de la boucle
    });

    it('taxRegime en MAUVAISE graphie (« celi », « non-enregistre ») ⇒ throw qui nomme les valides', () => {
        // Le piège exact documenté dans le module : une faute de frappe routerait l'écart dans le
        // mauvais panier fiscal EN SILENCE si le parseur laissait passer.
        for (const bad of ['celi', 'non-enregistre', 'NON_ENREG', 'REEE ']) {
            expect(() => parseRolesJson(JSON.stringify({ a: { kind: 'investment', taxRegime: bad } })))
                .toThrowError(/taxRegime.*invalide.*CELI/s);
        }
    });

    it('taxRegime null/absent = OK (solde affiché, écart non ventilé — signalé par le mapper)', () => {
        expect(parseRolesJson(JSON.stringify({ a: { kind: 'investment', taxRegime: null } })))
            .toEqual({ a: { kind: 'investment' } });
    });

    it('rôle « debt » sans debtName (absent, vide, espaces, non-string) ⇒ throw', () => {
        for (const bad of [{}, { debtName: '' }, { debtName: '   ' }, { debtName: 42 }]) {
            expect(() => parseRolesJson(JSON.stringify({ a: { kind: 'debt', ...bad } })))
                .toThrowError(/debtName/);
        }
    });

    it('kind inconnu ou manquant ⇒ throw qui nomme le compte ET les kinds attendus', () => {
        expect(() => parseRolesJson(JSON.stringify({ compteX: { kind: 'checking' } })))
            .toThrowError(/compteX.*cash \| debt \| investment \| ignore/);
        expect(() => parseRolesJson(JSON.stringify({ compteY: {} })))
            .toThrowError(/compteY/);
    });

    it('racine non-objet (tableau, nombre, null) ⇒ throw explicite', () => {
        for (const bad of ['[]', '42', 'null', '"cash"']) {
            expect(() => parseRolesJson(bad)).toThrowError(/objet/);
        }
    });

    it('JSON invalide ⇒ throw (SyntaxError de JSON.parse, pas un silence)', () => {
        expect(() => parseRolesJson('{pas du json')).toThrowError();
    });

    it('objet vide ⇒ zéro rôle (cas légitime : aucun compte configuré)', () => {
        expect(parseRolesJson('{}')).toEqual({});
    });
});
