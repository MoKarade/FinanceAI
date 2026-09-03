/**
 * [RQAP-INDEX-SOURCE] Une affirmation JURIDIQUE non citée ne doit pas circuler sans sa marque.
 *
 * ⚠️ LE DÉFAUT, ET POURQUOI IL COMPTE. La phrase « le plafond RQAP est indexé sur la rémunération
 * hebdomadaire moyenne au Québec » décrit ce que fait la LOI. Elle vivait dans
 * `docs/FISCAL_REFERENCE.md` — le document que le dépôt déclare source de vérité fiscale — **sans
 * aucune citation** : ni article de la Loi sur l'assurance parentale, ni page de Revenu Québec. Or
 * dans ce fichier, une phrase non marquée hérite de l'autorité du document. C'est le même mécanisme
 * que `ECRIRE-UN-CHIFFRE-FISCAL-SANS-LE-MESURER-FABRIQUE-SA-SOURCE`, appliqué non à un chiffre mais
 * à une règle.
 *
 * ⚠️ POURQUOI REQUALIFIER PLUTÔT QUE CITER. Le ticket offrait les deux. Citer aurait été mieux — et
 * n'a pas pu être fait : la politique réseau de l'environnement bloque LégisQuébec
 * (`EGRESS_BLOCKED`) et `rqap.gouv.qc.ca` (délai dépassé), tenté le 2026-09-03. Écrire une
 * référence de mémoire aurait fabriqué exactement la source qu'on prétend citer.
 *
 * ⚠️ PÉRIMÈTRE RECENSÉ, PAS CITÉ. Le ticket annonçait deux sites (le code et §2). Il y en avait
 * TROIS : la note de §2 qui SIGNALAIT le problème l'affirmait elle-même au présent, sans marque —
 * un inventaire qui décrit un défaut finit par le porter (`ENTREE-D-INVENTAIRE-FANTOME`).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/** Le fragment stable de l'affirmation, sans la ponctuation qui varie d'un site à l'autre. */
const AFFIRMATION = /indexé sur la rémunération hebdomadaire moyenne/;
/** La marque qui dit « ceci est une hypothèse de ce dépôt, pas du droit cité ». */
const MARQUE = /RQAP-INDEX-SOURCE/;

const SITES = [
    'docs/FISCAL_REFERENCE.md',
    'services/projection/childrenReee.ts',
] as const;

/**
 * Les sites qui PORTENT effectivement l'affirmation aujourd'hui.
 * ⚠️ Dérivé, jamais figé : retirer la phrase d'UN seul fichier (parce qu'on l'a citée là, ou
 * qu'elle n'y sert plus) est légitime et ne doit pas faire rougir la garde. Mon 1ᵉʳ jet exigeait la
 * phrase dans CHAQUE fichier de la liste — perturbation mesurée, il rougissait sur un retrait
 * partiel parfaitement sain. C'est la disparition TOTALE qui doit tuer la garde, pas la première.
 */
const sitesAvecAffirmation = (): string[] =>
    SITES.filter((f) => AFFIRMATION.test(readFileSync(f, 'utf8')));

describe('[RQAP-INDEX-SOURCE] l\'hypothèse d\'indexation ne se lit plus comme du droit', () => {
    it('l\'affirmation existe bien : sinon cette garde n\'a plus d\'objet (anti-vacuité)', () => {
        // Si le jour vient où la phrase est CITÉE ou SUPPRIMÉE partout, ce test rougit et exige
        // qu'on retire la garde — un inventaire doit savoir mourir
        // (`UN-INVENTAIRE-DE-DETTE-DOIT-SAVOIR-MOURIR`).
        expect(sitesAvecAffirmation().length,
            'l\'affirmation a disparu de TOUS les sites : retire cette garde et le ticket')
            .toBeGreaterThan(0);
    });

    it('partout où elle apparaît, elle porte sa MARQUE de non-source', () => {
        for (const f of sitesAvecAffirmation()) {
            const src = readFileSync(f, 'utf8');
            // On lit la source BRUTE, commentaires COMPRIS : dans le code l'affirmation VIT dans un
            // commentaire, et c'est précisément lui qu'on veut voir marqué. Décommenter ici
            // rendrait la garde aveugle à son propre sujet — le choix du lecteur se fait par la
            // NATURE de l'assertion, jamais par habitude.
            src.split(/\n\s*\n/).forEach((bloc) => {
                if (!AFFIRMATION.test(bloc)) return;
                expect(MARQUE.test(bloc),
                    `${f} : l'affirmation sur l'indice du plafond RQAP apparaît sans la marque `
                    + '`[RQAP-INDEX-SOURCE]`. Cette phrase décrit ce que fait la LOI et n\'est PAS '
                    + 'citée : non marquée, elle hérite de l\'autorité du document. Cite la '
                    + 'disposition, ou garde la marque.').toBe(true);
            });
        }
    });

    it('aucun site ne PRÉTEND citer une disposition qui n\'est pas là', () => {
        // Le sens inverse : une fausse citation serait pire que l'absence de citation. Aucun des
        // deux sites ne doit nommer un article de loi tant que personne n'a pu le vérifier.
        for (const f of sitesAvecAffirmation()) {
            const src = readFileSync(f, 'utf8');
            const blocs = src.split(/\n\s*\n/).filter((b) => AFFIRMATION.test(b));
            expect(blocs.length, `${f} : bloc introuvable, la garde ne mesure rien`).toBeGreaterThan(0);
            for (const bloc of blocs) {
                expect(/\bart(?:icle)?\.?\s*\d+/i.test(bloc),
                    `${f} : un numéro d'article apparaît à côté d'une affirmation déclarée NON `
                    + 'sourcée. Si la citation a été établie, retire la marque et cette garde ; '
                    + 'sinon, retire le numéro.').toBe(false);
            }
        }
    });
});
