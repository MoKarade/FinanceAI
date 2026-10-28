/**
 * [FUTUR-PANNEAU-FIXE] L'infobulle FLOTTANTE ne revient pas, et le panneau est bien branché.
 *
 * ⚠️ POURQUOI UNE GARDE, ET PAS SEULEMENT UN COMMENTAIRE. Ce que Marc a demandé n'est pas « une
 * infobulle mieux placée » : c'est qu'elle cesse de suivre le curseur. L'irritant qu'il a coché —
 * « elle disparaît / bouge quand je veux la lire » — est STRUCTUREL à un objet flottant, donc un
 * lot futur qui en re-poserait une « juste pour le survol » re-créerait exactement le défaut, et
 * aucun test de contenu ne le verrait : les deux surfaces afficheraient les mêmes chiffres.
 *
 * ⚠️ La garde tient les DEUX moitiés ensemble, et c'est leur tension qui fait la valeur : rien ne
 * flotte (absences) ET le panneau est rendu (présence). Chacune seule est satisfaite par le mauvais
 * moyen — un fichier vide passerait la première, un écran qui rend les deux passerait la seconde.
 */
import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { readCodeOnly } from '../../helpers/source';

// ⚠️ Source DÉCOMMENTÉE : ce fichier-là parle en prose de l'infobulle qu'il a retirée, et ce
// fichier-ci aussi. Sur la source brute, la garde s'accuserait elle-même
// (`SCAN-QUI-MATCHE-LA-PROSE`, et l'apostrophe française n'arrange rien —
// `UNE-APOSTROPHE-FRANCAISE-EST-UN-DELIMITEUR-DE-CHAINE`).
// SEUIL re-mesuré pour CE fichier : 0,455 de code (mesuré le 2026-09-18), d'où 0,35 — le seuil
// canonique `> 0.5` est celui d'un scan de DÉPÔT, pas d'un fichier à moitié commenté par
// conception (`UN-SEUIL-D-ANTI-VACUITE-APPARTIENT-A-LA-PORTEE-QU-IL-MESURE`).
const SOURCE = readCodeOnly(
    resolve(__dirname, '../../../components/FutureProjection.tsx'),
    'RENDER_MAX_POINTS',
    0.35,
);

describe('[FUTUR-PANNEAU-FIXE] plus rien ne flotte au-dessus du graphe Futur', () => {
    it('aucun portail : le détail du jour vit dans le flux du document', () => {
        expect(SOURCE).not.toContain('createPortal');
    });

    it('aucun positionnement fixe piloté par le curseur', () => {
        // Les trois marqueurs de l'ancienne mécanique : le style impératif, la machine de
        // positionnement, et le mode « bottom sheet » qui n'existait que pour la rattraper.
        expect(SOURCE).not.toMatch(/position:\s*'fixed'/);
        expect(SOURCE).not.toContain('useChartTooltipPosition');
        expect(SOURCE).not.toContain('tooltipIsSheet');
    });

    it('le panneau fixe est bien rendu par cet écran', () => {
        // ⚠️ La moitié de PRÉSENCE. Sans elle, les absences ci-dessus seraient toutes vraies d'un
        // écran qui aurait perdu le détail du jour ENTIÈREMENT — une régression bien pire que
        // celle qu'on interdit.
        expect(SOURCE).toContain('<PanneauJour');
        expect(SOURCE).toContain('choisirJourAffiche');
    });

    it('la sélection passe par la machine d’état partagée, pas par une copie locale', () => {
        expect(SOURCE).toContain('useSelectionJour');
        // Le survol et la sortie de zone alimentent bien la machine — sinon le panneau ne
        // montrerait jamais autre chose qu'aujourd'hui.
        expect(SOURCE).toContain('selection.onHoverPoint');
        expect(SOURCE).toContain('selection.onChartLeave');
    });

    // ⚠️ ANTI-VACUITÉ du décommentage lui-même : quatre des assertions ci-dessus sont des
    // ABSENCES, donc vraies d'un fichier vide, mal résolu ou décommenté à tort. Le témoin POSITIF
    // prouve qu'on lit du vrai code ; le témoin NÉGATIF, qu'on a bien retiré les commentaires —
    // cette phrase-ci n'existe QUE dans la prose du fichier scanné.
    it('le scan lit bien du code décommenté', () => {
        expect(SOURCE).toContain('ResponsiveContainer');
        expect(SOURCE).not.toContain('bottom sheet');
    });
});
