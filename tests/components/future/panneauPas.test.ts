/**
 * [FUTUR-PANNEAU-FIXE] Se déplacer d'un jour à l'autre — jour, mois, année.
 *
 * ⚠️ POURQUOI UN PAS RÉGLABLE. Sur PC on zoome à la molette avant de viser ; au doigt, non : à
 * l'horizon par défaut (40 ans) un mois vaut **≈ 0,7 px** (mesuré). Trois options ont été
 * proposées à Marc (tape + flèches, curseur sous le graphe, flèches seules) — il les a toutes
 * refusées et en a demandé d'autres. Sur les quatre suivantes, il a retenu les flèches à pas
 * réglable : ce qui rendait « flèches seules » pénible (remonter plusieurs mois) coûte trois tapes
 * au lieu de mille, et rien n'est à deviner.
 */
import { describe, it, expect } from 'vitest';
import { indexApresPas, indexAujourdhui, PAS_NAVIGATION, PAS_PAR_DEFAUT } from '../../../components/future/panneauPas';

/** Un an de jours, abscisse FRACTIONNAIRE : un jour de février vaut 1/28 de mois, un de mars 1/31. */
const serieJours = (moisDebut: number, nbMois: number, parMois = 30) => {
    const out: Array<{ monthIndex: number }> = [];
    for (let m = 0; m < nbMois; m++) {
        for (let j = 0; j < parMois; j++) out.push({ monthIndex: moisDebut + m + j / parMois });
    }
    return out;
};

describe('[FUTUR-PANNEAU-FIXE] indexAujourdhui — l’ancre du panneau', () => {
    it('rend le PREMIER point d’abscisse ≥ 0 (la frontière passé / futur du moteur)', () => {
        const serie = [{ monthIndex: -2 }, { monthIndex: -1 }, { monthIndex: 0 }, { monthIndex: 1 }];
        expect(indexAujourdhui(serie)).toBe(2);
    });

    it('fenêtre entièrement dans le PASSÉ : le dernier point, le plus proche d’aujourd’hui', () => {
        expect(indexAujourdhui([{ monthIndex: -5 }, { monthIndex: -4 }, { monthIndex: -3 }])).toBe(2);
    });

    it('fenêtre entièrement dans le FUTUR : le premier point', () => {
        expect(indexAujourdhui([{ monthIndex: 3 }, { monthIndex: 4 }])).toBe(0);
    });

    it('série vide : −1, jamais un index inventé', () => {
        expect(indexAujourdhui([])).toBe(-1);
    });

    it('[FUTUR-ANCRE-AUJOURDHUI] courbe au jour : l’ancre est le JOUR MÊME, pas le 1er du mois', () => {
        // Deux mois de jours à partir de l'abscisse 0 (le 1er du mois courant) ; aujourd'hui = 25e jour.
        const serie = serieJours(0, 2);
        const xAujourdhui = 24 / 30;
        const i = indexAujourdhui(serie, xAujourdhui);
        expect(i).toBe(24);
        // Anti-régression : l'ancienne règle (premier point ≥ 0) rendait le 1er du mois.
        expect(indexAujourdhui(serie)).toBe(0);
        expect(i).not.toBe(indexAujourdhui(serie));
    });

    it('[FUTUR-ANCRE-AUJOURDHUI] tolérance d’arrondi : un point à 1e-12 sous l’abscisse du jour reste le jour', () => {
        const serie = [{ monthIndex: 0.5 }, { monthIndex: 0.8 - 1e-12 }, { monthIndex: 0.84 }];
        expect(indexAujourdhui(serie, 0.8)).toBe(1);
    });
});

