/**
 * [FUTUR-PANNEAU-FIXE] Quel jour le panneau montre — et surtout, ce qu'il montre AU REPOS.
 *
 * ⚠️ CE QUE CETTE FONCTION AJOUTE PAR RAPPORT À L'INFOBULLE. L'infobulle n'existait que pendant un
 * survol ou un gel : hors de ces deux états, il n'y avait rien à montrer, et c'était cohérent. Un
 * panneau FIXE est toujours là — il lui faut un TROISIÈME état, qui n'existait pas. Marc l'a
 * tranché en clic : AUJOURD'HUI.
 */
import { describe, it, expect } from 'vitest';
import { choisirJourAffiche, LIBELLE_ORIGINE } from '../../../components/future/jourAffiche';

const EPINGLE = { m: 'epinglé' };
const SURVOL = { m: 'survolé' };
const ANCRE = { m: 'aujourd’hui' };

describe('[FUTUR-PANNEAU-FIXE] choisirJourAffiche — priorité épingle > survol > ancre', () => {
    it('ÉPINGLÉ : le point épinglé gagne, et l’origine le dit', () => {
        expect(choisirJourAffiche('frozen', EPINGLE, ANCRE)).toEqual({ point: EPINGLE, origine: 'epingle' });
    });

    it('SURVOL : le point survolé gagne sur l’ancre', () => {
        expect(choisirJourAffiche('hovering', SURVOL, ANCRE)).toEqual({ point: SURVOL, origine: 'survol' });
    });

    it('AU REPOS : c’est l’ancre — aujourd’hui — et c’est l’état qui n’existait pas avant', () => {
        expect(choisirJourAffiche('idle', null, ANCRE)).toEqual({ point: ANCRE, origine: 'ancre' });
    });

    /**
     * ⚠️ Le cas qui compte vraiment. La machine d'état IGNORE déjà le survol en mode épinglé, mais
     * rien dans le TYPE ne l'impose : si un jour elle laissait passer un point survolé pendant une
     * épingle, le panneau changerait sous les doigts de Marc — exactement l'irritant n°1 que tout
     * ce lot existe pour supprimer. La priorité est donc affirmée ICI aussi, à un endroit qui ne
     * dépend d'aucun hook.
     */
    it('épinglé, un point qui arriverait par le survol ne peut PAS reprendre la main', () => {
        // Le mode fait foi : quel que soit le point transmis, « frozen » veut dire « épinglé ».
        expect(choisirJourAffiche('frozen', SURVOL, ANCRE)?.origine).toBe('epingle');
    });

    it('sans ancre ET sans interaction : null, jamais un repli inventé', () => {
        // ⚠️ `no-fake-data` : retomber sur un premier point afficherait les montants d'une date que
        // personne n'a demandée. Un chiffre juste au mauvais endroit reste un chiffre faux.
        expect(choisirJourAffiche('idle', null, null)).toBeNull();
    });

    it('survol annoncé mais point absent : on retombe sur l’ancre, pas sur rien', () => {
        expect(choisirJourAffiche('hovering', null, ANCRE)).toEqual({ point: ANCRE, origine: 'ancre' });
    });

    /**
     * ⚠️ Les trois libellés sont bornés à 45 caractères par `[FUTUR-INFOBULLE-EPUREE]` — la garde
     * du plafond de prose du panneau. Elle se mesure sur le RENDU, donc elle ne tire que si un test
     * monte le panneau dans l'origine fautive. Ce contrôle-ci est le filet : il porte sur la SOURCE
     * des trois phrases, donc il attrape la quatrième origine qu'un lot futur ajouterait.
     */
    it('les trois libellés d’origine tiennent sous le plafond de prose (45)', () => {
        for (const [origine, phrase] of Object.entries(LIBELLE_ORIGINE)) {
            expect(phrase.length, `« ${phrase} » (${origine}) dépasse le plafond`).toBeLessThanOrEqual(45);
            expect(phrase.trim().length, `libellé vide pour ${origine}`).toBeGreaterThan(0);
        }
        // Anti-vacuité : la boucle ci-dessus est vraie d'un objet VIDE.
        expect(Object.keys(LIBELLE_ORIGINE)).toEqual(['epingle', 'survol', 'ancre']);
    });
});
