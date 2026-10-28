// tests/services/taxDecemberLimitesConsignees.test.ts
//
// [TAXDEC-BANDE-ACTIVE-BASE-BRUTE] + [TAXDEC-SPLIT-EGAL-VS-PERUSER] — deux approximations ASSUMÉES
// des bandes incrémentales de décembre, consignées en §4 de `FISCAL_REFERENCE.md`.
//
// ⚠️ POURQUOI UNE GARDE SUR DE LA DOCUMENTATION. Les deux écarts étaient déjà CHIFFRÉS dans la §4
// (« 69 à 1 130 $ », « −345,72 $ ») — mais leur MÉCANISME n'était nommé nulle part. Un écart chiffré
// sans cause invite le lecteur suivant à le « corriger » : or l'alignement naïf de l'un déplacerait
// l'écart au lieu de le fermer, et re-baserait les goldens. Ce que cette garde protège n'est donc
// pas un nombre, c'est la RAISON — la seule chose qui empêche une correction à l'aveugle.
//
// ⚠️ Elle ne fige PAS les bornes mesurées. Une borne dépend d'hypothèses (ici : le plafond de
// cotisation retenu) et se re-mesure ; l'ancrer au dollar ferait de ce test une bombe au premier
// changement d'indexation. La garde vérifie que la CAUSE et ses hypothèses sont écrites, et que la
// section n'a pas été vidée.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DOC = readFileSync(resolve(__dirname, '../../docs/FISCAL_REFERENCE.md'), 'utf8');
const TITRE = 'Les deux écarts résiduels';

/** La section, bornée à la PROCHAINE section de même niveau ou plus haut — jamais un offset
 *  arbitraire, qui laisserait un voisin satisfaire la garde (`GARDE-BORNEE-PAR-CLASSE-NEGATIVE`). */
const section = (): string => {
    const i = DOC.indexOf(TITRE);
    expect(i, `section « ${TITRE} » absente de FISCAL_REFERENCE.md`).toBeGreaterThan(-1);
    const suivante = DOC.indexOf('\n---', i + 1);
    return DOC.slice(i, suivante > i ? suivante : undefined);
};

describe('[TAXDEC-BANDE-ACTIVE-BASE-BRUTE][TAXDEC-SPLIT-EGAL-VS-PERUSER] les deux limites sont consignées AVEC leur cause', () => {
    it('la section existe et n’est pas vide (anti-vacuité : une section vide passerait tout le reste)', () => {
        expect(section().length).toBeGreaterThan(1200);
    });

    it('branche ACTIVE : la CAUSE est nommée — base brute contre base nette des déductions', () => {
        const s = section();
        // Le mécanisme, pas seulement le symptôme : c'est ce qui manquait à la doc d'avant.
        expect(s).toMatch(/BRUT/);
        expect(s).toMatch(/NET des déductions|net des déductions/i);
        expect(s).toMatch(/REER/);
        expect(s).toMatch(/CELIAPP|FHSA/);
    });

    it('branche ACTIVE : la borne est donnée AVEC son hypothèse de cotisation', () => {
        const s = section();
        // Une borne sans son hypothèse est fausse : celle-ci vaut pour la cotisation de l'ANNÉE,
        // et monte si l'utilisateur rattrape des droits accumulés. Les deux cas doivent figurer.
        expect(s).toMatch(/18 %/);                       // plafond annuel de droits REER
        expect(s).toMatch(/rattrapage/i);                // le cas qui dépasse cette borne
        expect(s).toMatch(/MESURÉ/);                     // la borne est mesurée, pas estimée
    });

    it('couple inégal : la cause ET l’interdiction de corriger à l’aveugle sont écrites', () => {
        const s = section();
        expect(s).toMatch(/parts égales|parts ÉGALES/);   // la bande divise par N
        expect(s).toMatch(/individuel/);                  // le crédit s'érode par personne
        expect(s).toMatch(/aveugle/);                     // l'interdiction explicite
        expect(s).toMatch(/goldens/);                     // et sa conséquence concrète
        // Le signe dépend du profil : sans ça, un lecteur croirait à un biais orienté et
        // « corrigerait » dans une direction arbitraire.
        expect(s).toMatch(/signe dépend du profil|sur-impose autant/);
    });

    it('les deux limites renvoient à leur ticket (traçabilité vers le backlog)', () => {
        const s = section();
        expect(s).toContain('TAXDEC-BANDE-ACTIVE-BASE-BRUTE');
        expect(s).toContain('TAXDEC-SPLIT-EGAL-VS-PERUSER');
    });
});
