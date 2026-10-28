// components/future/panneauSections.ts
// [FUTUR-PANNEAU-FIXE] Les QUATRE sections du panneau du jour — leur identité, leur libellé et
// surtout leur ORDRE, en un seul endroit.
//
// ⚠️ POURQUOI UNE SOURCE UNIQUE PLUTÔT QUE DEUX LISTES. Le panneau se rend de deux façons — en
// COLONNES sur PC, en ONGLETS sur téléphone (choix de Marc, 2026-09-18). Écrites séparément, les
// deux listes divergeraient au premier lot qui touche l'une : un utilisateur de téléphone verrait
// un autre ordre, voire une section de moins, sans que rien ne rougisse. C'est exactement le
// défaut que `UN-LOT-QUI-AJOUTE-UNE-SERIE-DOIT-L-AJOUTER-PARTOUT-OU-LE-GRAPHE-EST-REPRESENTE` a
// coûté la veille sur la table `sr-only` du graphe.
//
// ⚠️ L'ORDRE EST UNE DÉCISION DE MARC, pas une préférence d'implémentation (question posée en
// clic le 2026-09-18, option retenue « Net → flux → comptes → mouvements ») : du plus AGRÉGÉ au
// plus DÉTAILLÉ — le chiffre qui résume d'abord, puis de quoi le décomposer. Le réordonner sans
// le lui redemander, c'est défaire une réponse.
//
// ⚠️ AUCUNE SECTION NE SE SUPPRIME. Interrogé sur « ce que tu regardes en premier », Marc a coché
// les QUATRE propositions — donc le problème qu'il décrit (« trop de choses, je cherche le chiffre
// que je veux ») est un problème d'ORGANISATION, pas de volume. Retirer une section pour « épurer »
// répondrait à une question qu'il n'a pas posée.
import type { IconName } from '../ui/Icon';

export type SectionPanneauId = 'valeur' | 'flux' | 'comptes' | 'mouvements';

export interface SectionPanneauDef {
    id: SectionPanneauId;
    /** Titre de la colonne (PC) ET libellé de l'onglet (téléphone) — le MÊME mot des deux côtés. */
    label: string;
    icon: IconName;
    /** La question à laquelle la section répond, en une phrase. Sert de `title` sur PC. */
    aide: string;
}

export const PANNEAU_SECTIONS: readonly SectionPanneauDef[] = [
    {
        id: 'valeur',
        label: 'Valeur nette',
        icon: 'chart',
        aide: 'Ce que tu vaux ce jour-là, et de combien ça a bougé depuis la veille.',
    },
    {
        id: 'flux',
        label: 'Entrées / sorties',
        icon: 'cash',
        aide: 'Ce qui rentre (paye, rentes, loyers) et ce qui sort (dépenses, impôts) sur ce point.',
    },
    {
        id: 'comptes',
        label: 'Par compte',
        icon: 'portfolio',
        aide: 'La valeur de chaque compte, et la dette qui se retranche — la somme doit redonner la valeur nette.',
    },
    {
        id: 'mouvements',
        label: 'Ce jour-là',
        icon: 'transactions',
        aide: 'Les mouvements réellement datés ce jour-là, et les événements du moment.',
    },
];

/** Les identifiants dans l'ordre — pour le clavier du bandeau d'onglets et pour les gardes. */
export const PANNEAU_SECTION_IDS: readonly SectionPanneauId[] = PANNEAU_SECTIONS.map((s) => s.id);
