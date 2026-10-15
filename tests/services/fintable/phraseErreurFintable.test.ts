// [FINTABLE-ERREUR-SIMPLE] L'échec d'une passe Fintable est dit en mots simples ; le détail brut n'est pas perdu.
import { describe, expect, it } from 'vitest';
import { phraseErreurFintable } from '../../../services/fintable/phraseErreurFintable';

describe('phraseErreurFintable', () => {
    it('401 : jeton à renouveler', () => {
        expect(phraseErreurFintable('Appel Fintable /accounts : HTTP 401 (jeton absent, expiré ou révoqué)'))
            .toBe('Fintable refuse la connexion : renouvelle ton jeton');
    });

    it('403 : jeton à renouveler aussi', () => {
        expect(phraseErreurFintable('Appel Fintable /accounts : HTTP 403 (jeton valide mais action interdite)'))
            .toBe('Fintable refuse la connexion : renouvelle ton jeton');
    });

    it('429, 5xx, réseau : réessayer plus tard, sans jargon', () => {
        for (const brut of ['Appel Fintable /x : HTTP 429.', 'Appel Fintable /x : HTTP 503.', 'Failed to fetch']) {
            const p = phraseErreurFintable(brut);
            expect(p).toBe('Fintable ne répond pas, réessaie dans un instant');
            expect(p).not.toMatch(/HTTP|fetch|\/x/);
        }
    });

    it('un nombre à trois chiffres sans HTTP devant n\'est pas pris pour un code', () => {
        expect(phraseErreurFintable('compte 401234 introuvable')).toBe('Fintable ne répond pas, réessaie dans un instant');
    });
});
