/**
 * [FUTUR-PANNEAU-FIXE] Les quatre sections du panneau : leur ORDRE, et le fait qu'il n'y en ait
 * qu'UNE liste pour les deux rendus.
 *
 * ⚠️ POURQUOI CETTE GARDE EXISTE. Le panneau se rend de deux façons — colonnes sur PC, onglets sur
 * téléphone. C'est exactement la forme du défaut qui a coûté deux findings ÉLEVÉS la veille sur ce
 * même écran : un lot ajoute quelque chose dans UNE des représentations du graphe et pas dans
 * l'autre, et le manque est SILENCIEUX
 * (`UN-LOT-QUI-AJOUTE-UNE-SERIE-DOIT-L-AJOUTER-PARTOUT-OU-LE-GRAPHE-EST-REPRESENTE`). Ici
 * l'utilisateur de téléphone verrait un autre ordre, voire une section de moins, sans que rien ne
 * rougisse.
 *
 * ⚠️ L'ORDRE EST UNE DÉCISION DE MARC (question posée en clic le 2026-09-18, option « Net → flux →
 * comptes → mouvements » : du plus AGRÉGÉ au plus DÉTAILLÉ). Ce n'est pas une préférence
 * d'implémentation — le réordonner sans le lui redemander, c'est défaire une réponse. La garde
 * l'épingle pour que ce soit un geste DÉLIBÉRÉ, jamais un effet de bord.
 */
import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { readCodeOnly } from '../../helpers/source';
import { PANNEAU_SECTIONS, PANNEAU_SECTION_IDS } from '../../../components/future/panneauSections';

// ⚠️ Source DÉCOMMENTÉE : le panneau explique en prose ce que cette garde cherche dans son code —
// un scan sur la source brute serait satisfait par le commentaire
// (`UNE-GARDE-ECRITE-A-COTE-DE-SON-SUJET-LIT-SON-PROPRE-COMMENTAIRE`).
// SEUIL re-mesuré pour CE fichier (0,35 ; le défaut du helper est 0,2) : il est majoritairement du
// commentaire par conception, comme tout ce qui porte une décision produit.
const SOURCE_PANNEAU = readCodeOnly(
    resolve(__dirname, '../../../components/projection/PanneauJour.tsx'),
    'PANNEAU_SECTIONS',
    0.35,
);

describe('[FUTUR-PANNEAU-FIXE] ordre et unicité des sections', () => {
    it('les quatre sections sont là, dans l’ordre choisi par Marc', () => {
        expect(PANNEAU_SECTION_IDS).toEqual(['valeur', 'flux', 'comptes', 'mouvements']);
    });

    it('chaque section porte un libellé et une phrase d’aide non vides', () => {
        for (const s of PANNEAU_SECTIONS) {
            expect(s.label.trim().length, `libellé vide pour ${s.id}`).toBeGreaterThan(0);
            expect(s.aide.trim().length, `aide vide pour ${s.id}`).toBeGreaterThan(0);
        }
    });

    /**
     * ⚠️ LE CŒUR DE LA GARDE. On ne compare pas deux listes — on vérifie qu'il n'y en a qu'UNE :
     * les deux rendus DÉRIVENT de `PANNEAU_SECTIONS`. Une garde qui comparerait une liste de
     * colonnes à une liste d'onglets serait satisfaite par deux copies identiques… jusqu'au lot
     * qui n'en touche qu'une.
     */
    it('les DEUX rendus (colonnes PC, onglets téléphone) dérivent de la MÊME liste', () => {
        const derivations = SOURCE_PANNEAU.match(/PANNEAU_SECTIONS\.map\(/g) ?? [];
        expect(derivations.length, 'les deux rendus doivent mapper PANNEAU_SECTIONS').toBeGreaterThanOrEqual(2);
    });

    it('aucun identifiant de section n’est écrit À LA MAIN dans le rendu', () => {
        // Un littéral `'valeur'` / `'flux'` / … dans le JSX signifierait qu'un rendu a recommencé
        // sa propre liste — le retour exact du défaut que la source unique existe pour empêcher.
        for (const id of PANNEAU_SECTION_IDS) {
            expect(SOURCE_PANNEAU, `l'identifiant « ${id} » est écrit en dur dans le rendu`)
                .not.toMatch(new RegExp(`['"\`]${id}['"\`]\\s*[,:)\\]]`));
        }
    });

    // ⚠️ ANTI-VACUITÉ : les deux assertions ci-dessus sont des ABSENCES ou des comptes, donc
    // satisfaites par un fichier vide, renommé, ou décommenté à tort. Ces témoins exigent que le
    // scan lise bien le panneau — et le témoin NÉGATIF, qu'il l'ait bien décommenté.
    it('le scan lit bien le code du panneau', () => {
        expect(SOURCE_PANNEAU).toContain('RENDU_SECTION');
        expect(SOURCE_PANNEAU).toContain('SubTabs');
        expect(SOURCE_PANNEAU).not.toContain('ce que tu regardes en premier');
    });

    it('chaque section de la liste a bien un rendu câblé', () => {
        // ⚠️ DÉRIVÉE de la liste, jamais recopiée : une garde qui énumérerait les quatre clés à la
        // main serait muette sur la cinquième qu'un lot futur ajouterait.
        for (const id of PANNEAU_SECTION_IDS) {
            expect(SOURCE_PANNEAU, `pas de rendu câblé pour la section « ${id} »`)
                .toMatch(new RegExp(`\\b${id}:\\s*\\(`));
        }
    });
});
