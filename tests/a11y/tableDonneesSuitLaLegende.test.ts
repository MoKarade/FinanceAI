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
import { colonnesDeLaTable } from '../helpers/futureSource';
import { FUTURE_LEGEND_ITEMS } from '../../components/future/seriesConfig';

// ⚠️ [DETTE-LEVIER-EXPLICITE 2026-09-21] L'extracteur a déménagé vers `tests/helpers/futureSource.ts`
// (avec son décommentage, ses deux témoins et son anti-vacuité) : il existait en TROIS exemplaires
// et un quatrième allait naître — `UN-CONTROLE-DE-DUPLICATION-EST-UNE-GARDE-CONTRE-LA-DUPLICATION-
// DE-GARDES`. Ce qui reste ici est ce que le helper ne porte pas : les assertions de cette garde.

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
