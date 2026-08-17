// services/history/monthCategories.ts
// [FUTUR-DETAIL-CATEGORIES-MOIS] Les dépenses d'un MOIS PASSÉ, ventilées par CATÉGORIE.
//
// Demande de Marc (2026-08-17) : « je veux la catégorie de chaque, pour le mois aussi, selon ce
// qu'il y a dans Transactions ». Périmètre resserré par lui : **le passé uniquement**.
//
// ⚠️ POURQUOI LE PASSÉ SEULEMENT, et pourquoi c'est structurel. Un mois FUTUR n'a aucune
// transaction : le moteur applique des POSTES BUDGÉTAIRES et répartit. Il n'y a donc pas de
// « catégorie de chaque dépense » à montrer — en fabriquer une serait présenter du projeté comme
// du constaté, ce que `no-fake-data` interdit. Ce module ne lit QUE des transactions réelles.
//
// ⚠️ MÊME BASE D'EXCLUSION que `dailyPastLedger` et `transactionsOnDay` (`isDuplicate` = artefact
// d'import, `isTransfer` = neutre au patrimoine). Sans ça, le total par catégorie ne collerait pas
// à la courbe ni à la liste du jour — trois surfaces, trois chiffres, aucune vérité.
//
// ⚠️ MAIS PAS LA MÊME BASE DE DATE, et ce module l'affirmait à tort. La courbe exige une date
// COMPLÈTE (`length >= 10`) — elle doit placer chaque montant sur un JOUR, et range les dates au
// mois seul dans `undatedTotal`. Ici, une vue MENSUELLE n'a pas ce besoin : `length >= 7` suffit,
// et exclure une dépense datée « 2026-08 » la ferait disparaître d'une ventilation du mois d'août
// où elle a bel et bien sa place. Écart MESURÉ : 100 $ datés au jour + 2 000 $ datés au mois →
// catégories 2 100 $, courbe 100 $. L'inclusion est le bon choix ; c'était le commentaire qui
// mentait, et un commentaire faux sur une base de calcul se propage.
import type { Transaction } from '../../types';

export interface CategoryTotal {
    categorie: string;
    /** Somme des SORTIES de la catégorie, en valeur POSITIVE (convention `Expenses` du moteur). */
    montant: number;
    /** Nombre de transactions agrégées — une catégorie à 1 ligne ne se lit pas comme une à 40. */
    nombre: number;
}

export interface MonthCategoriesResult {
    /** Catégories de DÉPENSE, triées par montant décroissant (la plus lourde d'abord). */
    depenses: CategoryTotal[];
    /**
     * Σ de TOUTES les dépenses du mois — y compris celles sans catégorie.
     *
     * ⚠️ Ce commentaire disait l'INVERSE (« Σ des dépenses ventilées — doit égaler le total des
     * `depenses` »). C'était faux : le total est incrémenté AVANT le test de catégorie. À l'écran,
     * l'en-tête montrait donc un total supérieur à la somme des lignes, sans que l'écart soit dit
     * autrement qu'en NOMBRE de transactions — un mois à 3 000 $ dont 800 $ non classés affichait
     * « −3 000 $ » au-dessus de lignes qui font −2 200 $, la soustraction laissée à Marc.
     * Le total inclut bien tout (l'argent EST sorti) ; c'est `montantSansCategorie` qui referme
     * l'écart, exposé comme une LIGNE et jamais comme une catégorie « Autre » inventée.
     */
    totalDepenses: number;
    /** Nombre de transactions de dépense sans catégorie exploitable. */
    sansCategorie: number;
    /** Σ des dépenses sans catégorie. `Σ(depenses) + montantSansCategorie === totalDepenses`. */
    montantSansCategorie: number;
}

const VIDE: MonthCategoriesResult = { depenses: [], totalDepenses: 0, sansCategorie: 0, montantSansCategorie: 0 };

/**
 * Ventile par catégorie les DÉPENSES du mois `monthIso` (`YYYY-MM`).
 *
 * ⚠️ Les ENTRÉES sont exclues : « catégorie de chaque dépense » ne mélange pas une paie avec une
 * épicerie. Les mettre dans le même tableau produirait des totaux qui s'annulent et une lecture
 * fausse (une catégorie « salaire » à −4 000 $ ferait passer un revenu pour une dépense).
 */
export function monthCategories(
    transactions: ReadonlyArray<Transaction> | null | undefined,
    monthIso: string | null | undefined,
): MonthCategoriesResult {
    if (!transactions || !monthIso || monthIso.length < 7) return VIDE;
    const mois = monthIso.slice(0, 7);

    const parCategorie = new Map<string, { montant: number; nombre: number }>();
    let totalDepenses = 0;
    let sansCategorie = 0;
    let montantSansCategorie = 0;

    for (const t of transactions) {
        // `length < 7` : un mois suffit ici (contrairement au jour, qui exige une date complète).
        if (!t?.date || t.date.length < 7 || !Number.isFinite(t.amount)) continue;
        if (t.date.slice(0, 7) !== mois) continue;
        if (t.isDuplicate || t.isTransfer) continue;
        if (t.amount >= 0) continue; // entrée : hors sujet, voir le commentaire ci-dessus

        const montant = Math.abs(t.amount);
        totalDepenses += montant;

        const cat = typeof t.category === 'string' ? t.category.trim() : '';
        if (!cat) {
            // ⚠️ COMPTÉ, pas fondu dans une catégorie « Autre » inventée : une dépense sans
            // catégorie est un fait sur les DONNÉES de Marc (import à classer), pas une catégorie.
            // La ranger sous un nom fabriqué la rendrait invisible en tant que problème.
            sansCategorie += 1;
            montantSansCategorie += montant;
            continue;
        }
        const slot = parCategorie.get(cat) ?? { montant: 0, nombre: 0 };
        slot.montant += montant;
        slot.nombre += 1;
        parCategorie.set(cat, slot);
    }

    const depenses = [...parCategorie.entries()]
        .map(([categorie, v]) => ({ categorie, montant: v.montant, nombre: v.nombre }))
        // Tri par montant DÉCROISSANT : ce que Marc cherche, c'est où part son argent.
        // Départage par nom pour un ordre STABLE — sinon deux catégories à égalité peuvent
        // s'échanger d'un rendu à l'autre, ce qui donne l'illusion que les données bougent.
        .sort((a, b) => (b.montant - a.montant) || a.categorie.localeCompare(b.categorie, 'fr'));

    return { depenses, totalDepenses, sansCategorie, montantSansCategorie };
}
