// services/realEstatePartition.ts
//
// [REFONTE-NAV-L3] Split immo « Configurations = ce que j'AI » / « Vie = ce que je PRÉVOIS ».
// `realEstateGoals` (store) reste UNE SEULE tranche — le moteur de projection la consomme
// à l'identique (aucune migration, aucun bump de version). Ce helper PUR partitionne pour
// l'UI seulement : la page Immobilier (Config) montre les biens DÉTENUS, la page Projets
// immo (Vie) montre les achats FUTURS.
//
// Sémantique de « détenu aujourd'hui » — PROUVÉE contre le CODE du moteur, jamais contre un
// commentaire (classe DOC-STALE-IMPOSSIBILITY : la version d'origine de cet en-tête affirmait
// l'alignement inverse, et la partition mentait de ~500 k$ sur un bien du mois courant) :
//  - `projection.ts:182` n'initialise un bien comme DÉJÀ acheté que si
//    `getMonthOffset(purchaseDate) < 0` — STRICT ;
//  - `presentEquityOfGoal` (`projection/pastPurchaseInit.ts`) ne reconstruit l'équité présente
//    que si `monthsSincePurchase > 0` — STRICT ;
//  - et `getMonthOffset === -monthsSince` : mêmes champs `YYYY-MM`, et l'origine de la projection
//    est le MOIS COURANT (`useSimulationParams` : `startYear/startMonth` = year/month d'aujourd'hui).
//  ⇒ un achat daté du MOIS COURANT n'est PAS détenu pour le moteur : c'est encore un achat à faire
//    (mise de fonds + taxe de bienvenue à débiter). L'UI doit dire la MÊME chose.
//
// D'où :
//  - `purchaseDate` lisible et STRICTEMENT antérieure au mois courant (`monthsSince > 0`) → ACTUEL ;
//  - `purchaseDate` du mois COURANT ou future → PROJET ;
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
    // Élément nul/absent dans la tranche : jamais une détention par défaut (le moteur, lui,
    // le filtre en amont — `filter(g => !!g)`).
    if (!goal) return false;
    if (hasReadableMonth(goal.purchaseDate)) {
        // STRICT : `> 0` et pas `>= 0`. Un achat du mois courant vaut `getMonthOffset === 0`
        // côté moteur → `purchaseOffset < 0` est FAUX → le bien n'est PAS détenu.
        return monthsSince(goal.purchaseDate, now) > 0;
    }
    const explicitValue = Number(goal.currentValue);
    return Number.isFinite(explicitValue) && explicitValue > 0;
}

/**
 * Partition pure et stable (ordre du store préservé, aucun objet muté, union = entrée
 * aux ÉLÉMENTS NULS près — voir ci-dessous). `now` injectable pour des tests déterministes.
 *
 * Un élément `null`/`undefined` DANS le tableau (tranche persistée corrompue) est ÉCARTÉ des deux
 * moitiés, exactement comme le moteur se défend (`projection.ts` : `filter(g => !!g)`). Avant cette
 * garde, un seul trou faisait planter le rendu des deux pages (page blanche) alors que la
 * projection, elle, continuait de tourner.
 */
export function partitionRealEstateGoals(
    goals: RealEstateGoal[],
    now: Date = new Date(),
): RealEstateGoalsPartition {
    const actual: RealEstateGoal[] = [];
    const future: RealEstateGoal[] = [];
    for (const goal of goals ?? []) {
        if (!goal) continue;
        (isOwnedToday(goal, now) ? actual : future).push(goal);
    }
    return { actual, future };
}
