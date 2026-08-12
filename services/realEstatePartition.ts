// services/realEstatePartition.ts
//
// [REFONTE-NAV-L3] Split immo « Configurations = ce que j'AI » / « Vie = ce que je PRÉVOIS ».
// `realEstateGoals` (store) reste UNE SEULE tranche — le moteur de projection la consomme
// à l'identique (aucune migration, aucun bump de version). Ce helper PUR partitionne pour
// l'UI seulement : la page Immobilier (Config) montre les biens DÉTENUS, la page Projets
// immo (Vie) montre les achats FUTURS.
//
// Sémantique de « détenu aujourd'hui » (alignée sur le moteur, pastPurchaseInit.ts) :
//  - `purchaseDate` lisible et passée OU du mois courant (granularité MOIS, même convention
//    que `monthsSince` : le moteur traite un achat du mois courant comme déjà fait) → bien ACTUEL ;
//  - `purchaseDate` lisible et future → PROJET ;
//  - `purchaseDate` absente/illisible : seul un FAIT explicite de détention compte —
//    `currentValue > 0` (même convention que `presentEquityOfGoal`) → ACTUEL, sinon PROJET
//    (le moteur le traite comme un achat à faire).
//  - `isActive` est VOLONTAIREMENT ignoré : il gouverne l'inclusion dans la simulation,
//    pas la détention. Un bien passé désactivé reste un bien (affiché inactif), pas un projet.

import type { RealEstateGoal } from '../types';
import { monthsSince } from './projection/pastPurchaseInit';

export interface RealEstateGoalsPartition {
    /** Biens détenus aujourd'hui (photo du présent — page Immobilier, destination Config). */
    actual: RealEstateGoal[];
    /** Projets d'achat futurs (plans — page Projets immo, destination Vie). */
    future: RealEstateGoal[];
}

/** Réplique le critère de lisibilité de `monthsSince` (YYYY-MM…) SANS déclencher son log d'anomalie. */
const hasReadableMonth = (d: string | undefined | null): boolean => {
    if (!d || typeof d !== 'string' || d.length < 7) return false;
    return !Number.isNaN(parseInt(d.slice(0, 4), 10)) && !Number.isNaN(parseInt(d.slice(5, 7), 10));
};

/** Le bien est-il détenu aujourd'hui ? (voir la sémantique en tête de fichier) */
export function isOwnedToday(goal: RealEstateGoal, now: Date = new Date()): boolean {
    if (hasReadableMonth(goal.purchaseDate)) {
        return monthsSince(goal.purchaseDate, now) >= 0;
    }
    const explicitValue = Number(goal.currentValue);
    return Number.isFinite(explicitValue) && explicitValue > 0;
}

/**
 * Partition pure et stable (ordre du store préservé, aucun objet muté, union = entrée).
 * `now` injectable pour des tests déterministes.
 */
export function partitionRealEstateGoals(
    goals: RealEstateGoal[],
    now: Date = new Date(),
): RealEstateGoalsPartition {
    const actual: RealEstateGoal[] = [];
    const future: RealEstateGoal[] = [];
    for (const goal of goals ?? []) {
        (isOwnedToday(goal, now) ? actual : future).push(goal);
    }
    return { actual, future };
}
