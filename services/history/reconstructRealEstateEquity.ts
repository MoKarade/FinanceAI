// services/history/reconstructRealEstateEquity.ts
// G22-B1 — reconstruit l'ÉQUITÉ immobilière passée (valeur − solde hypothécaire)
// pour chaque propriété déjà possédée, par année civile.
//
// Réutilise runAmortization (services/realEstate.ts) : même amortissement +
// appréciation que le moteur, donc cohérent avec la projection. Granularité
// annuelle (suffisant pour le préfixe passé du graphe). PUR & testable.
//
// Avant la date d'achat → la propriété n'existe pas (équité 0, naturellement
// absente de la map). On ne traite que les propriétés actives achetées <= aujourd'hui.

import { runAmortization } from '../realEstate';
import type { RealEstateGoal } from '../../types';

/** Équité totale (toutes propriétés confondues) par année civile passée. */
export type EquityByYear = Map<number, number>;

const yearOf = (isoDate: string): number => parseInt(isoDate.slice(0, 4), 10);

/**
 * @param properties  objectifs immobiliers (on ne garde que les actifs déjà achetés).
 * @param currentYear année courante (borne supérieure).
 * @returns map annéeCivile → équité totale (somme sur les propriétés possédées cette année).
 */
export function reconstructRealEstateEquityByYear(
    properties: ReadonlyArray<RealEstateGoal>,
    currentYear: number = new Date().getFullYear(),
): EquityByYear {
    const byYear: EquityByYear = new Map();
    if (!properties || properties.length === 0) return byYear;

    for (const p of properties) {
        // [ENG-PAST-OWNED-VS-PLANNED] (A6) : un objectif déclaré NON réalisé (`isOwned: false`)
        // n'a jamais existé — aucune équité passée à reconstruire (sinon le préfixe passé de la
        // courbe Futur affichait l'équité d'un achat qui n'a pas eu lieu : marche de 67 472 $
        // mesurée au raccord passé→présent sur la fixture du lot). `undefined`/`true` = legacy.
        if (p.isActive === false || !p.purchaseDate || p.isOwned === false) continue;
        const purchaseYear = yearOf(p.purchaseDate);
        if (!Number.isFinite(purchaseYear) || purchaseYear > currentYear) continue; // achat futur → ignoré ici

        const { data } = runAmortization({
            price: p.price,
            downPayment: p.downPayment,
            rate: p.mortgageRate,
            amortization: p.amortization,
            // `||` voulu, aligné sur le moteur ([ENG-RENEWAL-SAISIE]) : un ≤ 0 (champ vidé →
            // `Number('')` = 0) est une ABSENCE de saisie, pas un renouvellement à 0 %.
            renewalRate: p.renewalRateProjection || p.mortgageRate,
            propertyGrowthRate: p.propertyGrowthRate ?? 3,
            initialRenovations: p.initialRenovations ?? 0,
            yearlyRenovations: p.yearlyRenovations ?? 0,
            maxValue: p.maxValue ?? 0,
            startYear: purchaseYear,
        });

        // Année d'achat : équité ≈ mise de fonds (avant le 1er point annuel d'amortissement).
        // ⚠️ Ce `Math.max(0, …)`-ci RESTE : c'est un garde-fou d'ENTRÉE (une mise de fonds négative
        // est une donnée corrompue, pas un bien underwater) — rien à voir avec le clamp d'équité
        // retiré par [IMMO-CLAMP-EQUITE-NEGATIVE] dans `addEquity` ci-dessous.
        addEquity(byYear, purchaseYear, Math.max(0, p.downPayment), currentYear);
        for (const point of data) {
            if (point.calendarYear > currentYear) break;
            addEquity(byYear, point.calendarYear, point.Equite, currentYear);
        }
    }
    return byYear;
}

function addEquity(map: EquityByYear, year: number, equity: number, currentYear: number): void {
    if (year > currentYear) return;
    // [IMMO-CLAMP-EQUITE-NEGATIVE] Plus de `Math.max(0, equity)` ici : le clamp vivait en DEUX
    // endroits (le producteur `runAmortization` ET ce consommateur), et retirer un seul des deux
    // n'aurait rien changé à l'écran — c'est le piège que le ticket avait nommé d'avance. La somme
    // par année reste juste avec un déficit : underwater −30 k$ + autre bien +100 k$ = 70 k$, là où
    // le double clamp affichait 100 k$.
    map.set(year, (map.get(year) ?? 0) + equity);
}
