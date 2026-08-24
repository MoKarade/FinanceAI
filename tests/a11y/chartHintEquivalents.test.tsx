// tests/a11y/chartHintEquivalents.test.tsx
//
// [A11Y-CHART-HINT-HIDDEN] Un `aria-hidden` se juge par ce qui EXISTE À CÔTÉ, pas au motif.
//
// ⚠️ LE TICKET SE TROMPAIT DE DÉFAUT. Il annonçait « du contenu instructionnel entièrement soustrait
// aux lecteurs d'écran » pour la phrase d'aide du graphe Futur. Vérifié : cette phrase est un
// DOUBLON — le conteneur du graphe porte déjà un `aria-label` qui énonce les mêmes gestes. La
// masquer est correct ; l'exposer ferait annoncer deux fois la même chose.
//
// Le vrai défaut était dans le CONTENU de cet `aria-label` : il n'énonçait que des gestes de
// POINTEUR (clic, molette, glisser) — inutilisables par qui ne pointe pas — et ne nommait JAMAIS
// l'alternative textuelle qui existe pourtant juste après la courbe (table de données sr-only +
// liste des jalons). On annonçait donc à l'utilisateur clavier ce qu'il ne peut pas faire, et on lui
// taisait ce qu'il peut faire.
//
// ⚠️ La garde vise les DEUX faits, parce que l'un sans l'autre se dégrade : que le libellé renvoie à
// l'alternative, ET que cette alternative existe vraiment. Un renvoi vers une table absente serait
// exactement le même mensonge, dans l'autre sens.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lire = (p: string): string => readFileSync(resolve(__dirname, '../..', p), 'utf8');
const sansCommentaires = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('[A11Y-CHART-HINT-HIDDEN] le graphe Futur annonce ce qui est ATTEIGNABLE', () => {
    const src = sansCommentaires(lire('components/FutureProjection.tsx'));

    it('le libellé du graphe renvoie à l’alternative textuelle', () => {
        const m = src.match(/aria-label="Courbe de vie[^"]*"/);
        expect(m, 'le libellé du graphe a disparu ou changé de forme').not.toBeNull();
        const libelle = m![0];
        expect(libelle, 'aucun renvoi vers le tableau').toMatch(/tableau/i);
        expect(libelle, 'aucun renvoi vers les jalons').toMatch(/jalons/i);
        // Les gestes de pointeur restent annoncés — ils sont vrais pour qui pointe — mais ÉTIQUETÉS
        // comme tels, au lieu d'être présentés comme le seul mode d'emploi.
        expect(libelle).toMatch(/À la souris/);
    });

    it('l’alternative annoncée EXISTE vraiment (sinon le renvoi est un mensonge de plus)', () => {
        expect(src).toMatch(/<ChartDataTable/);
        expect(src).toMatch(/className="sr-only"/);
    });

    it('la phrase d’aide VISUELLE reste masquée — c’est un doublon, pas un oubli', () => {
        // Anti-régression dans l'autre sens : « corriger » en retirant l'aria-hidden ferait annoncer
        // les gestes deux fois. Ce test fige la décision, avec sa raison écrite juste au-dessus.
        const brut = lire('components/FutureProjection.tsx');
        const i = brut.indexOf('survol = jour · clic = fige le jour');
        expect(i, 'la phrase d’aide a disparu').toBeGreaterThan(-1);
        expect(brut.slice(Math.max(0, i - 400), i)).toMatch(/aria-hidden="true"/);
    });
});

describe('[A11Y-CHART-HINT-HIDDEN] la bifurcation « ou importer » est annoncée', () => {
    const brut = lire('components/setup/PageSetupGate.tsx');
    const src = sansCommentaires(brut);

    it('le libellé n’est plus masqué, mais les filets décoratifs le restent', () => {
        const i = src.indexOf('ou importer');
        expect(i).toBeGreaterThan(-1);
        // Le conteneur du libellé : plus d'`aria-hidden` sur la BALISE elle-même. On borne au
        // premier `>` — sinon le slice avale le filet décoratif qui suit, qui lui EST masqué à bon
        // droit, et la garde se déclarerait rouge sur le correctif (`GARDE-BORNEE-PAR-CLASSE-NEGATIVE`).
        const ouvrante = src.slice(src.lastIndexOf('<div', i));
        const balise = ouvrante.slice(0, ouvrante.indexOf('>') + 1);
        expect(balise, 'le libellé est de nouveau masqué').not.toMatch(/aria-hidden/);
        // …mais les deux filets, eux, n'ont rien à annoncer.
        expect(src.slice(i - 200, i + 200).match(/h-px flex-1 bg-white\/10" aria-hidden="true"/g) ?? [])
            .toHaveLength(2);
    });

    it('le bloc d’import porte un nom accessible', () => {
        expect(src).toMatch(/role="group" aria-label="Ou importer"/);
    });

    it('le compteur « N/N prêts » reste masqué — un vrai progressbar le porte déjà', () => {
        // Le troisième site du même motif, VÉRIFIÉ CONFORME. Sans cette garde, un prochain passage
        // « corrigerait » un masquage légitime et ferait annoncer le compte deux fois.
        expect(src).toMatch(/role="progressbar"/);
        expect(src).toMatch(/aria-valuenow=\{done\}/);
        const i = src.indexOf('{done}/{total} prêt');
        expect(i).toBeGreaterThan(-1);
        expect(src.slice(Math.max(0, i - 200), i)).toMatch(/aria-hidden="true"/);
    });
});