describe('[FUTUR-PANNEAU-FIXE] indexApresPas — un pas est un DÉPLACEMENT, jamais un no-op', () => {
    const serie = serieJours(-6, 24); // 24 mois de 30 jours autour d'aujourd'hui

    it('pas « jour » : exactement un POINT de la série, pas une fraction d’abscisse', () => {
        // ⚠️ La série EST la liste des jours : compter en abscisse y sauterait des points, puisqu'un
        // jour de février ne vaut pas un jour de mars.
        expect(indexApresPas(serie, 100, 1, 'jour')).toBe(101);
        expect(indexApresPas(serie, 100, -1, 'jour')).toBe(99);
    });

    it('pas « mois » : ≈ 30 points plus loin, dans la bonne direction', () => {
        expect(indexApresPas(serie, 100, 1, 'mois')).toBe(130);
        expect(indexApresPas(serie, 100, -1, 'mois')).toBe(70);
    });

    it('pas « année » : ≈ 12 mois plus loin', () => {
        // 12 mois × 30 jours = 360 points. Index 400 choisi pour qu'une année ENTIÈRE existe en
        // arrière : à 200, la cible tomberait AVANT le début de la série et la fonction
        // atterrirait au premier point — juste, mais ça ne mesurerait plus le pas.
        expect(indexApresPas(serie, 400, -1, 'annee')).toBe(40);
        expect(indexApresPas(serie, 40, 1, 'annee')).toBe(400);
    });

    it('cible HORS série : on va aussi loin que la série permet, jamais nulle part', () => {
        // ⚠️ Assumé, et c'est la date affichée dans le panneau qui dit la vérité. Geler les flèches
        // près des bords rendrait le pas « année » inutilisable sur presque toute la fenêtre.
        expect(indexApresPas(serie, 200, -1, 'annee')).toBe(0);
    });

    /**
     * ⚠️ LE CŒUR DE LA FONCTION. Chercher « le point d'abscisse la plus proche de la cible » peut
     * rendre `idx` LUI-MÊME quand la cible dépasse la fin de la série — une flèche qui ne fait rien
     * sans rien dire, indiscernable d'un clic manqué. Les candidats sont donc contraints au bon
     * côté : un déplacement possible est toujours VISIBLE.
     */
    it('près du bord, un pas d’un an avance quand même — jamais sur place', () => {
        const dernier = serie.length - 1;
        const cible = indexApresPas(serie, dernier - 3, 1, 'annee');
        expect(cible).toBeGreaterThan(dernier - 3);
        expect(cible).toBe(dernier); // aussi loin que la série va, et c'est la date affichée qui dit la vérité
    });

    it('sur le DERNIER point, « lendemain » rend −1 (le bouton se désactive)', () => {
        expect(indexApresPas(serie, serie.length - 1, 1, 'jour')).toBe(-1);
        expect(indexApresPas(serie, serie.length - 1, 1, 'annee')).toBe(-1);
    });

    it('sur le PREMIER point, « veille » rend −1', () => {
        expect(indexApresPas(serie, 0, -1, 'jour')).toBe(-1);
        expect(indexApresPas(serie, 0, -1, 'mois')).toBe(-1);
    });

    it('index hors bornes ou série vide : −1', () => {
        expect(indexApresPas(serie, -1, 1, 'jour')).toBe(-1);
        expect(indexApresPas(serie, serie.length, 1, 'jour')).toBe(-1);
        expect(indexApresPas([], 0, 1, 'jour')).toBe(-1);
    });

    /**
     * ⚠️ À écart ÉGAL, on garde le plus PETIT saut. La première version parcourait le tableau dans
     * son ordre naturel : pour un pas « veille » entre deux points à égale distance de la cible,
     * elle sautait au plus LOINTAIN des deux — le contraire de ce qu'une flèche promet. Deux points
     * encadrant exactement la cible suffisent à le mesurer.
     */
    it('à écart égal, le pas choisit le saut le plus COURT', () => {
        // Cible d'un pas « mois » depuis l'index 2 (abscisse 10) = 9 ; les index 0 (8,5) et 1 (9,5)
        // sont tous deux à 0,5 — le plus proche de `idx` est l'index 1.
        const paire = [{ monthIndex: 8.5 }, { monthIndex: 9.5 }, { monthIndex: 10 }];
        expect(indexApresPas(paire, 2, -1, 'mois')).toBe(1);
    });
});

describe('[FUTUR-PANNEAU-FIXE] la table des pas', () => {
    it('trois pas, et le défaut est le JOUR', () => {
        expect(PAS_NAVIGATION.map((p) => p.id)).toEqual(['jour', 'mois', 'annee']);
        expect(PAS_PAR_DEFAUT).toBe('jour');
    });

    it('chaque pas dit en toutes lettres ce que les flèches font', () => {
        // ⚠️ Cette phrase part dans l'`aria-label` des flèches : sans elle, un lecteur d'écran
        // entend « Veille » sans savoir de combien on recule.
        for (const p of PAS_NAVIGATION) {
            expect(p.aide.trim().length, `aide vide pour ${p.id}`).toBeGreaterThan(0);
            expect(p.label.trim().length, `label vide pour ${p.id}`).toBeGreaterThan(0);
        }
    });
});
