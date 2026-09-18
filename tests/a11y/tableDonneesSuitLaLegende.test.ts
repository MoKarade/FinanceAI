/**
 * [FUTUR-COURBE-DETTE 2026-09-18] La table de données (alternative texte au graphe) suit la LÉGENDE.
 *
 * ⚠️ POURQUOI CETTE GARDE EXISTE — finding du panel, vérifié avant d'être écrit.
 * L'`aria-label` du conteneur du graphe promet en toutes lettres « les mêmes données sont lisibles
 * sous la courbe, sous forme de tableau ». Ce lot a ajouté une SÉRIE au graphe (la dette) sans
 * ajouter sa COLONNE : un utilisateur de lecteur d'écran qui suit ce renvoi obtenait donc une table
 * où la valeur nette ne se RECOMPOSE PAS par somme des comptes — le défaut même que
 * `UNE-REPARTITION-QUI-NE-LISTE-QUE-LES-TERMES-POSITIFS-NE-RECOMPOSE-PAS-SON-TOTAL` venait de
 * corriger dans l'infobulle, laissé intact dans son alternative texte.
 *
 * ⚠️ La liste attendue est DÉRIVÉE de `FUTURE_LEGEND_ITEMS`, jamais recopiée : une garde qui
 * recopierait `dataColumns` serait CIRCULAIRE — elle ne pourrait pas voir un oubli.
 * ⚠️ Et le scan lit la source **DÉCOMMENTÉE** (`SCAN-QUI-MATCHE-LA-PROSE` ; l'apostrophe française
 * est le même caractère qu'un délimiteur de chaîne, et ce bloc est très commenté).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripCommentsJsx, partDeCodeRestante } from '../../utils/stripComments';
import { FUTURE_LEGEND_ITEMS } from '../../components/future/seriesConfig';

const SOURCE = join(__dirname, '../../components/FutureProjection.tsx');

/** Les `key` du tableau rendu par le `useMemo<ChartDataColumn[]>`, lues dans la source décommentée. */
function colonnesDeLaTable(): string[] {
    const brut = readFileSync(SOURCE, 'utf-8');
    const src = stripCommentsJsx(brut);
    // Anti-vacuité du décommentage. Seuil MESURÉ le 2026-09-18 sur ce fichier : 0,455 de code
    // (il est plus qu'à moitié commentaire par conception) — le 0,5 d'un scan de DÉPÔT le
    // déclarerait VIDE (`UN-SEUIL-D-ANTI-VACUITE-APPARTIENT-A-LA-PORTEE-QU-IL-MESURE`).
    expect(partDeCodeRestante(brut, src)).toBeGreaterThan(0.35);
    // Anti-vacuité sans seuil : un jeton de vrai code survit, un jeton de PROSE disparaît.
    expect(src).toContain('RENDER_MAX_POINTS');
    expect(src).not.toContain('alternative texte à la courbe');

    const bloc = src.match(/useMemo<ChartDataColumn\[\]>\(\(\) => \{([\s\S]*?)\n {4}\}, \[/);
    if (!bloc) throw new Error('bloc `dataColumns` introuvable dans FutureProjection.tsx');
    return [...bloc[1].matchAll(/\{\s*key:\s*'([^']+)'/g)].map((m) => m[1]);
}

describe('[FUTUR-COURBE-DETTE] la table de données ne diverge pas du graphe', () => {
    it('chaque série MONÉTAIRE de la légende a sa colonne', () => {
        const colonnes = colonnesDeLaTable();
        // Anti-vacuité de l'EXTRACTEUR : s'il ne matchait plus (renommage, reformatage), la liste
        // serait vide et tout ce qui suit deviendrait trivialement satisfait par l'absence.
        expect(colonnes.length).toBeGreaterThan(5);
        expect(colonnes).toContain('dateLabel');

        // Ce que la table DOIT porter, dérivé de la légende : les aires (les paniers d'argent
        // empilés, dette comprise) plus la valeur nette. Les séries non monétaires de la légende
        // (Monte Carlo, événements, objectif FIRE, repère « Aujourd'hui ») n'ont rien à tabuler ;
        // l'impôt latent et le paiement d'impôts ne sont pas des postes du bilan.
        const attendues = FUTURE_LEGEND_ITEMS.filter((i) => i.shape === 'area').map((i) => i.key);
        expect(attendues.length).toBeGreaterThan(5); // la légende elle-même n'est pas vide
        for (const k of attendues) {
            expect(colonnes, `${k} est une aire du graphe mais n'a AUCUNE colonne dans la table sr-only`).toContain(k);
        }
        expect(colonnes).toContain('NetWorth');
    });

    it('la DETTE y est nommément — sur le code d\'avant, elle n\'y était pas', () => {
        expect(colonnesDeLaTable()).toContain('DettesNonImmo');
    });
});
