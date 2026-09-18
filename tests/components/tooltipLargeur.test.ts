/**
 * [FUTUR-PANNEAU-FIXE] INVERSION de `[FUTUR-INFOBULLE-EPUREE] largeur`.
 *
 * ⚠️ CE QUE CE FICHIER GARDAIT, ET POURQUOI IL NE PEUT PLUS LE GARDER. La largeur de l'infobulle
 * flottante était écrite DEUX FOIS — une classe Tailwind (`w-80`, ce qui est peint) et
 * `TOOLTIP_WIDTH` (ce qui bornait sa position au bord de l'écran) — sans que rien au runtime ne
 * les confronte. Une divergence était SILENCIEUSE : l'app compilait, les tests passaient, et
 * l'infobulle débordait du bord droit sur les seuls écrans assez étroits pour que la borne serve.
 *
 * L'infobulle flottante n'existe plus (2026-09-18) : son contenu est rendu par le PANNEAU FIXE
 * sous le graphe, qui vit dans le FLUX du document. Il n'a donc ni largeur fixe, ni position à
 * calculer, ni bord d'écran à éviter — la duplication qu'on surveillait a disparu avec son objet.
 *
 * ⚠️ POURQUOI CE FICHIER SURVIT AU LIEU D'ÊTRE SUPPRIMÉ. Ce qui meurt est l'INVENTAIRE (« ces deux
 * écritures sont-elles d'accord ? ») ; ce qui reste est la RÈGLE (« ne pas reposer une largeur de
 * chrome en dur »). Supprimé, ce fichier laisserait croire que l'exigence n'a jamais existé, et le
 * prochain lot qui voudra « fixer » la largeur du panneau la re-poserait sans savoir ce qu'elle a
 * coûté (`UN-INVENTAIRE-QUI-ATTEINT-ZERO-S-INVERSE-EN-REGLE`).
 */
import { describe, it, expect } from 'vitest';
import { readCodeOnly } from '../helpers/source';
import { resolve } from 'node:path';

// ⚠️ Source DÉCOMMENTÉE : ce fichier-ci et le panneau parlent tous les deux de `w-80` et de
// `max-h` en prose — un scan sur la source brute s'accuserait lui-même
// (`UNE-GARDE-ECRITE-A-COTE-DE-SON-SUJET-LIT-SON-PROPRE-COMMENTAIRE`).
// Le SEUIL d'anti-vacuité voyage avec l'appelant : 0,35 mesuré sur ce fichier, contre 0,2 par
// défaut — il est majoritairement du commentaire par conception.
const SOURCE_PANNEAU = readCodeOnly(
    resolve(__dirname, '../../components/projection/PanneauJour.tsx'),
    'PANNEAU_SECTIONS',
    0.35,
);

describe('[FUTUR-PANNEAU-FIXE] le panneau n’a plus de largeur de chrome en dur', () => {
    it('sa racine ne fixe ni largeur, ni hauteur maximale, ni défilement interne', () => {
        // Le conteneur racine porte `data-panneau-jour` — ancré sur ce marqueur STABLE plutôt que
        // sur une liste de classes, qui changerait à chaque retouche de style.
        const racine = SOURCE_PANNEAU.match(/data-panneau-jour=""[\s\S]{0,400}?className=\{?"([^"]+)"/);
        expect(racine, 'racine du panneau introuvable — le marqueur a changé ?').not.toBeNull();
        const classes = racine![1];
        expect(classes).not.toMatch(/\bw-\d/);
        expect(classes).not.toMatch(/\bmax-h-/);
        expect(classes).not.toMatch(/overflow-y-auto/);
    });

    it('aucune position FIXE ni portail : le panneau est dans le flux du document', () => {
        expect(SOURCE_PANNEAU).not.toContain('createPortal');
        expect(SOURCE_PANNEAU).not.toMatch(/position:\s*'fixed'/);
    });

    // ⚠️ ANTI-VACUITÉ, et elle n'est pas décorative : les trois assertions ci-dessus sont des
    // ABSENCES, donc toutes vraies d'un fichier vide, renommé ou décommenté à tort. Ce témoin
    // exige que le scan lise bien le panneau et pas du blanc.
    it('le scan lit bien le panneau (témoin de code réel)', () => {
        expect(SOURCE_PANNEAU).toContain('data-panneau-jour');
        expect(SOURCE_PANNEAU).toContain('PANNEAU_SECTIONS');
        // Témoin NÉGATIF : un jeton qui n'existe QUE dans la prose de ce fichier-ci doit être absent
        // du code lu — sinon le décommentage n'a pas eu lieu et les absences ci-dessus ne valent rien.
        expect(SOURCE_PANNEAU).not.toContain('INVERSION de');
    });
});
