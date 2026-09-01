// tests/gateTestsHomonymes.test.ts
//
// [GATE-RELATED-RELIABILITY] Le filet du gate ciblé : un module stagé entraîne le test qui porte son nom.
//
// ⚠️ LE TICKET N'EST PAS REPRODUCTIBLE, et c'est écrit plutôt que tu. Il rapportait (PR #594, 2× dans
// la même PR) que `services/projection/monthlyEvents.ts` stagé ne faisait PAS sélectionner
// `tests/services/monthlyEvents.test.ts` par `vitest related`. Re-mesuré le 2026-08-24 sur Vitest
// 4.1.8, avec la forme EXACTE de la commande du hook : le test homonyme EST sélectionné (72 fichiers
// pour un module stagé, 87 pour deux). Le symptôme a disparu, sa cause reste inconnue.
//
// On ne clôt donc pas sur « ça marche maintenant » : on rend la classe IMPOSSIBLE là où elle est
// vérifiable — le test homonyme est ajouté EXPLICITEMENT à la commande, que le graphe d'imports
// l'ait retrouvé ou non. C'est le geste de `UN-FLAKE-NON-REPRODUIT-SE-SOLDE-EN-RENDANT-SA-PROCHAINE-
// OCCURRENCE-LISIBLE`, appliqué en amont : ici, la prochaine occurrence n'a plus d'effet.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { testsHomonymes } from '../scripts/hooks/lib/testsHomonymes.mjs';
import { stripComments } from '../utils/stripComments';

const RACINE = resolve(__dirname, '..');

describe('[GATE-RELATED-RELIABILITY] le test homonyme est retrouvé', () => {
    it('le cas EXACT de l’incident : monthlyEvents', () => {
        expect(testsHomonymes(['services/projection/monthlyEvents.ts'], resolve(RACINE, 'tests')))
            .toEqual([resolve(RACINE, 'tests/services/monthlyEvents.test.ts')]);
    });

    it('plusieurs modules stagés, plusieurs tests', () => {
        const r = testsHomonymes(
            ['services/projection/monthlyEvents.ts', 'services/projection/netWorth.ts'],
            resolve(RACINE, 'tests'),
        );
        expect(r).toHaveLength(2);
        expect(r.join(' ')).toMatch(/monthlyEvents\.test\.ts/);
        expect(r.join(' ')).toMatch(/netWorth\.test\.ts/);
    });

    it('un module SANS test homonyme ne fabrique rien (sens inverse)', () => {
        // Sans cette assertion, une implémentation qui renverrait TOUS les tests passerait les deux
        // cas ci-dessus — et ferait de la gate ciblée une suite complète déguisée.
        expect(testsHomonymes(['services/projection/zzzModuleInexistant.ts'], resolve(RACINE, 'tests')))
            .toEqual([]);
    });

    it('aucune entrée stagée → aucun test (le gate ne part pas en vrille sur un commit de doc)', () => {
        expect(testsHomonymes([], resolve(RACINE, 'tests'))).toEqual([]);
    });

    it('le hook UTILISE bien ce filet (le câblage, pas seulement la fonction)', () => {
        // Une fonction juste qu'on n'appelle pas ne protège de rien : c'est exactement ce que le
        // ticket décrivait côté `vitest related`.
        const src = stripComments(readFileSync(resolve(RACINE, 'scripts/hooks/commit-gate.mjs'), 'utf8'));
        expect(src).toMatch(/import \{ testsHomonymes \} from '\.\/lib\/testsHomonymes\.mjs'/);
        expect(src).toMatch(/testsHomonymes\(sourceFiles\)/);

        // ⚠️ Première version de cette assertion : `expect(src).toMatch(/TESTS_HOMONYMES/)`. Elle est
        // VACUEUSE contre le défaut visé — la perturbation « calculer la liste puis ne pas s'en
        // servir » (`void TESTS_HOMONYMES;`) la laissait VERTE. C'est
        // `SCAN-QUI-MATCHE-LA-DECLARATION-AU-LIEU-DE-L-USAGE`, re-commis ici. On ancre donc sur
        // l'USAGE : la liste doit apparaître DANS la construction de ce qui est lancé.
        // Borné au premier `;`, PAS à la fin de ligne : ma deuxième version l'était, et la même
        // perturbation restait verte parce que `void TESTS_HOMONYMES;` tient sur la même ligne.
        // Ce qu'on veut lire, c'est l'INITIALISEUR — ce qui compose réellement la liste.
        const decl = src.slice(src.indexOf('const TOUJOURS'));
        const construction = decl.slice(0, decl.indexOf(';'));
        expect(construction, 'TESTS_HOMONYMES calculé mais absent de la liste lancée').toMatch(/TESTS_HOMONYMES/);
        expect(src).toMatch(/vitest run \$\{TOUJOURS\.join\(' '\)\}/);
    });
});
